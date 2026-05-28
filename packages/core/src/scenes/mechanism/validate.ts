// Per-scene structural validator for `mechanism`.
//
// Ported behaviorally from the `if (sc.type === 'mechanism')` block in
// packages/engine/cli/validate.ts (around lines 2055-2266). The contract:
//
//   parts:    2-10 entries; unique string ids; label non-empty; pos in [0..1];
//             optional kind ∈ {node, value, token}.
//   motion:   present; kind ∈ {cycle, oscillate, descend, iterate};
//             period ∈ (0, 600); every referenced part id must resolve.
//   freezes:  optional array; each {beatId, phase}; beatId must be a real beat
//             of this scene; phase ∈ [0, motion-length).
//
// The plugin-mode validator does NOT police the
// "mechanism-only fields appear on a non-mechanism scene" cross-checks — those
// live cross-scene and the kit's central validate framework handles them
// (other scenes' validators flag THEIR own intrusions on mechanism's fields,
// not vice versa).

import type {SceneIssue, SceneValidationContext, Scene} from '@bjelser/kit';

const MOTION_KINDS = ['cycle', 'oscillate', 'descend', 'iterate'] as const;

export const validate = (
  scene: Scene,
  _ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  // `at` is a logical scene-relative path; the central validator prepends the
  // film/scene index when surfacing.
  const at = 'scene';

  // ----- parts — 2-10 entries with unique ids and normalized positions ----
  const partIds = new Set<string>();
  const partsRaw = (scene as Record<string, unknown>).parts;
  const parts = Array.isArray(partsRaw) ? partsRaw : null;
  if (!parts || parts.length < 2 || parts.length > 10) {
    issues.push({
      path: `${at}.parts`,
      severity: 'error',
      message:
        'mechanism requires 2-10 parts (the named positions the motion visits)',
    });
  } else {
    parts.forEach((p: unknown, k: number) => {
      const pAt = `${at}.parts[${k}]`;
      if (!p || typeof p !== 'object') {
        issues.push({
          path: pAt,
          severity: 'error',
          message: 'part must be an object {id, label, pos}',
        });
        return;
      }
      const part = p as Record<string, unknown>;
      if (typeof part.id !== 'string' || !part.id.trim()) {
        issues.push({
          path: `${pAt}.id`,
          severity: 'error',
          message: 'missing or empty string',
        });
      } else if (partIds.has(part.id)) {
        issues.push({
          path: `${pAt}.id`,
          severity: 'error',
          message: `duplicate part id "${part.id}"`,
        });
      } else {
        partIds.add(part.id);
      }
      if (typeof part.label !== 'string' || !part.label.trim()) {
        issues.push({
          path: `${pAt}.label`,
          severity: 'error',
          message: 'missing or empty string',
        });
      }
      const pos = part.pos;
      if (!pos || typeof pos !== 'object' || Array.isArray(pos)) {
        issues.push({
          path: `${pAt}.pos`,
          severity: 'error',
          message: 'pos must be an object {x, y}, each in 0..1',
        });
      } else {
        for (const ax of ['x', 'y'] as const) {
          const v = (pos as Record<string, unknown>)[ax];
          if (
            typeof v !== 'number' ||
            !Number.isFinite(v) ||
            v < 0 ||
            v > 1
          ) {
            issues.push({
              path: `${pAt}.pos.${ax}`,
              severity: 'error',
              message: 'must be a number in 0..1',
            });
          }
        }
      }
      if (
        part.kind !== undefined &&
        !['node', 'value', 'token'].includes(part.kind as string)
      ) {
        issues.push({
          path: `${pAt}.kind`,
          severity: 'error',
          message: 'kind must be one of: node, value, token',
        });
      }
    });
  }

  // ----- motion — one of the 4 kinds, refs resolve, period bounded ---------
  const motion = (scene as Record<string, unknown>).motion as
    | Record<string, unknown>
    | undefined;
  let motionLen = 0;
  if (!motion || typeof motion !== 'object') {
    issues.push({
      path: `${at}.motion`,
      severity: 'error',
      message: 'mechanism requires a motion primitive',
    });
  } else if (
    !MOTION_KINDS.includes(motion.kind as (typeof MOTION_KINDS)[number])
  ) {
    issues.push({
      path: `${at}.motion.kind`,
      severity: 'error',
      message: `not a valid motion kind — one of: ${MOTION_KINDS.join(', ')}`,
    });
  } else {
    if (
      typeof motion.period !== 'number' ||
      !Number.isFinite(motion.period) ||
      motion.period <= 0 ||
      motion.period >= 600
    ) {
      issues.push({
        path: `${at}.motion.period`,
        severity: 'error',
        message:
          'period must be a number > 0 and < 600 frames (the loop must close within view time)',
      });
    }
    const refOk = (id: unknown, where: string): void => {
      if (typeof id !== 'string' || !id.trim()) {
        issues.push({
          path: where,
          severity: 'error',
          message: 'missing part id',
        });
      } else if (!partIds.has(id)) {
        issues.push({
          path: where,
          severity: 'error',
          message: `part "${id}" is not a part in this scene`,
        });
      }
    };
    if (motion.kind === 'cycle') {
      const path = motion.path;
      if (!Array.isArray(path) || path.length < 2) {
        issues.push({
          path: `${at}.motion.path`,
          severity: 'error',
          message: 'cycle motion requires a path of ≥ 2 part ids',
        });
      } else {
        path.forEach((id: unknown, k: number) =>
          refOk(id, `${at}.motion.path[${k}]`),
        );
        motionLen = path.length;
      }
    } else if (motion.kind === 'oscillate') {
      const between = motion.between;
      if (!Array.isArray(between) || between.length !== 2) {
        issues.push({
          path: `${at}.motion.between`,
          severity: 'error',
          message:
            'oscillate motion requires `between` as a [partA, partB] pair',
        });
      } else {
        refOk(between[0], `${at}.motion.between[0]`);
        refOk(between[1], `${at}.motion.between[1]`);
        motionLen = 2;
      }
    } else if (motion.kind === 'descend') {
      refOk(motion.from, `${at}.motion.from`);
      refOk(motion.to, `${at}.motion.to`);
      motionLen = 2;
    } else if (motion.kind === 'iterate') {
      const phases = motion.phases;
      if (!Array.isArray(phases) || phases.length < 2) {
        issues.push({
          path: `${at}.motion.phases`,
          severity: 'error',
          message: 'iterate motion requires ≥ 2 phases',
        });
      } else {
        phases.forEach((phRaw: unknown, k: number) => {
          const phAt = `${at}.motion.phases[${k}]`;
          if (!phRaw || typeof phRaw !== 'object') {
            issues.push({
              path: phAt,
              severity: 'error',
              message: 'phase must be an object {label, show}',
            });
            return;
          }
          const ph = phRaw as Record<string, unknown>;
          if (typeof ph.label !== 'string' || !(ph.label as string).trim()) {
            issues.push({
              path: `${phAt}.label`,
              severity: 'error',
              message: 'missing or empty string',
            });
          }
          if (!Array.isArray(ph.show) || ph.show.length < 1) {
            issues.push({
              path: `${phAt}.show`,
              severity: 'error',
              message:
                'phase requires a non-empty `show` array of part ids',
            });
          } else {
            (ph.show as unknown[]).forEach((id, j) =>
              refOk(id, `${phAt}.show[${j}]`),
            );
          }
        });
        motionLen = phases.length;
      }
    }
  }

  // ----- freezes — each names a real beat + a phase in [0, motionLen) ------
  const beatIdSet = new Set<string>();
  const beats = scene.beats;
  if (Array.isArray(beats)) {
    beats.forEach((b) => {
      if (typeof b?.id === 'string') beatIdSet.add(b.id);
    });
  }
  const freezesRaw = (scene as Record<string, unknown>).freezes;
  if (freezesRaw !== undefined && !Array.isArray(freezesRaw)) {
    issues.push({
      path: `${at}.freezes`,
      severity: 'error',
      message: 'freezes must be an array',
    });
  } else if (Array.isArray(freezesRaw)) {
    freezesRaw.forEach((f: unknown, k: number) => {
      const fAt = `${at}.freezes[${k}]`;
      if (!f || typeof f !== 'object') {
        issues.push({
          path: fAt,
          severity: 'error',
          message: 'freeze must be an object {beatId, phase}',
        });
        return;
      }
      const fz = f as Record<string, unknown>;
      if (typeof fz.beatId !== 'string' || !fz.beatId.trim()) {
        issues.push({
          path: `${fAt}.beatId`,
          severity: 'error',
          message: 'missing or empty string',
        });
      } else if (beatIdSet.size > 0 && !beatIdSet.has(fz.beatId)) {
        issues.push({
          path: `${fAt}.beatId`,
          severity: 'error',
          message: `freeze references beat "${fz.beatId}" which is not a beat in this scene`,
        });
      }
      if (
        typeof fz.phase !== 'number' ||
        !Number.isInteger(fz.phase) ||
        (fz.phase as number) < 0 ||
        (motionLen > 0 && (fz.phase as number) >= motionLen)
      ) {
        issues.push({
          path: `${fAt}.phase`,
          severity: 'error',
          message:
            motionLen > 0
              ? `phase must be an integer in [0, ${motionLen})`
              : 'phase must be a non-negative integer',
        });
      }
    });
  }

  return issues;
};

export default validate;
