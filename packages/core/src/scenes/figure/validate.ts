// Per-scene structural validation for the `figure` scene.
//
// Lifted from packages/engine/cli/validate.ts — two blocks contribute to
// the figure scene's structural validation:
//
//   1. The required-body table (around line 2511) — figure requires a
//      non-empty `image` string.
//   2. The per-type field block (lines 961-1003) — `callouts` must be an
//      array of {id, at, label, note?} objects; each `id` unique within
//      the scene; `at` a normalized [x, y] pair with each coordinate in
//      0..1; `label` non-empty; `note` (if present) non-empty.
//
// The JSON Schema fragment in ./schema.ts carries the type-shape part
// (string/array/number bounds, additionalProperties: false). This
// validator carries the cross-field invariants the schema can't express:
//   - the id-uniqueness check across the callouts array,
//   - the non-empty-string-after-trim refinements,
//   - the at-pair shape (already constrained by schema, but surfaced here
//     with a fuller error message that includes the path).
//
// The single hard failure is a missing/empty `image` — without it the
// scene has no body to annotate. Everything else is a warning or
// per-field error.

import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

// The figure validator runs Node-side from the CLI's `docent validate` /
// `docent build` paths — but the module that exports `FigureScene` (this
// one) is also pulled into the browser bundle via `./component.tsx`'s
// type-only import of `FigureScene`. The `core` package.json's `browser`
// field stubs `node:fs`/`node:path` to `false`, so when webpack bundles
// for chrome-headless `existsSync` resolves to `undefined`. The probe
// below is defensive: it skips silently if the fs functions aren't
// callable, which is harmless because the browser bundle never invokes
// `validate()` anyway — validate runs Node-side, pre-render.
const safeExistsSync = (
  p: string,
): boolean | undefined => {
  const fn = (nodeFs as {existsSync?: (p: string) => boolean}).existsSync;
  return typeof fn === 'function' ? fn(p) : undefined;
};
const safeIsAbsolute = (p: string): boolean => {
  const fn = (nodePath as {isAbsolute?: (p: string) => boolean}).isAbsolute;
  return typeof fn === 'function' ? fn(p) : p.startsWith('/');
};
const safeJoin = (...parts: string[]): string => {
  const fn = (nodePath as {join?: (...parts: string[]) => string}).join;
  return typeof fn === 'function' ? fn(...parts) : parts.join('/');
};

export interface FigureCallout {
  id: string;
  at: [number, number];
  label: string;
  note?: string;
}

export interface FigureScene extends Scene {
  type: 'figure';
  image?: string;
  callouts?: FigureCallout[];
  kicker?: string;
  heading?: string;
}

export const validate = (
  scene: FigureScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = ``;

  // image — required body. The engine's required-body table fails the
  // scene if it's absent or empty after trim.
  if (typeof scene.image !== 'string' || !scene.image.trim()) {
    issues.push({
      path: `${at}.image`,
      message: 'figure requires an image path',
      severity: 'error',
      code: 'figure/missing-image',
    });
  } else if (scene.image !== undefined && !scene.image.trim()) {
    // Defensive: a whitespace-only string is also empty.
    issues.push({
      path: `${at}.image`,
      message: 'image must be a non-empty string path',
      severity: 'error',
      code: 'figure/empty-image',
    });
  } else {
    // Optional filesystem probe: when the caller threaded `projectRoot`
    // through `engine.validate(spec, {projectRoot})`, verify the image
    // actually exists where the component will look for it. A miss is a
    // WARNING — the scene still renders (the component degrades to a
    // labelled placeholder card), but the author sees what's wrong before
    // burning a render. URLs are not probed; absolute paths are checked
    // as-is; bare names resolve under `<projectRoot>/public/figures/`.
    const img = scene.image.trim();
    const isUrl = /^https?:\/\//i.test(img);
    if (!isUrl && ctx.projectRoot) {
      const candidate = safeIsAbsolute(img)
        ? img
        : img.includes('/')
          ? safeJoin(ctx.projectRoot, 'public', img)
          : safeJoin(ctx.projectRoot, 'public', 'figures', img);
      const hit = safeExistsSync(candidate);
      // hit === undefined means the fs check itself didn't run (browser
      // bundle, unusual env) — we don't surface a warning in that case.
      if (hit === false) {
        issues.push({
          path: `${at}.image`,
          message:
            `figure image not found on disk — expected at ${candidate}. ` +
            `The scene will render a placeholder card with the missing ` +
            `path so the miss is visible in the film.`,
          severity: 'warning',
          code: 'figure/image-missing-on-disk',
        });
      }
    }
  }

  // callouts — optional, but when present must be an array of well-shaped
  // {id, at, label, note?} objects with unique ids.
  if (scene.callouts !== undefined && !Array.isArray(scene.callouts)) {
    issues.push({
      path: `${at}.callouts`,
      message: 'callouts must be an array',
      severity: 'error',
      code: 'figure/callouts-not-array',
    });
  } else if (Array.isArray(scene.callouts)) {
    const calloutIds = new Set<string>();
    scene.callouts.forEach((c, k) => {
      const cAt = `${at}.callouts[${k}]`;
      if (!c || typeof c !== 'object') {
        issues.push({
          path: cAt,
          message: 'callout must be an object {id, at, label, note?}',
          severity: 'error',
          code: 'figure/callout-shape',
        });
        return;
      }
      // id
      if (typeof c.id !== 'string' || !c.id.trim()) {
        issues.push({
          path: `${cAt}.id`,
          message: 'missing or empty string',
          severity: 'error',
          code: 'figure/callout-id-missing',
        });
      } else if (calloutIds.has(c.id)) {
        issues.push({
          path: `${cAt}.id`,
          message: `duplicate callout id "${c.id}"`,
          severity: 'error',
          code: 'figure/callout-id-duplicate',
        });
      } else {
        calloutIds.add(c.id);
      }
      // label
      if (typeof c.label !== 'string' || !c.label.trim()) {
        issues.push({
          path: `${cAt}.label`,
          message: 'missing or empty string',
          severity: 'error',
          code: 'figure/callout-label-missing',
        });
      }
      // note (optional, but when present must be a non-empty string)
      if (
        c.note !== undefined &&
        (typeof c.note !== 'string' || !c.note.trim())
      ) {
        issues.push({
          path: `${cAt}.note`,
          message: 'note must be a non-empty string when present',
          severity: 'error',
          code: 'figure/callout-note-empty',
        });
      }
      // at — normalized [x, y] pair in 0..1
      const atVal = (c as {at?: unknown}).at;
      if (
        !Array.isArray(atVal) ||
        atVal.length !== 2 ||
        !atVal.every(
          (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1,
        )
      ) {
        issues.push({
          path: `${cAt}.at`,
          message: 'at must be a normalized [x, y] pair, each in 0..1',
          severity: 'error',
          code: 'figure/callout-at-shape',
        });
      }
    });
  }

  return issues;
};

export default validate;
