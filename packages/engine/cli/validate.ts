// Structural validation of a film spec — the contract the engine enforces and
// the agent layer must satisfy. This is not a full JSON Schema validator; it
// is a focused check of the shape the engine actually depends on.
// schema/film.schema.json is the documented contract this mirrors.

const SCENE_TYPES = ['frame', 'structure', 'progression', 'walkthrough', 'compare', 'quantities', 'probe', 'tension', 'closeup', 'demonstrate', 'recap', 'diff'];
const ACCENTS = ['blue', 'cyan', 'green', 'amber', 'rose', 'violet'];

// Intent knobs — semantic dials the author may set; the engine interprets
// them. Each is a closed enum, and that is the point: a value outside the
// enum would be a free-form (pixel) value sneaking in — exactly what these
// checks forbid. An intent knob cannot degrade into a raw value.
const KNOBS: Record<string, string[]> = {
  register: ['grave', 'neutral', 'calm', 'urgent', 'playful'],
  cut: ['dissolve', 'hold', 'continue'],
  palette: ['cool', 'warm', 'signal', 'mono'],
  treatment: ['crisp', 'sketch'],
  pace: ['hold', 'settle', 'normal', 'brisk'],
  cadence: ['cascade', 'together', 'snap'],
  shot: ['wide', 'follow', 'push', 'hold'],
  weight: ['hero', 'primary', 'normal', 'recede'],
  // tween directive — a metric's number formatter and a tween's easing curve.
  format: ['int', 'float1', 'percent'],
  ease: ['linear', 'spring', 'accelerate', 'settle'],
};

export type ValidationIssue = {path: string; message: string};

// Flag a knob whose value is outside its closed enum.
const checkKnob = (
  obj: Record<string, any>,
  key: keyof typeof KNOBS,
  path: string,
  issues: ValidationIssue[],
): void => {
  const v = obj[key];
  if (v !== undefined && !KNOBS[key].includes(v)) {
    issues.push({
      path: `${path}.${key}`,
      message: `not a valid ${key} — one of: ${KNOBS[key].join(', ')}`,
    });
  }
};

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
    checkKnob(s.meta, 'register', 'meta', issues);
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
    checkKnob(sc, 'cut', at, issues);
    checkKnob(sc, 'palette', at, issues);
    checkKnob(sc, 'treatment', at, issues);
    if (Array.isArray(sc.nodes)) {
      sc.nodes.forEach((n: Record<string, any>, k: number) => {
        if (n && typeof n === 'object') checkKnob(n, 'weight', `${at}.nodes[${k}]`, issues);
      });
    }

    // metrics — figure cards whose number is a tweened value. Each must name a
    // grid cell, a label, and a `bind` key driven by a beat's `set`.
    if (sc.metrics !== undefined && !Array.isArray(sc.metrics)) {
      issues.push({path: `${at}.metrics`, message: 'metrics must be an array'});
    } else if (Array.isArray(sc.metrics)) {
      sc.metrics.forEach((m: Record<string, any>, k: number) => {
        const mAt = `${at}.metrics[${k}]`;
        if (!m || typeof m !== 'object') {
          issues.push({path: mAt, message: 'metric must be an object'});
          return;
        }
        for (const f of ['id', 'label', 'bind']) {
          if (typeof m[f] !== 'string' || !m[f].trim()) {
            issues.push({path: `${mAt}.${f}`, message: 'missing or empty string'});
          }
        }
        for (const f of ['col', 'row']) {
          if (typeof m[f] !== 'number' || !Number.isInteger(m[f]) || m[f] < 0) {
            issues.push({path: `${mAt}.${f}`, message: 'must be a non-negative integer'});
          }
        }
        checkKnob(m, 'format', mAt, issues);
        if (m.accent !== undefined && !ACCENTS.includes(m.accent)) {
          issues.push({path: `${mAt}.accent`, message: `unknown accent "${m.accent}"`});
        }
      });
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
      checkKnob(b, 'pace', bAt, issues);
      checkKnob(b, 'cadence', bAt, issues);
      checkKnob(b, 'shot', bAt, issues);

      // set — the tween directive. Each entry is a bare number (a jump) or a
      // Tween object {to, from?, ease?}; nothing else.
      if (b.set !== undefined) {
        if (typeof b.set !== 'object' || b.set === null || Array.isArray(b.set)) {
          issues.push({path: `${bAt}.set`, message: 'set must be a map of name → number | Tween'});
        } else {
          for (const [name, v] of Object.entries(b.set as Record<string, any>)) {
            const sAt = `${bAt}.set.${name}`;
            if (typeof v === 'number') continue;
            if (!v || typeof v !== 'object') {
              issues.push({path: sAt, message: 'must be a number or a Tween object {to, from?, ease?}'});
              continue;
            }
            if (typeof v.to !== 'number') {
              issues.push({path: `${sAt}.to`, message: 'Tween requires a numeric "to"'});
            }
            if (v.from !== undefined && typeof v.from !== 'number') {
              issues.push({path: `${sAt}.from`, message: '"from" must be a number'});
            }
            checkKnob(v, 'ease', sAt, issues);
          }
        }
      }
    });
  });

  return issues;
};
