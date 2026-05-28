// big-idea — per-scene structural validation.
//
// Hard-fail shape contract: a non-empty statement is required; when an anchor
// is present, it must be a `{kind, value}` object with `kind` in the closed
// allowlist (`glyph` / `equation` / `image` / `chart-fragment`) and a
// non-empty `value`. The shape-of-the-sentence contract (≤ 20 words / ends
// with a period / no filler opening) lives in depth-rules.ts because it
// fires only on explainer films and depends on film-wide context. The
// film-wide position contract (exactly one per explainer; sits immediately
// before the recap) stays in the engine's cross-scene validator.
//
// Migrated from `packages/engine/cli/validate.ts` (the `sc.type === 'big-idea'`
// block plus the "fields on the wrong scene type" complement; the
// `BIG_IDEA_ANCHOR_KINDS` allowlist; the position-contract checks remain at
// the film level).

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

// The closed allowlist of anchor kinds. Mirror of the v2.5.x engine's
// `BIG_IDEA_ANCHOR_KINDS` (validate.ts line 24). An anchor outside this list
// is rejected: the author picks the kind, the engine owns the pixels.
const BIG_IDEA_ANCHOR_KINDS = ['glyph', 'equation', 'image', 'chart-fragment'] as const;
type BigIdeaAnchorKind = (typeof BIG_IDEA_ANCHOR_KINDS)[number];

export interface BigIdeaAnchor {
  kind: BigIdeaAnchorKind;
  value: string;
}

export interface BigIdeaScene extends Scene {
  type: 'big-idea';
  statement?: string;
  anchor?: BigIdeaAnchor;
  kicker?: string;
  heading?: string;
}

export const validate = (
  scene: BigIdeaScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = ``;

  if (typeof scene.statement !== 'string' || !scene.statement.trim()) {
    issues.push({
      path: `${at}.statement`,
      message:
        'a big-idea scene requires a non-empty statement (the sentence the viewer leaves with)',
      severity: 'error',
      code: 'big-idea/missing-statement',
    });
  }

  const anchor = (scene as {anchor?: unknown}).anchor;
  if (anchor !== undefined) {
    if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) {
      issues.push({
        path: `${at}.anchor`,
        message: 'anchor must be an object {kind, value}',
        severity: 'error',
        code: 'big-idea/anchor-shape',
      });
    } else {
      const a = anchor as {kind?: unknown; value?: unknown};
      if (
        typeof a.kind !== 'string' ||
        !(BIG_IDEA_ANCHOR_KINDS as readonly string[]).includes(a.kind)
      ) {
        issues.push({
          path: `${at}.anchor.kind`,
          message: `not a valid anchor kind — one of: ${BIG_IDEA_ANCHOR_KINDS.join(', ')}`,
          severity: 'error',
          code: 'big-idea/anchor-kind',
        });
      }
      if (typeof a.value !== 'string' || !a.value.trim()) {
        issues.push({
          path: `${at}.anchor.value`,
          message: 'anchor.value must be a non-empty string',
          severity: 'error',
          code: 'big-idea/anchor-value',
        });
      }
    }
  }

  return issues;
};

export default validate;
