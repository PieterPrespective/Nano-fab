import { describe, expect, it } from 'vitest';
import { LevelValidationError } from '../../src/engine/levels';
import { parseAnyLevel, parseLevelV2 } from '../../src/engine/levels2';
import { VALID_LEVEL } from './levels.test';

export const VALID_LEVEL_V2 = {
  schema: 2,
  id: 'c1-01',
  chapter: 1,
  title: 'Gravity, but sideways',
  intro: 'Launch the electron between the plates and hit the target.',
  explain: 'F = qE acts exactly like gravity on a projectile — same parabola, different constant.',
  scene: { type: 'particle-chamber', setup: { plates: [{ x: 0.2, w: 0.6, e_Vm: 1e5 }] } },
  tools: ['launch', 'probe'],
  prediction: {
    kind: 'sketch',
    prompt: 'Sketch the path the electron will take.',
    scored: true,
    conceptNodes: ['charge-force'],
  },
  targets: [{ metric: 'hitFraction', op: '>=', value: 0.8, label: 'Hit ≥ 80%' }],
  stars: { metric: 'shotsUsed', direction: 'min', two: 5, three: 3 },
  insets: [{ kind: 'trajectory-xy', unlockOn: 'reveal' }],
  conceptNodes: ['charge-force', 'field-map'],
};

function expectRejects(mutate: (l: Record<string, unknown>) => void, pathFragment: string) {
  const bad = JSON.parse(JSON.stringify(VALID_LEVEL_V2)) as Record<string, unknown>;
  mutate(bad);
  try {
    parseLevelV2(bad);
  } catch (e) {
    expect(e).toBeInstanceOf(LevelValidationError);
    expect((e as LevelValidationError).message).toContain(pathFragment);
    return;
  }
  throw new Error(`expected rejection mentioning ${pathFragment}`);
}

describe('parseLevelV2', () => {
  it('V1: the schema example parses and round-trips its fields', () => {
    const level = parseLevelV2(VALID_LEVEL_V2);
    expect(level.id).toBe('c1-01');
    expect(level.scene.type).toBe('particle-chamber');
    expect(level.tools).toEqual(['launch', 'probe']);
    expect(level.prediction).toMatchObject({ kind: 'sketch', scored: true });
    expect(level.insets[0]).toEqual({ kind: 'trajectory-xy', unlockOn: 'reveal' });
  });

  it('V2: prediction is optional; insets default empty; scored defaults true', () => {
    const min = JSON.parse(JSON.stringify(VALID_LEVEL_V2)) as Record<string, unknown>;
    delete min.prediction;
    delete min.insets;
    const level = parseLevelV2(min);
    expect(level.prediction).toBeUndefined();
    expect(level.insets).toEqual([]);
    const probe = JSON.parse(JSON.stringify(VALID_LEVEL_V2)) as { prediction: Record<string, unknown> };
    delete probe.prediction.scored;
    expect(parseLevelV2(probe).prediction?.scored).toBe(true);
  });

  it('V3: rejects each schema violation with a path-precise error', () => {
    expectRejects((l) => (l.schema = 1), '$.schema');
    expectRejects((l) => (l.bogus = 1), '$.bogus');
    expectRejects((l) => (l.id = 'l1-01'), '$.id'); // v1 id pattern not valid in v2
    expectRejects((l) => ((l.scene as Record<string, unknown>).type = 'holodeck'), '$.scene.type');
    expectRejects((l) => (l.tools = []), '$.tools');
    expectRejects((l) => (l.tools = ['slider']), '$.tools[0]'); // sliders are not a tool
    expectRejects(
      (l) => ((l.prediction as Record<string, unknown>).kind = 'essay'),
      '$.prediction.kind',
    );
    expectRejects(
      (l) => ((l.prediction as Record<string, unknown>).conceptNodes = ['vibes']),
      '$.prediction.conceptNodes[0]',
    );
    // metric namespace: a device metric is NOT valid in a particle chamber
    expectRejects(
      (l) => ((l.targets as unknown[])[0] = { metric: 'ion_A', op: '>=', value: 1, label: 'x' }),
      '$.targets[0].metric',
    );
    expectRejects((l) => (l.stars = { metric: 'ion_A', direction: 'min', two: 2, three: 1 }), '$.stars.metric');
    expectRejects(
      (l) => (l.stars = { metric: 'shotsUsed', direction: 'min', two: 1, three: 2 }),
      '$.stars',
    );
    expectRejects((l) => ((l.insets as unknown[])[0] = { kind: 'pie-chart' }), '$.insets[0].kind');
    expectRejects((l) => (l.conceptNodes = []), '$.conceptNodes');
  });

  it('V4b: field-lab (Ch2 prologue) has its own metric namespace', () => {
    const lab = JSON.parse(JSON.stringify(VALID_LEVEL_V2)) as Record<string, unknown>;
    lab.scene = { type: 'field-lab', setup: { mode: 'heightmap' } };
    lab.tools = ['place', 'probe', 'cut'];
    lab.targets = [{ metric: 'ballsHome', op: '>=', value: 3, label: '3 balls home' }];
    lab.stars = { metric: 'dropsUsed', direction: 'min', two: 6, three: 4 };
    expect(parseLevelV2(lab).scene.type).toBe('field-lab');
    // chamber metrics are NOT valid in a field-lab level
    expectRejects((l) => {
      l.scene = { type: 'field-lab', setup: { mode: 'heightmap' } };
      l.targets = [{ metric: 'hitFraction', op: '>=', value: 0.8, label: 'nope' }];
    }, '$.targets[0].metric');
  });

  it('V4: metric namespaces differ per scene — wafer3d accepts structureIoU', () => {
    const wafer = JSON.parse(JSON.stringify(VALID_LEVEL_V2)) as Record<string, unknown>;
    wafer.scene = { type: 'wafer3d', setup: {} };
    wafer.tools = ['order', 'cut', 'scrub'];
    wafer.targets = [{ metric: 'structureIoU', op: '>=', value: 0.92, label: 'Match ≥ 92%' }];
    wafer.stars = { metric: 'structureIoU', direction: 'max', two: 0.95, three: 0.985 };
    expect(parseLevelV2(wafer).targets[0]!.metric).toBe('structureIoU');
  });
});

describe('parseAnyLevel (migration window)', () => {
  it('routes v1 and v2 levels to the right parser', () => {
    const v1 = parseAnyLevel(VALID_LEVEL);
    expect(v1.v).toBe(1);
    if (v1.v === 1) expect(v1.level.id).toBe('l1-04');
    const v2 = parseAnyLevel(VALID_LEVEL_V2);
    expect(v2.v).toBe(2);
    if (v2.v === 2) expect(v2.level.scene.type).toBe('particle-chamber');
  });
});
