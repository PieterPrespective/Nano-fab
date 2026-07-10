/**
 * Codex entries: the in-game glossary of real values (fidelity rule).
 * Data lives in src/levels/codex.json; validated here at load.
 */

export interface CodexEntry {
  id: string;
  title: string;
  body: string;
  realNumbers: string[];
}

export function parseCodex(json: unknown): CodexEntry[] {
  if (!Array.isArray(json)) throw new Error('codex: expected array');
  const seen = new Set<string>();
  return json.map((e, i) => {
    if (typeof e !== 'object' || e === null) throw new Error(`codex[${i}]: expected object`);
    const { id, title, body, realNumbers } = e as Record<string, unknown>;
    if (typeof id !== 'string' || !id) throw new Error(`codex[${i}].id: expected string`);
    if (seen.has(id)) throw new Error(`codex[${i}].id: duplicate "${id}"`);
    seen.add(id);
    if (typeof title !== 'string' || !title) throw new Error(`codex[${i}].title: expected string`);
    if (typeof body !== 'string' || !body) throw new Error(`codex[${i}].body: expected string`);
    if (!Array.isArray(realNumbers) || realNumbers.some((r) => typeof r !== 'string')) {
      throw new Error(`codex[${i}].realNumbers: expected string array`);
    }
    return { id, title, body, realNumbers: realNumbers as string[] };
  });
}
