// Per-scene structural validation for the `passage` scene.
//
// MIRROR of the passage-specific entries in
// packages/engine/cli/validate.ts:
//
//   - the body-shape rule (line 2510 in validate.ts):
//       passage requires non-empty `text`.
//
//   - the per-mark structural walk (lines 916-959 in validate.ts):
//       `text` must be a string; `marks` must be an array; each mark is
//       an object with non-empty string `id`, `quote`, `note`; mark ids
//       are unique; `quote` must be a substring of `text`; and a passage
//       carrying marks must have non-empty text to locate them in.
//
// JSON Schema (see ./schema.ts) carries the type-shape and required
// fields; this validator surfaces the cross-field invariants the schema
// alone cannot express — mark-id uniqueness and the substring
// constraint on quotes.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

export interface PassageMark {
  id: string;
  quote: string;
  note: string;
}

export interface PassageScene extends Scene {
  type: 'passage';
  text?: string;
  marks?: PassageMark[];
  kicker?: string;
  heading?: string;
}

export const validate = (
  scene: PassageScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = `scenes[${ctx.sceneIndex}]`;

  // text — must be a string; required body check (non-empty) is the
  // engine's required-body rule for `passage`.
  if (scene.text !== undefined && typeof scene.text !== 'string') {
    issues.push({
      path: `${at}.text`,
      message: 'text must be a string',
      severity: 'error',
      code: 'passage/text-type',
    });
  }
  const passageText = typeof scene.text === 'string' ? scene.text : '';
  if (!passageText.trim()) {
    issues.push({
      path: `${at}`,
      message: 'passage requires non-empty text',
      severity: 'error',
      code: 'passage/missing-text',
    });
  }

  // marks — optional array; each mark is {id, quote, note}; ids unique;
  // quote must be a substring of text.
  if (scene.marks !== undefined && !Array.isArray(scene.marks)) {
    issues.push({
      path: `${at}.marks`,
      message: 'marks must be an array',
      severity: 'error',
      code: 'passage/marks-type',
    });
  } else if (Array.isArray(scene.marks)) {
    const markIds = new Set<string>();
    scene.marks.forEach((m, k) => {
      const mAt = `${at}.marks[${k}]`;
      if (!m || typeof m !== 'object' || Array.isArray(m)) {
        issues.push({
          path: mAt,
          message: 'mark must be an object {id, quote, note}',
          severity: 'error',
          code: 'passage/mark-shape',
        });
        return;
      }
      const mark = m as unknown as Record<string, unknown>;
      if (typeof mark.id !== 'string' || !mark.id.trim()) {
        issues.push({
          path: `${mAt}.id`,
          message: 'missing or empty string',
          severity: 'error',
          code: 'passage/mark-id',
        });
      } else if (markIds.has(mark.id)) {
        issues.push({
          path: `${mAt}.id`,
          message: `duplicate mark id "${mark.id}"`,
          severity: 'error',
          code: 'passage/mark-id-duplicate',
        });
      } else {
        markIds.add(mark.id);
      }
      if (typeof mark.quote !== 'string' || !mark.quote.trim()) {
        issues.push({
          path: `${mAt}.quote`,
          message: 'missing or empty string',
          severity: 'error',
          code: 'passage/mark-quote',
        });
      } else if (passageText && !passageText.includes(mark.quote)) {
        issues.push({
          path: `${mAt}.quote`,
          message: 'quote is not a substring of the passage text',
          severity: 'error',
          code: 'passage/mark-quote-missing',
        });
      }
      if (typeof mark.note !== 'string' || !mark.note.trim()) {
        issues.push({
          path: `${mAt}.note`,
          message: 'missing or empty string',
          severity: 'error',
          code: 'passage/mark-note',
        });
      }
    });
    if (scene.marks.length > 0 && !passageText.trim()) {
      issues.push({
        path: `${at}.text`,
        message: 'a passage with marks needs non-empty text to locate them in',
        severity: 'error',
        code: 'passage/marks-need-text',
      });
    }
  }

  return issues;
};

export default validate;
