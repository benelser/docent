// Structural validation of a film spec — the contract the engine enforces and
// the agent layer must satisfy. This is not a full JSON Schema validator; it
// is a focused check of the shape the engine actually depends on.
// schema/film.schema.json is the documented contract this mirrors.

const SCENE_TYPES = ['title', 'diagram', 'sequence', 'code', 'diff', 'sketch', 'recap'];
const ACCENTS = ['blue', 'cyan', 'green', 'amber', 'rose', 'violet'];

export type ValidationIssue = {path: string; message: string};

export const validateSpec = (spec: unknown): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const s = spec as Record<string, any>;
  if (!s || typeof s !== 'object') {
    return [{path: '', message: 'spec is not an object'}];
  }

  // meta
  if (!s.meta || typeof s.meta !== 'object') {
    issues.push({path: 'meta', message: 'missing meta block'});
  } else {
    for (const k of ['id', 'title', 'subject', 'prompt']) {
      if (typeof s.meta[k] !== 'string' || !s.meta[k].trim()) {
        issues.push({path: `meta.${k}`, message: 'missing or empty string'});
      }
    }
    for (const k of ['fps', 'width', 'height']) {
      if (typeof s.meta[k] !== 'number' || s.meta[k] <= 0) {
        issues.push({path: `meta.${k}`, message: 'missing or non-positive number'});
      }
    }
  }

  // scenes
  if (!Array.isArray(s.scenes) || s.scenes.length === 0) {
    issues.push({path: 'scenes', message: 'missing or empty scenes array'});
    return issues;
  }

  const sceneIds = new Set<string>();
  const beatIds = new Set<string>();
  s.scenes.forEach((sc: Record<string, any>, i: number) => {
    const at = `scenes[${i}]`;
    if (typeof sc.id !== 'string') {
      issues.push({path: `${at}.id`, message: 'missing id'});
    } else if (sceneIds.has(sc.id)) {
      issues.push({path: `${at}.id`, message: `duplicate scene id "${sc.id}"`});
    } else {
      sceneIds.add(sc.id);
    }
    if (!SCENE_TYPES.includes(sc.type)) {
      issues.push({path: `${at}.type`, message: `unknown scene type "${sc.type}"`});
    }
    if (sc.accent && !ACCENTS.includes(sc.accent)) {
      issues.push({path: `${at}.accent`, message: `unknown accent "${sc.accent}"`});
    }
    if (!Array.isArray(sc.beats) || sc.beats.length === 0) {
      issues.push({path: `${at}.beats`, message: 'missing or empty beats array'});
      return;
    }
    sc.beats.forEach((b: Record<string, any>, j: number) => {
      const bAt = `${at}.beats[${j}]`;
      if (typeof b.id !== 'string' || !b.id.trim()) {
        issues.push({path: `${bAt}.id`, message: 'missing beat id'});
      } else if (beatIds.has(b.id)) {
        issues.push({path: `${bAt}.id`, message: `duplicate beat id "${b.id}" (TTS keys on it)`});
      } else {
        beatIds.add(b.id);
      }
      if (typeof b.narration !== 'string' || !b.narration.trim()) {
        issues.push({path: `${bAt}.narration`, message: 'missing narration text'});
      }
    });
  });

  return issues;
};
