# NF01-02 — Layer 1 Device Physics Model (`src/physics/device.ts`)

The heart of phase 1: a compact, closed-form transistor model that redraws
Id–Vg curves in real time and is faithful *in trend and order of magnitude*
(see reference plan, Layer 1 and Caveats). Everything below is implemented
test-first; the test tables are the specification.

## 1. Physical anchors (fidelity rule)

These real numbers calibrate and bound the model. Each becomes an **anchor
test** and a codex entry:

| Anchor | Value | Where it binds |
|---|---|---|
| Boltzmann subthreshold limit | SS ≥ (kT/q)·ln10 ≈ **59.6 mV/dec at 300 K** | `subthresholdSwing` floor; long-channel limit |
| "5nm" node gate length | ~**18 nm** (IRDS 2021; the node name is marketing) | level params; calibration point |
| GAA nanosheet stack | **3–4 sheets**, drive ∝ effective width | `effectiveWidth` |
| Architecture roadmap | electrostatic control: planar < FinFET < GAA | scale-length gate factor |
| DIBL/SS degradation | grow ~exponentially as Lg shrinks vs. scale length | `exp(−Lg/(2λ))` form |
| Gate oxide tunneling | leakage grows ~exponentially as oxide thins (~10× per few Å of SiO₂) | `gateLeakage` |
| Healthy logic device | Ion/Ioff ≥ ~10⁴–10⁶ at Vdd 0.65–0.75 V | level targets; sanity tests |

Model simplifications (stated in doc comments and in-game): EKV-flavored
long-channel core with SS/DIBL from a scale-length fit — not TCAD; no
quantum confinement shift, no self-heating, no mobility degradation model
beyond a fixed velocity-saturation knee; variability deferred to M2.

## 2. Types (plain data, SI units)

```ts
export type Architecture = 'planar' | 'finfet' | 'gaa';

/** Player-controllable device configuration. All SI units. */
export interface DeviceParams {
  arch: Architecture;
  gateLength_m: number;     // Lg. Playable range 10e-9 … 1e-6
  eot_m: number;            // equivalent oxide thickness, 0.5e-9 … 3e-9
  bodyThickness_m: number;  // channel/fin/sheet thickness t_body, 3e-9 … 20e-9
  sheetWidth_m: number;     // nanosheet or fin width, 5e-9 … 50e-9
  nStack: number;           // sheets (GAA) or fins (FinFET); 1 for planar
  vth0_V: number;           // long-channel threshold, 0.15 … 0.5
  vdd_V: number;            // supply, 0.4 … 1.2
  temperature_K: number;    // default 300
}

/** Derived electrostatic quality of the geometry. */
export interface Electrostatics {
  scaleLength_m: number;    // λ
  ss_VperDec: number;       // subthreshold swing (V/dec; UI shows mV/dec)
  dibl_VperV: number;       // ΔVth per ΔVds
}

/** Figures of merit the game scores on. */
export interface DeviceMetrics {
  ion_A: number;            // Id at Vg=Vds=Vdd (absolute, all fingers)
  ioff_A: number;           // total off current at Vg=0, Vds=Vdd
  ionOverIoff: number;
  ss_VperDec: number;
  dibl_VperV: number;
  leakagePower_W: number;   // ioff_A * vdd_V
  gateLeakage_A: number;
  gidl_A: number;
}
```

## 3. Model equations

### 3.1 Electrostatics — `electrostatics(p: DeviceParams): Electrostatics`

Scale-length ansatz (standard multi-gate scale-length theory, simplified):

```
λ = sqrt( (ε_si / ε_ox) · t_body · eot / g(arch) )
g = 1 (planar) | 2 (finfet) | 3 (gaa)        // gates wrapping the channel
u = exp( −Lg / (2λ) )                        // short-channel severity, 0…1
SS   = φt·ln10 · (1 + α_ss · u)              // φt = kT/q
DIBL = α_dibl · u                            // V per V
```

Constants `α_ss`, `α_dibl` are calibrated by the tests in §5.1 (start with
α_ss = 4, α_dibl = 1.2 and tune until the calibration table passes; then
freeze into golden fixtures).

### 3.2 Effective width — `effectiveWidth(p): number`

```
planar : W = sheetWidth
finfet : W = nStack · (2·t_body + sheetWidth)      // 3-sided gate perimeter
gaa    : W = nStack · 2·(t_body + sheetWidth)      // full perimeter per sheet
```

This is GAA's drive advantage: width scales with the stack, not the footprint.

### 3.3 Drain current — `drainCurrent(p, vg_V, vds_V): number` (A)

EKV-flavored single-piece expression (smooth from subthreshold to strong
inversion, no if/else seams — important for slider feel):

```
n    = SS / (φt·ln10)                        // ideality from electrostatics
Vth  = vth0 − DIBL·vds
q(v) = ln(1 + exp(v))                        // softplus
i∝   = q( (vg − Vth) / (n·φt) )²             // forward channel charge
Id   = Ispec · i∝ · sat(vds)
Ispec = k0 · (W / Lg) · n · φt²              // k0: fixed process transconductance
sat(vds) = tanh(vds / vdsat)                 // velocity-saturation knee, vdsat ≈ 0.3 V
```

Numerical hygiene: softplus must be overflow-safe (`v > 40 → v`), and
`drainCurrent` must be finite and ≥ 0 over the whole playable box (tested).

### 3.4 Leakage — `gateLeakage(p)`, `gidl(p)` (A)

```
gateLeakage = J0 · exp(−eot / t0) · A_gate        // direct tunneling
              anchor: ~10× per ~0.25 nm of EOT ⇒ t0 = 0.25e-9/ln10
gidl        = W · A_g · E · exp(−B_g / E),  E = (vdd + vth0) / (3·eot)
              (band-to-band tunneling at the drain overlap, Hurkx-style form)
```

Constants (`J0`, `A_g`, `B_g`) are game-calibrated so that at "5nm-like"
geometry gate leakage sits ~2–3 decades below Ioff-subthreshold until EOT
drops below ~0.8 nm, at which point it takes over — reproducing why HKMG
happened (anchor test 5.2-e).

### 3.5 Metrics — `deviceMetrics(p): DeviceMetrics`

```
ion   = drainCurrent(p, vdd, vdd)
isub  = drainCurrent(p, 0, vdd)
ioff  = isub + gateLeakage + gidl
```

Plus `idVgCurve(p, vds, {from, to, points}): Array<{vg_V, id_A}>` for the
plot (pure; the renderer just draws it).

## 4. Test plan (write these first)

Files: `tests/physics/device.test.ts`, fixtures in `tests/fixtures/device/`.
Shared helpers: `tests/helpers/devices.ts` exporting named reference
configurations:

- `LONG_CHANNEL`: planar, Lg = 1 µm, EOT = 2 nm — the textbook device.
- `N5_GAA`: gaa, Lg = 18 nm, EOT = 0.9 nm, t_body = 5 nm, W = 25 nm,
  nStack = 3, vth0 = 0.25 V, Vdd = 0.7 V — the "5nm-like" hero device.
- `N5_PLANAR`, `N5_FINFET`: same dimensions, other architectures.

### 5.1 Electrostatics

| ID | Test | Assertion |
|---|---|---|
| E1 | Boltzmann floor (anchor) | `LONG_CHANNEL` SS = 59.6 mV/dec ± 0.5; **every** device in a random sweep of the playable box has SS ≥ 59.5 mV/dec |
| E2 | Temperature scaling (anchor) | SS(350 K)/SS(300 K) ≈ 350/300 ± 1% for `LONG_CHANNEL` |
| E3 | Long-channel DIBL | `LONG_CHANNEL` DIBL < 1 mV/V |
| E4 | Lg monotonicity | SS and DIBL strictly increase as Lg steps 30→10 nm (fixed rest) |
| E5 | Architecture ordering (anchor: roadmap) | at N5 dimensions: SS(planar) > SS(finfet) > SS(gaa); same for DIBL |
| E6 | Body-thickness lever | thinning t_body 10→5 nm improves (reduces) SS and DIBL |
| E7 | Calibration window | `N5_GAA`: SS ∈ [62, 75] mV/dec, DIBL ∈ [20, 80] mV/V; `N5_PLANAR`: SS > 90 mV/dec, DIBL > 150 mV/V (planar died for a reason) |
| E8 | Golden curve | SS & DIBL vs. Lg ∈ {10…30 nm} × 3 archs matches `fixtures/device/electrostatics.json` |

### 5.2 Currents & leakage

| ID | Test | Assertion |
|---|---|---|
| C1 | Subthreshold slope self-consistency | numeric slope of log10(Id) vs Vg (Vg ≪ Vth) equals `electrostatics().ss_VperDec` ± 2% |
| C2 | Off/on sanity | `N5_GAA`: Ion/Ioff ∈ [10⁴, 10⁷]; Ion/W ∈ [100, 2000] µA/µm (order-of-magnitude window, not a measured claim) |
| C3 | Smoothness | Id(vg) strictly increasing; finite, ≥ 0, no NaN over 10k random points of the playable box (property test) |
| C4 | DIBL moves Vth, not just Ioff | Id(vg, vds=Vdd) / Id(vg, vds=50 mV) in subthreshold ≈ 10^(DIBL·ΔVds/SS) ± 10% |
| C5 | Drive scaling (anchor: GAA stacking) | Ion(nStack=4)/Ion(nStack=2) ≈ Weff ratio ± 1% |
| C6 | Gate leakage exponent (anchor) | gateLeakage(EOT−0.25 nm)/gateLeakage(EOT) ≈ 10× ± 20% |
| C7 | Leakage crossover (anchor: why HKMG) | at `N5_GAA` geometry: EOT = 1.2 nm ⇒ gate leakage < 10% of Ioff; EOT = 0.6 nm ⇒ gate leakage > 50% of Ioff |
| C8 | GIDL trend | gidl increases with vdd and with thinner EOT |
| C9 | Vdd lever | Ion(0.9 V) > Ion(0.7 V); leakagePower(0.9 V) > leakagePower(0.7 V) (the dark-silicon tension exists) |
| C10 | Golden curves | full Id–Vg at vds ∈ {50 mV, Vdd} for the 4 reference devices matches `fixtures/device/idvg.json` (rel. tol 1e-9) |

### 5.3 The playable trade-off (integration-level, still pure)

| ID | Test | Assertion |
|---|---|---|
| T1 | Level 3 is winnable | exists a `N5_GAA`-box config with SS ≤ 65 mV/dec (search over grid; guards level solvability) |
| T2 | The wall is real | **no** config in the entire playable box beats 59.5 mV/dec (duplicate of E1 sweep, kept as an explicit named test — it *is* the lesson) |
| T3 | No free lunch | within the N5 box, the config maximizing Ion does not also minimize leakagePower (forces a real optimization in l1-06) |

## 5. Task breakdown

- **NF1-1 (red→green)**: types + `electrostatics` + `effectiveWidth`; tests
  E1–E7. Calibrate α constants; then add E8 golden fixture.
- **NF1-2**: `drainCurrent`, `gateLeakage`, `gidl`; tests C1–C9.
- **NF1-3**: `deviceMetrics`, `idVgCurve`; tests C10, T1–T3; regenerate/commit
  all golden fixtures; fidelity doc comments finalized.

Fixture generation: a small script `tests/fixtures/device/generate.ts` run via
`npx tsx` (or a vitest "update" flag pattern) — fixtures are committed, never
generated in CI.
