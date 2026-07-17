/**
 * Logic-inverter scene model (Ch2 capstone — from barrier to Boolean).
 * Pure and thin: the setup is the same controls/fixed block as the energy
 * terrain (it IS the same transistor, plus its p-type mirror), and the
 * scored metrics are the static VTC figures of merit from
 * physics/inverter.ts.
 */

import type { PlayerValues } from '../engine/levels';
import { inverterMetrics } from '../physics/inverter';
import {
  initialTerrainValues,
  parseTerrainSetup,
  resolveTerrainParams,
  type TerrainLabSetup,
} from './terrainlab';

export type InverterLabSetup = TerrainLabSetup;

export const parseInverterSetup = parseTerrainSetup;
export const initialInverterValues = initialTerrainValues;
export const resolveInverterParams = resolveTerrainParams;

/** Scored metrics: the inverter VTC figures of merit at the device's Vdd. */
export function inverterLabMetrics(setup: InverterLabSetup, values: PlayerValues): Record<string, number> {
  const params = resolveTerrainParams(setup, values);
  return { ...inverterMetrics(params, params.vdd_V) };
}
