// Per-scene structural validation for the `landscape` scene.
//
// Ported behaviorally from the `if (sc.type === 'landscape')` block in
// packages/engine/cli/validate.ts (around lines 822-914) and the
// "landscape requires at least 2 subjects" entry at line 2521-2522. The
// contract surfaces structural failures the JSON Schema cannot express
// at the granularity the engine pinned (axis discriminator, unique
// subject ids, accent allowlist, quadrant cell shape).
//
//   xAxis/yAxis: object with `kind: 'landscape'` and non-empty label /
//                lowLabel / highLabel.
//   subjects:    2-8 entries; unique string ids; non-empty label; finite
//                x/y in [0..1]; optional non-empty sub; optional accent
//                drawn from the universal accent keys.
//   quadrants:   when present, an object with optional tl/tr/bl/br each
//                a non-empty string.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

/**
 * The universal accent keys — every preset re-declares these. Matches the
 * `ACCENTS` list the engine's validate.ts honours.
 */
const ACCENT_KEYS = ['blue', 'cyan', 'green', 'amber', 'rose', 'violet'] as const;

export interface LandscapeAxisSpec {
  kind?: 'landscape' | string;
  label?: string;
  lowLabel?: string;
  highLabel?: string;
}

export interface LandscapeSubjectSpec {
  id?: string;
  label?: string;
  sub?: string;
  x?: number;
  y?: number;
  accent?: string;
  embed?: unknown;
}

export interface LandscapeQuadrants {
  tl?: string;
  tr?: string;
  bl?: string;
  br?: string;
}

export interface LandscapeScene extends Scene {
  type: 'landscape';
  xAxis?: LandscapeAxisSpec;
  yAxis?: LandscapeAxisSpec;
  subjects?: LandscapeSubjectSpec[];
  quadrants?: LandscapeQuadrants;
  kicker?: string;
  heading?: string;
}

export const validate = (
  scene: LandscapeScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = `scenes[${ctx.sceneIndex}]`;

  // ----- axes — both required, kind: 'landscape', non-empty labels --------
  const checkAxis = (
    axisRaw: unknown,
    axisAt: string,
  ): void => {
    if (!axisRaw || typeof axisRaw !== 'object' || Array.isArray(axisRaw)) {
      issues.push({
        path: axisAt,
        severity: 'error',
        message:
          'landscape requires this axis as an object {kind: "landscape", label, lowLabel, highLabel}',
        code: 'landscape/axis-shape',
      });
      return;
    }
    const axis = axisRaw as LandscapeAxisSpec;
    if (axis.kind !== 'landscape') {
      issues.push({
        path: `${axisAt}.kind`,
        severity: 'error',
        message:
          'landscape scene requires `axis.kind: "landscape"` (the discriminator that narrows the union)',
        code: 'landscape/axis-kind',
      });
    }
    for (const f of ['label', 'lowLabel', 'highLabel'] as const) {
      const v = axis[f];
      if (typeof v !== 'string' || !v.trim()) {
        const axisName = axisAt.split('.').pop();
        issues.push({
          path: `${axisAt}.${f}`,
          severity: 'error',
          message: `landscape ${axisName} requires a non-empty ${f}`,
          code: 'landscape/axis-label',
        });
      }
    }
  };
  checkAxis(scene.xAxis, `${at}.xAxis`);
  checkAxis(scene.yAxis, `${at}.yAxis`);

  // ----- subjects — 2-8, unique ids, non-empty labels, x/y in [0..1] -------
  const subjects = scene.subjects;
  if (!Array.isArray(subjects) || subjects.length < 2 || subjects.length > 8) {
    issues.push({
      path: `${at}.subjects`,
      severity: 'error',
      message:
        'landscape requires 2-8 subjects (the markers plotted on the plane)',
      code: 'landscape/subjects-count',
    });
  } else {
    const seenIds = new Set<string>();
    subjects.forEach((subRaw: unknown, k: number) => {
      const subAt = `${at}.subjects[${k}]`;
      if (!subRaw || typeof subRaw !== 'object' || Array.isArray(subRaw)) {
        issues.push({
          path: subAt,
          severity: 'error',
          message: 'subject must be an object {id, label, x, y, sub?, accent?}',
          code: 'landscape/subject-shape',
        });
        return;
      }
      const sub = subRaw as LandscapeSubjectSpec;
      if (typeof sub.id !== 'string' || !sub.id.trim()) {
        issues.push({
          path: `${subAt}.id`,
          severity: 'error',
          message: 'missing or empty string',
          code: 'landscape/subject-id',
        });
      } else if (seenIds.has(sub.id)) {
        issues.push({
          path: `${subAt}.id`,
          severity: 'error',
          message: `duplicate subject id "${sub.id}"`,
          code: 'landscape/subject-id-duplicate',
        });
      } else {
        seenIds.add(sub.id);
      }
      if (typeof sub.label !== 'string' || !sub.label.trim()) {
        issues.push({
          path: `${subAt}.label`,
          severity: 'error',
          message: 'missing or empty string',
          code: 'landscape/subject-label',
        });
      }
      if (sub.sub !== undefined && (typeof sub.sub !== 'string' || !sub.sub.trim())) {
        issues.push({
          path: `${subAt}.sub`,
          severity: 'error',
          message: 'sub must be a non-empty string when present',
          code: 'landscape/subject-sub',
        });
      }
      for (const f of ['x', 'y'] as const) {
        const v = sub[f];
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          issues.push({
            path: `${subAt}.${f}`,
            severity: 'error',
            message: 'must be a finite number in [0..1]',
            code: 'landscape/subject-pos',
          });
        } else if (v < 0 || v > 1) {
          issues.push({
            path: `${subAt}.${f}`,
            severity: 'error',
            message: `must be in [0..1] (got ${v}) — landscape positions are normalized`,
            code: 'landscape/subject-pos-range',
          });
        }
      }
      if (
        sub.accent !== undefined &&
        !(ACCENT_KEYS as readonly string[]).includes(sub.accent)
      ) {
        issues.push({
          path: `${subAt}.accent`,
          severity: 'error',
          message: `unknown accent "${sub.accent}"`,
          code: 'landscape/subject-accent',
        });
      }
    });
  }

  // ----- quadrants — optional object {tl?, tr?, bl?, br?} ------------------
  if (scene.quadrants !== undefined) {
    const qRaw = scene.quadrants;
    if (!qRaw || typeof qRaw !== 'object' || Array.isArray(qRaw)) {
      issues.push({
        path: `${at}.quadrants`,
        severity: 'error',
        message: 'quadrants must be an object {tl?, tr?, bl?, br?}',
        code: 'landscape/quadrants-shape',
      });
    } else {
      const q = qRaw as Record<string, unknown>;
      for (const f of ['tl', 'tr', 'bl', 'br'] as const) {
        const v = q[f];
        if (v !== undefined && (typeof v !== 'string' || !v.trim())) {
          issues.push({
            path: `${at}.quadrants.${f}`,
            severity: 'error',
            message: 'must be a non-empty string when present',
            code: 'landscape/quadrants-cell',
          });
        }
      }
    }
  }

  return issues;
};

export default validate;
