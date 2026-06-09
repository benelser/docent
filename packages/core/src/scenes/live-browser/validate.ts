// Per-scene structural validation for the `live-browser` scene.
//
// R16.1. Two layers of contract:
//
//   1. The spec is structurally well-formed — `url` is a parseable
//      http(s) URL, every action carries a kind-appropriate payload, no
//      duplicate (at, kind) collisions, durationFrames is sane.
//   2. The scene CAN drive Playwright at build time — i.e. the host has
//      `playwright` resolvable. We surface that as a WARNING, not an
//      error: a spec author authoring on a workstation without Playwright
//      installed shouldn't get a hard failure; the cascade will degrade
//      gracefully to a placeholder. But the warning makes the cost visible
//      so a CI run with `--strict` can promote it.
//
// The scene's `id` is load-bearing — the live-capture-stage writes the
// captured clip to `public/clips/<filmId>/live-<sceneId>.mp4`, and the
// render-side component reads the same path. A scene without an `id`
// would force the cascade to invent one (scene index? random?); either
// choice breaks the cache key. We surface the missing-id case as an
// error.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

export type LiveBrowserActionKind =
  | 'click'
  | 'hover'
  | 'scroll'
  | 'type'
  | 'wait'
  | 'screenshot';

export interface LiveBrowserAction {
  at: number;
  kind: LiveBrowserActionKind;
  selector?: string;
  text?: string;
  x?: number;
  y?: number;
  durationFrames?: number;
}

export interface LiveBrowserViewport {
  width: number;
  height: number;
}

export interface LiveBrowserAuth {
  type: 'basic' | 'header';
  username?: string;
  password?: string;
  headers?: Record<string, string>;
}

export interface LiveBrowserCursorWaypoint {
  at: number;
  x: number;
  y: number;
  action?: 'move' | 'click' | 'hover';
}

export interface LiveBrowserPin {
  at: number;
  durationFrames: number;
  x: number;
  y: number;
  text: string;
  anchor?: 'tl' | 'tr' | 'bl' | 'br';
  leader?: boolean;
}

export interface LiveBrowserScene extends Scene {
  type: 'live-browser';
  url?: string;
  viewport?: LiveBrowserViewport;
  actions?: ReadonlyArray<LiveBrowserAction>;
  durationFrames?: number;
  auth?: LiveBrowserAuth;
  kicker?: string;
  heading?: string;
  cursorStyle?: 'mac' | 'windows';
  cursor?: ReadonlyArray<LiveBrowserCursorWaypoint>;
  pins?: ReadonlyArray<LiveBrowserPin>;
}

const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** True when Playwright is resolvable at validate time. We don't import it
 * — the kit + core stay browser-safe, and the validate path is the same
 * code that runs inside the Remotion webpack bundle. We feature-detect via
 * dynamic `require.resolve`-style lookup. */
const playwrightAvailable = (): boolean => {
  try {
    // The `require` global isn't in scope for an ESM TypeScript build, but
    // `import.meta.resolve` is. We're best-effort here: any throw means
    // "treat as missing", which produces a soft warning.
    const req: ((id: string) => string) | undefined = (
      globalThis as {require?: {resolve?: (id: string) => string}}
    ).require?.resolve;
    if (req) {
      req('playwright');
      return true;
    }
    // No CJS require in scope — try an ESM-style probe via the env. We can't
    // synchronously check ESM resolution from a non-async validator; the
    // capture stage will surface the missing dep at build time.
    return true;
  } catch {
    return false;
  }
};

export const validate = (
  scene: LiveBrowserScene,
  _ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];

  // ─── scene.id — load-bearing for the captured clip path ───────────────
  if (typeof scene.id !== 'string' || !scene.id.trim()) {
    issues.push({
      path: `.id`,
      message:
        'live-browser scene requires an `id` — it determines the captured ' +
        'clip path (`live-<id>.mp4`) and the cache key. Without it the ' +
        'cascade has no stable handle on the asset.',
      severity: 'error',
      code: 'live-browser/missing-id',
    });
  }

  // ─── url — required, must be http(s) ─────────────────────────────────
  if (typeof scene.url !== 'string' || !scene.url.trim()) {
    issues.push({
      path: `.url`,
      message: 'live-browser requires a `url` to drive.',
      severity: 'error',
      code: 'live-browser/missing-url',
    });
  } else {
    try {
      const u = new URL(scene.url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        issues.push({
          path: `.url`,
          message:
            `live-browser url must use http:// or https:// (got ${u.protocol}). ` +
            `For local html, use a baked clip in a \`demonstrate\` scene instead.`,
          severity: 'error',
          code: 'live-browser/bad-url-scheme',
        });
      }
    } catch {
      issues.push({
        path: `.url`,
        message: `live-browser url is not parseable: ${scene.url}`,
        severity: 'error',
        code: 'live-browser/bad-url',
      });
    }
  }

  // ─── viewport — optional, but if present must be sane ─────────────────
  if (scene.viewport !== undefined) {
    const v = scene.viewport;
    if (!finite(v.width) || !finite(v.height) || v.width <= 0 || v.height <= 0) {
      issues.push({
        path: `.viewport`,
        message: 'viewport must be {width, height} with positive finite numbers.',
        severity: 'error',
        code: 'live-browser/bad-viewport',
      });
    }
  }

  // ─── durationFrames — optional ────────────────────────────────────────
  if (scene.durationFrames !== undefined) {
    if (!finite(scene.durationFrames) || scene.durationFrames < 30) {
      issues.push({
        path: `.durationFrames`,
        message:
          'durationFrames must be a number >= 30 (one second at 30fps). ' +
          'A capture shorter than that gets truncated to noise.',
        severity: 'error',
        code: 'live-browser/bad-duration',
      });
    }
  }

  // ─── actions[] — optional but if present must be well-formed ──────────
  const totalFrames = scene.durationFrames ?? 360;
  if (scene.actions !== undefined) {
    if (!Array.isArray(scene.actions)) {
      issues.push({
        path: `.actions`,
        message: 'actions must be an array.',
        severity: 'error',
        code: 'live-browser/actions-not-array',
      });
    } else {
      let prevAt = -Infinity;
      scene.actions.forEach((a, i) => {
        const aPath = `.actions[${i}]`;
        if (!a || typeof a !== 'object') {
          issues.push({
            path: aPath,
            message: 'action must be an object {at, kind, ...}.',
            severity: 'error',
            code: 'live-browser/action-shape',
          });
          return;
        }
        if (!finite(a.at) || a.at < 0) {
          issues.push({
            path: `${aPath}.at`,
            message: 'at must be a non-negative number (frames from capture start).',
            severity: 'error',
            code: 'live-browser/action-at',
          });
        } else {
          if (a.at < prevAt) {
            issues.push({
              path: `${aPath}.at`,
              message: `actions must be ordered by at (got ${a.at} after ${prevAt}).`,
              severity: 'error',
              code: 'live-browser/action-at-out-of-order',
            });
          }
          if (a.at > totalFrames) {
            issues.push({
              path: `${aPath}.at`,
              message:
                `action at ${a.at} is past the capture's total frames (${totalFrames}). ` +
                `Bump \`durationFrames\` or move the action earlier.`,
              severity: 'warning',
              code: 'live-browser/action-past-end',
            });
          }
          prevAt = a.at;
        }
        const KINDS: ReadonlyArray<LiveBrowserActionKind> = [
          'click', 'hover', 'scroll', 'type', 'wait', 'screenshot',
        ];
        if (!KINDS.includes(a.kind as LiveBrowserActionKind)) {
          issues.push({
            path: `${aPath}.kind`,
            message: `kind must be one of: ${KINDS.join(', ')}`,
            severity: 'error',
            code: 'live-browser/action-kind',
          });
        }
        // kind-specific payload checks
        if (a.kind === 'click' || a.kind === 'hover') {
          const hasSel = typeof a.selector === 'string' && a.selector.length > 0;
          const hasXY = finite(a.x) && finite(a.y);
          if (!hasSel && !hasXY) {
            issues.push({
              path: aPath,
              message: `${a.kind} requires either \`selector\` or both \`x\` and \`y\`.`,
              severity: 'error',
              code: 'live-browser/action-target',
            });
          }
        }
        if (a.kind === 'type') {
          if (typeof a.text !== 'string' || a.text.length === 0) {
            issues.push({
              path: `${aPath}.text`,
              message: 'type action requires non-empty `text`.',
              severity: 'error',
              code: 'live-browser/action-text-missing',
            });
          }
        }
        if (a.kind === 'wait') {
          if (a.durationFrames !== undefined && (!finite(a.durationFrames) || a.durationFrames < 1)) {
            issues.push({
              path: `${aPath}.durationFrames`,
              message: 'wait.durationFrames must be a number >= 1.',
              severity: 'error',
              code: 'live-browser/action-wait-duration',
            });
          }
        }
      });
    }
  }

  // ─── auth — optional ──────────────────────────────────────────────────
  if (scene.auth !== undefined) {
    const a = scene.auth;
    if (a.type !== 'basic' && a.type !== 'header') {
      issues.push({
        path: `.auth.type`,
        message: 'auth.type must be one of "basic" or "header".',
        severity: 'error',
        code: 'live-browser/auth-type',
      });
    }
    if (a.type === 'basic') {
      if (typeof a.username !== 'string' || typeof a.password !== 'string') {
        issues.push({
          path: `.auth`,
          message: 'basic auth requires `username` and `password` strings.',
          severity: 'error',
          code: 'live-browser/auth-basic-shape',
        });
      }
    }
    if (a.type === 'header') {
      if (!a.headers || typeof a.headers !== 'object') {
        issues.push({
          path: `.auth.headers`,
          message: 'header auth requires a `headers` object.',
          severity: 'error',
          code: 'live-browser/auth-header-shape',
        });
      }
    }
  }

  // ─── Playwright dep availability — soft warning ──────────────────────
  // The capture stage will hard-fail at build time if Playwright is missing
  // AND no captured clip exists on disk. At validate time, surface a warning
  // so a `--strict` run promotes it, but a normal authoring workflow keeps
  // going.
  if (!playwrightAvailable()) {
    issues.push({
      path: `(scene)`,
      message:
        'playwright is not installed in this workspace — the live-capture ' +
        'stage will fall back to the placeholder panel at build time. ' +
        'Run `bun add -d playwright` (and `bunx playwright install chromium`) ' +
        'to enable real capture.',
      severity: 'warning',
      code: 'live-browser/playwright-missing',
    });
  }

  return issues;
};

export default validate;
