# NanoFab: A Physics-Faithful Chip-Design Puzzle/Sandbox Game — Physics Investigation & Game Design Plan

## TL;DR
- The dominant physics at ≤5nm nodes, ordered from the transistor outward, are: (1) electrostatic short-channel control and quantum tunneling driving the move to Gate-All-Around nanosheets; (2) interconnect RC delay and copper resistivity blow-up forcing new metals and backside power; (3) EUV lithography physics dominated by stochastic photon shot noise and the RLS "triangle of death"; and (4) machine-level wafer-stage jerk/settling that trades throughput against overlay/focus accuracy. A faithful game must model all four as coupled trade-offs, not isolated puzzles.
- No existing game (KOHCTPYKTOP, Silicon Zeroes, Turing Complete, SHENZHEN I/O) models real nanoscale physics — they teach Boolean logic and layout topology only. The clear market gap is a technically faithful, quantitative simulator that teaches actual device/litho/fab physics with real numbers, which is exactly what an engineer/student audience wants.
- The game is feasible on the Galaxy Tab S8 (Snapdragon 8 Gen 1 / Adreno 730) as an offline vanilla-TypeScript + Vite + Canvas/WebGL PWA: 256×256 FFT-based aerial-image simulation runs comfortably above interactive frame rates on this GPU, and all other models (compact transistor equations, Elmore RC delay, Monte-Carlo stochastics, jerk-limited motion profiles) are lightweight. Build a 4-layer game mirroring the physics, MVP first at the device layer.

## Key Findings

**Physics that matters most, ranked by influence on the design at ≤5nm:**
1. **Electrostatic control is the master variable.** As channel length shrank, the drain began to steal control of the channel from the gate, producing DIBL (drain-induced barrier lowering), threshold-voltage roll-off, and worsening subthreshold slope. This single problem drove the whole architecture roadmap: planar → FinFET (22nm) → GAA nanosheet (3nm/2nm) → forksheet → CFET. The gate wraps ever more fully around the channel to win back control.
2. **The 60 mV/decade Boltzmann limit is a hard wall.** Conventional MOSFETs cannot switch faster than ~60 mV/decade of gate voltage at room temperature because of the Maxwell-Boltzmann carrier distribution. This caps how low supply voltage can go and makes leakage vs. performance a zero-sum fight — the origin of "dark silicon."
3. **Quantum tunneling is always leaking.** Gate-oxide direct tunneling, source-to-drain tunneling, and band-to-band tunneling (GIDL) all inject leakage current that scales worse as dimensions shrink.
4. **Interconnects, not transistors, now dominate delay.** Copper resistivity rises non-linearly below ~20nm linewidth due to grain-boundary and surface scattering, forcing cobalt/ruthenium/molybdenum and backside power delivery.
5. **EUV printing is probabilistic.** At 13.5nm wavelength with few photons per feature, printing is governed by Poisson shot noise and resist stochastics — the industry now fights random bridging/breaking defects, not just resolution.
6. **The scanner is a mechatronic marvel where jerk limits money.** Wafer stages accelerate at several g with sub-nm positioning; jerk/settling limits determine throughput and overlay/focus error.

## Details

---
## PART I — THE PHYSICS INVESTIGATION (innermost → outermost)

### Layer 1 — Transistor / Device Physics (≤5nm)

**Short-channel effects and the architecture roadmap.**
In a short-channel device, a high drain bias lowers the source-side potential barrier — this is DIBL (drain-induced barrier lowering). The consequence is that threshold voltage drops with drain voltage, off-state leakage rises, and in the extreme the gate loses all control ("punch-through"). [arxiv](https://arxiv.org/pdf/1407.2358) Subthreshold slope (SS) — the gate-voltage change needed for a 10× change in drain current — degrades from its ideal minimum of 60 mV/decade as channels shrink. [arxiv](https://arxiv.org/pdf/1407.2358) These are the two primary figures of merit for electrostatic control.

The industry's response was a progression of geometries, each wrapping the gate more completely around the channel:
- 1990s: halo/pocket implants to suppress DIBL/punch-through. [All About Circuits](https://www.allaboutcircuits.com/industry-articles/nanoscale-sce-electrostatic-challenges-and-finfet-gaa-mitigation-solutions/)
- 2000s: high-k metal gate (HKMG) at 45nm to cut gate leakage; strain engineering for mobility. [All About Circuits](https://www.allaboutcircuits.com/industry-articles/nanoscale-sce-electrostatic-challenges-and-finfet-gaa-mitigation-solutions/)
- 2010s: FinFET/Tri-Gate at 22nm — gate on three sides. [All About Circuits](https://www.allaboutcircuits.com/industry-articles/nanoscale-sce-electrostatic-challenges-and-finfet-gaa-mitigation-solutions/)
- 2020s: Gate-All-Around (GAA) nanosheets at 3nm/2nm — gate fully surrounds stacked channels, giving maximal electrostatic control and mitigating the fin-base leakage path of FinFETs. [All About Circuits](https://www.allaboutcircuits.com/industry-articles/nanoscale-sce-electrostatic-challenges-and-finfet-gaa-mitigation-solutions/)
- Beyond: forksheet (imec, extends nanosheet toward the A10 node with a dielectric wall between n/p allowing tighter n-p spacing), then CFET (complementary FET, n-MOS stacked vertically on p-MOS, removing n-p spacing from the cell-height budget entirely — imec targets CFET for the A7 node and beyond).

A 2nm-node GAA device typically has a vertical stack of 3–4 suspended silicon nanosheets, each an independent parallel channel; effective width scales as N × (nanosheet width), which is GAA's drive-current advantage over FinFET at the same footprint.

**The 60 mV/decade Boltzmann limit.** The subthreshold swing of conventional MOS devices has a limit of about 60 mV/decade (kT/q) at room temperature, arising from the drift-diffusion transport of carriers [uspto](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11728418) over the thermal Boltzmann tail. Even a perfect-electrostatics FinFET or GAA device can approach but not beat this. [uspto](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11245011) Only fundamentally different devices (tunnel FETs, negative-capacitance ferroelectric FETs) can go "steep-slope" below 60 mV/dec. This limit is why supply voltage (VDD) cannot keep scaling and why leakage is unavoidable. [uspto](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11728418)

**Quantum tunneling.** Gate-oxide direct tunneling (gate leakage), source-to-drain tunneling, and band-to-band tunneling (the source of GIDL, gate-induced drain leakage) all rise as oxide and channel dimensions shrink. HKMG restored a low equivalent-oxide-thickness while keeping physical thickness large enough to suppress tunneling. Quantum confinement in nanosheets/nanowires quantizes the allowed energy states, shifting threshold voltage and, interestingly, reducing threshold-voltage fluctuation from random dopants in some simulations.

**Variability — the enemy of matching.** At these scales, several random processes shift each transistor's threshold voltage independently:
- Random dopant fluctuation (RDF): discrete dopant atoms; count and position vary die-to-die.
- Line-edge roughness (LER): rough gate/fin edges from patterning.
- Work-function variation (WFV): metal-gate grain orientation; simulations of InGaAs GAA MOSFETs with 10/7/5nm grain diameters showed threshold-voltage standard deviations of 52, 41, and 27 mV respectively.
- For junctionless FinFETs, LER+RDF can produce up to 40–60% threshold-voltage fluctuation at the device level; resist-defined FinFETs show up to ~10% Vth fluctuation and up to 200% leakage-current fluctuation at 1nm RMS fin roughness. LER is especially damaging to SRAM static noise margin.
Self-heating is worse in confined GAA/nanowire geometries because the channel is thermally isolated by surrounding dielectric.

**Leakage vs. performance and "dark silicon."** Static (leakage) power now rivals dynamic (switching) power. Dennard scaling — the rule that power density stays constant as transistors shrink — broke down around 2005–2007 because voltage and threshold could no longer scale with dimensions while leakage climbed. [Wikipedia](https://en.wikipedia.org/wiki/Dennard_scaling) The result is the "power wall" and dark silicon: the fraction of a chip that must stay powered off to stay within thermal limits. [Wikipedia](https://en.wikipedia.org/wiki/Dark_silicon) The foundational analysis by Esmaeilzadeh et al., "Dark Silicon and the End of Multicore Scaling" (ISCA 2011), projected dark silicon reaching over 50% at the 8nm node, rising toward ~75% under the more pessimistic ITRS scaling assumptions in the same paper.

**"5nm" is a marketing name.** The term has no physical feature at 5nm. Per the IEEE IRDS 2021 roadmap, the "5nm" node has a gate length of ~18nm, a contacted gate pitch of ~51nm, and a tightest metal pitch of ~30nm. [HandWiki](https://handwiki.org/wiki/Engineering:5_nm_process) (Foundry-reported figures: N5 CPP ~45–50nm, metal pitch ~26–30nm.) [Semiconductor Engineering](https://semiengineering.com/5-3nm-wars-begin/) Node names decoupled from gate length around 2011 [Wikipedia](https://en.wikipedia.org/wiki/5_nm_process) (Intel's 22nm FinFET). [3dincites](https://www.3dincites.com/2020/09/iftle-462-if-not-a-node-then-what/) The two dimensions that actually set logic density are the Contacted Gate Pitch (CGP/CPP, horizontal) and the Cell Height (vertical, set by metal pitch and track count). [Angstronomics](https://www.angstronomics.com/p/the-truth-of-tsmc-5nm) This is a crucial teaching point.

### Layer 2 — Interconnect & Circuit Physics

**Copper resistivity blow-up.** Copper's low bulk resistivity (~1.7 µΩ·cm) depends on its long electron mean free path (~39nm). Below ~20nm linewidth, surface scattering and grain-boundary scattering dominate and resistivity rises non-linearly [arxiv](https://arxiv.org/pdf/2603.29174) — at 10nm width, copper resistivity is roughly an order of magnitude above bulk. [arxiv](https://arxiv.org/pdf/2603.13713) A Georgia Institute of Technology study led by Prof. Azad Naeemi (reported by Semiconductor Engineering) quantified the impact on delay: average copper-resistivity-induced delay rose 7.6% from 45nm→22nm, and is projected to reach 21.8% from 22nm→11nm and 48% from 11nm→7nm — leading Naeemi to warn that "once you get to 11nm, you can't improve the performance... because of the interconnects."

**New metals.** Barrier/liner layers (TaN etc.) don't scale — they consume a growing fraction of a shrinking wire. [arxiv](https://arxiv.org/pdf/2603.29174) Ruthenium scales better (more anisotropic Fermi surface; can run barrier-free/thin-barrier) [Wiley Online Library](https://onlinelibrary.wiley.com/doi/10.1002/sstr.202400638) and crosses below cobalt's resistivity around 20nm thickness; [PatSnap](https://www.patsnap.com/resources/blog/rd-blog/cobalt-ruthenium-rc-delay-reduction-patsnap-eureka/) cobalt has higher diffusion-activation energy allowing thinner barriers; [arxiv](https://arxiv.org/pdf/2603.13713) molybdenum is also a candidate. This is modeled with the Fuchs-Sondheimer (surface) and Mayadas-Shatzkes (grain-boundary) frameworks. [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0169433223011182)

**Backside power delivery (BSPDN).** Moving the power grid to the wafer backside frees the front side for signal routing and cuts IR drop (voltage droop). [Semiconductor Engineering](https://semiengineering.com/backside-power-delivery-creates-fab-tool-thermal-dissipation-barriers/) Intel's PowerVia (first to production, on Intel 18A with RibbonFET; Panther Lake on 18A) [XDA Developers](https://www.xda-developers.com/backside-power-delivery-is-the-cpu-innovation-im-actually-excited-for/) was validated on the "Blue Sky Creek" test chip (Intel 4 + PowerVia, built from Meteor Lake Crestmont E-cores) presented at the June 2023 VLSI Symposium in Kyoto. Intel reported that the E-core designed with PowerVia demonstrated more than 5% frequency improvement and over 90% cell density, with its press materials citing more than 30% platform voltage-droop improvement and a 6% frequency benefit. TSMC's Super Power Rail arrives at A16 (late 2026/2027); Samsung plans backside power at SF2. [Semiconductor Engineering](https://semiengineering.com/backside-power-delivery-creates-fab-tool-thermal-dissipation-barriers/) It requires drilling nano-through-silicon-vias and thinning the wafer from >700µm to 1–3µm. [HotHardware](https://hothardware.com/news/intel-14a2-dual-side-power-rumor) [Semiconductor Engineering](https://semiengineering.com/backside-power-delivery-creates-fab-tool-thermal-dissipation-barriers/)

**Other circuit-level physics.** Electromigration (current-driven metal atom transport → voids/opens), IR drop, capacitive crosstalk between adjacent wires, and thermal dissipation all become first-order. RC delay is modeled with the Elmore delay (first moment of the RC-tree impulse response: sum over the tree of each resistance times its downstream capacitance) [uspto](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/6968306) — simple, an analytical upper bound on 50% delay, [ResearchGate](https://www.researchgate.net/publication/220270978_Fitted_Elmore_Delay_A_Simple_and_Accurate_Interconnect_Delay_Model) and ideal for a game.

**Standard-cell and timing fundamentals (for the circuit puzzle layer).** Logic gates are built from CMOS transistor pairs into standard cells laid in rows of fixed height. Static timing analysis alternates cell arcs (gate delay) and net arcs (wire delay from Elmore RC). Setup and hold checks constrain data relative to the clock; clock distribution (H-trees) and clock skew matter. A 4-transistor NAND2 cell is ~3× CGP wide. [Angstronomics](https://www.angstronomics.com/p/the-truth-of-tsmc-5nm)

### Layer 3 — Lithography & Patterning Physics

**EUV fundamentals.** EUV uses 13.5nm light produced by a laser-produced plasma: a CO2 (or newer 2µm) laser vaporizes tin microdroplets into a 30–50 eV plasma emitting a narrowband 13.5nm line from complex Sn8+–Sn14+ transitions. [arxiv](https://arxiv.org/pdf/1709.02626) Because everything absorbs EUV, the whole system is reflective and in vacuum: Mo/Si multilayer mirrors reflect only ~70% each (theoretical ~74% for 50-pair Mo/Si at 13.5nm), [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S270947232200017X) so a stack of ~10 mirrors loses the vast majority of photons. ASML EUV sources now run >250W with >125 wafers/hour. [arxiv](https://arxiv.org/pdf/2009.10393) Resolution follows the Rayleigh criterion (CD = k1·λ/NA); numerical aperture is 0.33 on current NXE tools. [Techbytes](https://techbytes.app/posts/2nm-high-na-euv-lithography-2026-engineering-deep-dive/)

**High-NA EUV.** ASML's TWINSCAN EXE platform raises NA to 0.55, shrinking minimum resolution from ~13nm to ~8nm and enabling approximately 2.9× higher transistor density in a single exposure (features ~1.7× smaller than the previous generation). Because higher NA at the reticle causes unacceptable shadowing, [ResearchGate](https://www.researchgate.net/publication/300472206_Anamorphic_high-NA_EUV_lithography_optics) High-NA uses anamorphic optics — 4× demagnification in one axis, 8× in the other — which halves the printable field (26 × 16.5 mm), forcing field stitching and faster stages. [ResearchGate](https://www.researchgate.net/publication/299644547_EUV_high-NA_scanner_and_mask_optimization_for_sub-8nm_resolution) [Aminext](https://www.aminext.blog/en/post/high-na-euv-ecosystem-angstrom-era) Depth of focus shrinks significantly, demanding source-mask optimization with sub-resolution assist features. [ResearchGate](https://www.researchgate.net/publication/299644547_EUV_high-NA_scanner_and_mask_optimization_for_sub-8nm_resolution) The production EXE:5200B is priced at approximately $380 million (≈€350 million) and is specified to deliver 175 wafers per hour at 50 mJ/cm² dose with 0.7nm overlay; Intel completed acceptance of its EXE:5200B at its Hillsboro D1X fab in December 2025 for the 14A node.

**Stochastic effects — the probabilistic nature of printing.** EUV has ~14× fewer photons than ArF at the same energy, so photon shot noise (Poisson-distributed) is severe. [nih](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8706712/) Combined with resist chemical stochastics (random acid-generator/quencher positions), this produces line-edge roughness, critical-dimension variation, and stochastic defects: random bridging, breaking, and missing/merging contacts. [Eureka](https://eureka.patsnap.com/article/stochastic-defects-explained-photon-shot-noise-at-euv-wavelengths) Stochastic-induced LER can exceed 20% of CD for sub-20nm features (vs. an 8% target). [Eureka](https://eureka.patsnap.com/report-modeling-photon-shot-noise-and-resist-stochastics-at-13-5-nm) The fundamental fix — more dose — hurts throughput; [Lithoguru](https://lithoguru.com/scientist/litho_papers/2017_LER_Performance_Targets_for_EUV.pdf) this is the resolution-LER-sensitivity (RLS) "triangle of death." [Future-bridge](https://future-bridge.us/the-high-na-euv-moat-is-this-the-end-of-the-level-playing-field/) Edge placement error (EPE) combines CD, overlay, and LER. [Lithoguru](https://lithoguru.com/scientist/litho_papers/2017_LER_Performance_Targets_for_EUV.pdf)

**Multi-patterning.** When one exposure can't resolve the pitch, layers are split: LELE (litho-etch-litho-etch, pitch-splitting via two masks, needs precise overlay), [Iowa State University](https://home.engineering.iastate.edu/~cnchu/pubs/j81.pdf) and spacer-based SADP/SAQP (self-aligned double/quadruple patterning — deposit sidewall spacers around mandrels, then cut). [Eureka](https://eureka.patsnap.com/article/dual-patterning-lithography-explained-lele-vs-sadp-vs-saqp) SAQP reaches pitches down to ~19nm. [Sapphire-substrate](https://www.sapphire-substrate.com/news/what-is-self-aligned-quadruple-patterning-saqp-technology-171640.html) LELE offers 2D flexibility; SADP/SAQP have better overlay but less design freedom. [Sapphire-substrate](https://www.sapphire-substrate.com/news/what-is-self-aligned-quadruple-patterning-saqp-technology-171640.html) SALELE (self-aligned LELE) combines both [EDN](https://www.edn.com/multi-patterning-strategies-for-navigating-the-sub-5-nm-frontier-part-1/) and is used at 5nm. Layout decomposition ("coloring") is the puzzle of assigning features to masks without conflicts.

**OPC and computational lithography.** Because sub-wavelength features print distorted, masks are pre-distorted with optical proximity correction (OPC). Model-based OPC computes the aerial image with the Hopkins equation (partially coherent) or Abbe formulation (source-integrated), couples it to a resist threshold model (Mack), then iteratively adjusts mask-edge fragments to minimize EPE until RMS error falls below ~2nm. Inverse lithography (ILT) treats it as an inverse imaging problem, producing curvilinear masks. [Grokipedia](https://grokipedia.com/page/Optical_proximity_correction) The fast production algorithm decomposes the Hopkins TCC into eigen-kernels via SVD (sum-of-coherent-systems, SOCS) [ADS](https://ui.adsabs.harvard.edu/abs/2008SPIE.7122E..1US/abstract) [arXiv](https://arxiv.org/pdf/2308.12299) — typically 5–20 FFT convolutions. Mask 3D effects and pellicles (dust protection) also matter.

**Resist chemistry.** Chemically amplified resists (CARs) use a photo-acid generator whose acid catalyzes many deprotection reactions (amplification) — sensitive, but acid diffusion blurs the edge (the RLS trade-off). Metal-oxide resists (e.g., tin-oxo clusters) offer higher EUV absorption and resolution.

### Layer 4 — Machine / Mechatronic Physics (the outermost layer)

**Wafer-stage dynamics.** ASML's TWINSCAN is a dual-stage design: while one wafer is exposed, a second is measured/aligned at the metrology station, then they swap — a key throughput innovation. [Substack](https://entropycapital.substack.com/p/asmls-supply-chain-bill-of-materials) The stage floats on magnetic-levitation planar motors (frictionless) and, on the NXT platform, accelerates up to ~5g (higher than a jet fighter takeoff) reaching 1–2 m/s, yet holds positioning better than 2nm. [Substack](https://entropycapital.substack.com/p/asmls-supply-chain-bill-of-materials) Position is measured ~20,000 times/sec by interferometers/encoders accurate to ~60 picometers — smaller than a silicon atom.

**Jerk, snap, and settling — why jerk limits throughput.** The stage follows a trajectory built from acceleration profiles with bounded jerk (rate of change of acceleration) and snap (rate of change of jerk). Excessive jerk excites mechanical resonances and lengthens the settling time before exposure can begin. Trajectory planning trades peak jerk against settling time: aggressive jerk = faster moves but longer settling and vibration; gentle jerk = slower moves but quick settling. This is the direct throughput-vs-accuracy lever the user specifically wanted, and it is a natural mini-game.

**Reticle-stage synchronization.** Because of the 4× reduction ratio, the reticle (mask) stage scans 4× faster than the wafer stage and must stay synchronized to nanometer precision during the scan. In High-NA's anamorphic system the reticle moves 8× faster in one axis.

**Focus/leveling and environment.** A focus/leveling servo keeps the wafer surface in the shallow depth of focus as the stage scans over wafer topography. Vibration isolation and mK-level thermal control keep drift below the error budget (thermal expansion of silicon would otherwise dwarf the tolerances).

**Throughput economics.** Wafers-per-hour is the profit driver. Dose control fights scan speed (more dose reduces stochastic defects but slows the scan); jerk limits fight settling; overlay/focus accuracy fights speed. The whole scanner is an optimization of accuracy against throughput.

**Other process steps (survey for mechanics).**
- Deposition: atomic layer deposition (ALD) builds films one atomic monolayer per cycle — atomic precision, needed for GAA inner spacers and gate stacks.
- Etch: atomic layer etching (ALE) removes one layer per cycle; high-aspect-ratio etch for deep vias.
- CMP (chemical-mechanical planarization): flattens each layer; over/under-polish causes defects.
- Ion implantation and annealing: dopant introduction and activation.

**Fab-level yield.** Yield is governed by defect density D0 and die area A. The Poisson model gives Y = e^(−A·D0); [AgentCalc](https://agentcalc.com/semiconductor-wafer-yield-calculator) the Murphy model (triangular defect distribution) gives Y = [(1−e^(−A·D0))/(A·D0)]². [arxiv](https://arxiv.org/pdf/2407.02079) Worked example: a 300mm wafer, 1cm² dies, D0 = 0.5/cm² → Poisson yield ~60.65%, ~387 good dies from ~638 gross, ~$12.93/good die at $5000/wafer. [AgentCalc](https://agentcalc.com/semiconductor-wafer-yield-calculator) Larger dies collapse yield exponentially — the core tension of chip economics. Cleanroom particle control, wafer maps, and binning (sorting dies by achieved speed/leakage) complete the picture.

---
## PART II — THE GAME DESIGN PLAN

### Design philosophy and market gap
Existing "chip" games teach logic topology, not physics. KOHCTPYKTOP: Engineer of the People (Zachtronics/krispykrem) has you draw N/P silicon and metal to make gates on a grid, but its physics is admittedly "an inaccurate and highly simplified" abstraction [GitHub](https://github.com/pavel-krivanek/PharoChipDesigner) (no real ground, uses BJT-like gates, propagation delay is only loosely modeled). Silicon Zeroes works at the block level (adders, latches) with a timing mechanic. [Scmb](https://www.scmb.xyz/post/learn-through-games/) Turing Complete and nandgame build a CPU from NAND gates. [Thinky Games](https://thinkygames.com/games/turing-complete/) SHENZHEN I/O is about datasheets and microcontroller wiring. Zachtronics' own Silicon Foundry / SpaceChem-style games touch manufacturing economics. None of them model quantum tunneling, DIBL, EUV stochastics, RC scaling, or stage jerk.

**The gap and our thesis:** an engineer/student wants a technically faithful sandbox with real numbers — real dimensions, voltages, tolerances — where the physics *is* the puzzle. NanoFab fills that gap with four nested layers mirroring Part I, each teaching real physics through a core mechanic, using simplified-but-faithful models that run in a browser.

### Layer 1 — Device Puzzles: "Build a Transistor That Actually Switches"
- **Core mechanic:** The player configures a transistor cross-section — choose architecture (planar/FinFET/GAA nanosheet), set gate length, oxide thickness (EOT), number of nanosheets, supply voltage, threshold-tuning. The game plots the Id–Vg curve and scores on-current, off-current (leakage), subthreshold slope, and DIBL.
- **Physics taught:** electrostatic control, DIBL, SS and the 60mV/dec limit, gate tunneling vs oxide thickness, the drive-current benefit of stacking nanosheets, why FinFET→GAA happened.
- **Model:** a compact square-law/EKV-style drain-current model augmented with (a) a subthreshold exponential with SS as a fitted function of electrostatic integrity (a "gate control" number derived from geometry), (b) a DIBL term shifting Vth with Vds, (c) a gate-leakage term ∝ exp(−k·tox) for direct tunneling, and (d) a GIDL/band-to-band term at the drain. All are closed-form algebra — microseconds to evaluate; curves redraw in real time.
- **Variability sub-puzzle:** a Monte-Carlo mode samples RDF, LER, and WFV to produce a distribution of Vth across, say, 1000 transistors; the player must keep σVth under budget for an SRAM cell to pass its noise margin. Teaches why matching is hard. (Runs instantly — 1000 evaluations of closed-form equations.)
- **Difficulty progression:** intuitive (drag gate length, watch leakage rise) → quantitative (hit a target Ion/Ioff ratio at a fixed VDD) → optimization (minimize power at fixed speed, fighting the 60mV/dec wall).
- **Scoring:** Ion/Ioff, SS (mV/dec), DIBL (mV/V), leakage power, drive current.

### Layer 2 — Circuit / Standard-Cell Puzzles: "Make It Fast, Cool, and Small"
- **Core mechanic:** Compose transistors from Layer 1 into standard cells (inverter, NAND, flip-flop), place cells in rows, and route interconnect on a grid. The game runs timing and power analysis.
- **Physics taught:** CMOS gate construction, standard-cell rows and cell height, setup/hold timing, RC wire delay, copper resistivity scaling, electromigration, IR drop, crosstalk, PPA (performance/power/area) trade-offs.
- **Model:** Elmore delay on the RC tree for wire delay (sum of R×downstream-C); a lookup-table cell delay vs. load; a wire-resistance model that increases resistivity as the player narrows wires (Fuchs-Sondheimer/Mayadas-Shatzkes fit) [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0169433223011182) — letting the player discover why cobalt/ruthenium and backside power help; a simple current-density check for electromigration; capacitive coupling between adjacent parallel wires for crosstalk.
- **Puzzles:** meet a clock period (fix setup violations by resizing gates/shortening wires), fight hold violations, reduce IR drop by adding power straps or "unlocking" a backside power network, choose a wire metal.
- **Scoring:** max clock frequency, dynamic + leakage power, cell area, PPA composite.

### Layer 3 — Lithography Puzzles: "Print the Pattern"
- **Core mechanic A (OPC puzzle):** The player is given a target on-wafer pattern and must draw/adjust the mask (add serifs, hammerheads, assist features) so the simulated printed image matches the target within an EPE tolerance. This is playable OPC.
- **Core mechanic B (stochastic survival):** Set the exposure dose; the game runs a Monte-Carlo of photon shot noise + resist blur and shows the printed edges roughening and random bridge/break defects appearing. Raise dose to kill defects — but a throughput meter drops. Directly teaches the RLS triangle.
- **Core mechanic C (multi-patterning decomposition):** A coloring puzzle — assign layout features to 2 (LELE) or more masks so no two too-close features share a mask; or place SADP mandrels + cut mask to synthesize a target. Teaches why pitch forces multi-patterning.
- **Physics taught:** diffraction/resolution (Rayleigh, k1, NA), aerial image formation, depth of focus, stochastic defects, EPE, OPC/ILT, multi-patterning, High-NA anamorphic field-splitting.
- **Model:** aerial image via FFT-based convolution of the mask with an optical kernel (a simplified single-kernel Abbe/Hopkins approximation, or a Gaussian point-spread as the entry-level model), thresholded by a resist model to get printed contours. Stochastics: Poisson-sample photon counts per pixel, add resist blur, threshold — producing realistic LER and random defects. This is the most compute-heavy model; see feasibility below.
- **Difficulty:** Gaussian-blur intuition → FFT aerial image with defocus → add stochastic dose game → multi-patterning decomposition → High-NA half-field stitching.
- **Scoring:** EPE (nm), defect count per area, dose/throughput, mask complexity/cost.

### Layer 4 — Machine / Fab Puzzles: "Tune the Scanner, Run the Fab"
- **Core mechanic A (stage trajectory / jerk mini-game):** The signature mechanic the user asked for. The player shapes the acceleration/jerk profile of the wafer stage for a step-and-scan move. Higher jerk = faster move but more residual vibration and longer settling before the exposure can start (and worse overlay/focus if it fires early). The player tunes jerk/snap limits to minimize total move+settle time while keeping settling error under the overlay budget. Score = wafers-per-hour vs. overlay/focus error.
- **Core mechanic B (focus/leveling servo):** Keep the scanning wafer within depth of focus over bumpy topography by tuning a servo — too soft lags, too stiff rings.
- **Core mechanic C (yield sandbox):** Given a die size, defect density, and process choices from earlier layers, compute yield (Poisson/Murphy), cost per good die, and bin the wafer map. Tune the whole line (dose from Layer 3, wire metal from Layer 2, device leakage from Layer 1) to maximize profit.
- **Physics taught:** jerk-limited motion and settling, dual-stage throughput, reticle 4×/8× synchronization, focus servo, metrology, mK thermal control, yield models, binning, the master accuracy-vs-throughput trade-off.
- **Model:** second-/third-order motion profiles with bounded jerk (S-curve trajectories) plus a damped second-order oscillator for settling; closed-form Poisson/Murphy yield; simple PID for the servo game. All trivially real-time.
- **Scoring:** wafers/hour, overlay (nm), focus error, yield %, profit/wafer.

### Cross-cutting: the sandbox and the "full-stack" campaign
Beyond per-layer puzzles, a sandbox connects all four: a decision in one layer propagates outward (shrink the transistor → tighter pitch → need multi-patterning or High-NA → more dose or more masks → lower throughput → higher cost; or thinner wires → more RC delay → miss timing). The endgame campaign hands the player a PPA-and-cost target for a real-ish product and lets them co-optimize the whole stack — this is design-technology co-optimization (DTCO), exactly what the industry does.

### Educational scaffolding
- Every mechanic has an "explain the physics" panel tying the puzzle to the real effect, with real numbers (e.g., "your gate is 18nm — that's the real gate length of the '5nm' node; the name is marketing").
- Progression from intuitive sliders to quantitative targets to open optimization.
- A glossary/codex of real values: 13.5nm EUV, 0.33/0.55 NA, 60mV/dec, ~2nm overlay, 60pm stage metrology, ~5g stage acceleration, D0 yield examples.
- Optional "real-world callouts": Samsung 3nm GAA, TSMC N2, Intel 18A RibbonFET+PowerVia, imec forksheet/CFET roadmap.

### Computational feasibility on the Galaxy Tab S8 (Snapdragon 8 Gen 1 / Adreno 730)
A focused feasibility investigation confirms the whole design runs on this device:
- **Aerial-image FFT (the heaviest model):** A 256×256 (and even 512×512) 2D FFT-convolution runs above interactive frame rates. The Adreno 730 delivers on the order of ~0.75 TFLOPS FP32 [cpu-monkey](https://www.cpu-monkey.com/en/igpu-qualcomm_adreno_730) / ~1.5 TFLOPS FP16; a full FFT-convolution is tens of millions of flops per kernel, a small fraction of a frame budget even for 10–20 SOCS kernels. Direct precedents: ARM's own OpenGL ES SDK ships a per-frame 256×256 FFT ocean simulation on mobile GPUs (using FP16), [ARM Software](https://arm-software.github.io/opengl-es-sdk-for-android/ocean_f_f_t.html) and WebGL2 reaction-diffusion (same grid-convolution class) hits ~60fps in-browser. Recommended: WebGL2 fragment-shader FFT (e.g., ping-pong FP16 framebuffers, glsl-fft) as the portable baseline; WebGPU compute as progressive enhancement.
- **WebGPU** is enabled by default in Chrome for Android since Chrome 121 (Jan 2024) on Qualcomm/ARM GPUs and Android 12+ [Chrome Developers](https://developer.chrome.com/blog/new-in-webgpu-121) — which is exactly this tablet — but Samsung Internet may lack it, so build the WebGL2 path first and detect WebGPU at runtime.
- **WebAssembly** numeric kernels run at roughly 55–90% of native (per the USENIX ATC 2019 "Not So Fast" study: full apps ~55–70% of native; tight scientific kernels ~90%); use WASM+SIMD for CPU-side mask rasterization/setup, keep FFT on the GPU.
- **Everything else** (compact transistor equations, Elmore delay, Monte-Carlo of closed-form Vth, motion profiles, yield formulas) is microsecond-scale algebra — trivially real-time. Monte-Carlo device variability (1000s of samples) and cellular-automata-style effects are well within budget.
- **Guidance:** use FP16 textures for FFT (halves bandwidth; Adreno FP16 is ~2× FP32 rate); keep per-pixel branching minimal (Adreno runs wave64, so divergence costs); [Chips and Cheese](https://chipsandcheese.com/p/inside-snapdragon-8-gen-1s-igpu-adreno-gets-big) precompute optical kernels; cap grids at 256² for the interactive OPC editor and offer 512² for a "high-fidelity" non-interactive render.

### Recommended technical architecture (matches the user's stack)
- **Stack:** vanilla TypeScript + Vite; HTML5 Canvas 2D for UI/schematic/layout; WebGL2 (fragment-shader compute) for the litho FFT, with a WebGPU path behind feature detection; no backend.
- **PWA:** service worker precaches all assets and level JSON for full offline play; installable on the Tab S8; manifest for standalone launch. Touch-first input (drag, pinch-zoom on the layout/mask canvas).
- **Data-driven levels:** each puzzle is a JSON level definition (targets, tolerances, available components, scoring weights, unlocked physics terms), so content can be authored without code — and Claude Code can generate levels.
- **Deploy:** GitHub repo → GitHub Actions → GitHub Pages or Cloudflare Pages (static). Vite build outputs a static bundle; Actions runs `vite build` and publishes `dist/`.

**Suggested repo structure:**
```
/src
  /engine        # game loop, state, save/load (localStorage)
  /physics
    device.ts    # compact transistor + leakage models
    interconnect.ts # Elmore RC, resistivity scaling
    litho/       # FFT (WebGL2 + WebGPU), resist, stochastics, OPC scoring
    stage.ts     # jerk-limited motion + settling
    yield.ts     # Poisson/Murphy
  /render        # Canvas2D UI, WebGL2 aerial-image renderer
  /ui            # panels, codex, explain-the-physics
  /levels        # *.json level definitions
  /pwa           # service worker, manifest
/tests           # physics model unit tests (golden curves)
CLAUDE.md
vite.config.ts
```

**Suggested CLAUDE.md content:**
- Project one-liner and the "technically faithful, runs offline on a Galaxy Tab S8" constraint.
- The four-layer physics architecture and which models live where.
- Hard constraints: no backend; must build to static `dist/`; WebGL2 baseline + WebGPU progressive; FP16 for FFT; 256² interactive grid cap; touch-first.
- Coding conventions (vanilla TS, no heavy frameworks; keep physics pure/testable).
- The level-JSON schema and how to author a new level.
- Fidelity rule: every model must cite the real-world number it targets; never present a fabricated value as real.
- Build/deploy commands and the GitHub Actions flow.

### Staged development roadmap (sized for holiday prototyping with Claude Code)
- **MVP (first playable, ~the core):** Layer 1 device puzzle only. Compact Id–Vg model + leakage + DIBL + SS; a slider UI on Canvas 2D; 5–8 JSON levels; PWA shell + offline; deploy pipeline. This alone is a compelling educational toy and validates the whole workflow.
- **Milestone 2:** Add Layer 1 Monte-Carlo variability and Layer 2 circuit/Elmore-RC puzzles (build a gate, meet timing). Introduce the codex/scaffolding.
- **Milestone 3:** Layer 3 lithography — start with Gaussian-PSD aerial image and the stochastic dose game (highest educational novelty), then add FFT aerial image and OPC scoring, then multi-patterning decomposition.
- **Milestone 4:** Layer 4 — the jerk/stage mini-game and the yield sandbox; wire the cross-layer sandbox/DTCO campaign.
- **Polish:** High-NA anamorphic level, real-world callout cards, tutorial, leaderboards (local).

## Recommendations
1. **Build the device layer (Layer 1) as the MVP.** It has the richest physics-per-line-of-code, needs only Canvas 2D and closed-form math (no FFT), and immediately teaches the headline ideas (leakage, DIBL, the 60mV/dec wall). It also proves the offline PWA + GitHub Actions pipeline end-to-end. Ship this first.
2. **Make the lithography stochastic-dose game the "hook" feature.** It is the single most novel, most viscerally physical mechanic (watch defects appear as you cut dose) and nothing else on the market does it. Prototype it early with a cheap Gaussian model before investing in the FFT.
3. **Use the WebGL2 fragment-shader FFT as the baseline, WebGPU as progressive enhancement,** and FP16 throughout the optical path. Cap the interactive grid at 256². This guarantees it runs on the Tab S8 in both Chrome and Samsung Internet.
4. **Keep all physics models pure and unit-tested against "golden" curves** so faithfulness is verifiable and Claude Code can refactor safely.
5. **Author levels as JSON** so content scales independently of engine code.
6. **Benchmarks that change the plan:** if the 256² FFT fails to hold >15fps on-device, drop to a precomputed-kernel Gaussian aerial-image model for the interactive editor and reserve FFT for a non-interactive "render" button; if WebGPU proves reliable in the target browser, move the Monte-Carlo stochastics onto GPU compute to allow larger fields.

## Caveats
- Some sourced figures come from vendor or secondary/aggregator sources (e.g., Adreno TFLOPS are theoretical clock×ALU derivations, not measured; some node dimensions are foundry marketing vs. IRDS roadmap projections). The report flags roadmap projections (IRDS "expected") vs. shipping fact.
- Forward-looking items are explicitly future/roadmap, not shipped: TSMC A16/Super Power Rail (targeted late 2026/2027), imec forksheet/CFET (A10/A7 roadmap), and High-NA in volume production. Intel PowerVia on 18A and Samsung 3nm GAA are in production; Intel's High-NA EXE:5200B was accepted for the 14A node in December 2025 but 14A is not yet in high-volume manufacturing.
- The compact models proposed are deliberately simplified (square-law/EKV, single-kernel Abbe, Elmore, S-curve motion). They are faithful in trend and order-of-magnitude, not TCAD/rigorous-litho accurate — appropriate for education, and the game should say so.
- No existing browser-based lithography simulator was found to benchmark against; the FFT feasibility rests on strong analogues (mobile ocean-FFT, reaction-diffusion), not a device-exact measurement. Validate with an on-device benchmark early.
- The 60pm/5g/2nm scanner figures are from ASML's own communications; independent values vary by tool generation.