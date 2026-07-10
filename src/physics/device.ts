/**
 * Layer 1 — compact transistor model (phase 1 / MVP).
 *
 * Pure functions only: no DOM, no globals, no side effects. Everything here
 * is implemented test-first against tests/physics/device.test.ts and the
 * golden fixtures in tests/fixtures/.
 *
 * Planned exports (see prompts/nf01/02-device-physics-model.md):
 *   - electrostatics(geometry): scale length, SS (mV/dec), DIBL (mV/V)
 *   - idVg(device, sweep): drain current vs. gate voltage
 *   - leakage(device): gate tunneling + GIDL + subthreshold components
 *   - metrics(device): Ion, Ioff, Ion/Ioff, SS, DIBL, leakage power
 */

export {};
