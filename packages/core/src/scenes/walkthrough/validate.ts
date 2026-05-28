// Per-scene structural validation for the `walkthrough` scene.
//
// MIGRATED from `packages/engine/cli/validate.ts` — the `walkthrough`
// branch of the `requiredBody` dispatch table:
//
//   walkthrough: () => (arrLen(sc.actors) < 2 ? 'walkthrough requires at
//     least 2 actors' : null),
//
// The rule: a walkthrough is *who talks to whom*, so a single lifeline is
// not a walkthrough — a single dot has no one to message. JSON Schema's
// `minItems: 2` carries that same constraint declaratively (see
// ./schema.ts); we keep the structural check here too because the
// migration brief preserves v2.5.x behavior verbatim, and the per-scene
// validator is the contract entry point.
//
// We also surface two warnings beyond v2.5.x that the renderer relies on
// silently: (1) every beat-level `message.from`/`message.to` must
// reference a declared actor id (the renderer reads `actorX[m.from]`,
// returns `undefined`, and draws lines from NaN — a quiet failure mode
// worth flagging); (2) actor ids must be unique within the cast (a
// duplicate id collapses two lanes on top of each other). These
// behaviorally match v2.5.x — the renderer doesn't crash on either — but
// the spec author wants to know.

import type {Beat, Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

interface WalkthroughActor {
  id: string;
  label: string;
  sub?: string;
}

interface WalkthroughMessage {
  from: string;
  to: string;
  label: string;
  kind?: 'forward' | 'reply' | 'aside';
}

export interface WalkthroughScene extends Scene {
  type: 'walkthrough';
  actors?: WalkthroughActor[];
  messages?: WalkthroughMessage[];
  kicker?: string;
  heading?: string;
}

const arrLen = (a: unknown): number => (Array.isArray(a) ? a.length : 0);

const messageOf = (beat: Beat): WalkthroughMessage | undefined => {
  const m = (beat as {message?: unknown}).message;
  if (!m || typeof m !== 'object') return undefined;
  const rec = m as Record<string, unknown>;
  if (typeof rec.from !== 'string' || typeof rec.to !== 'string' || typeof rec.label !== 'string') {
    return undefined;
  }
  return rec as unknown as WalkthroughMessage;
};

export const validate = (
  scene: WalkthroughScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = `scenes[${ctx.sceneIndex}]`;

  // v2.5.x parity — at least 2 actors. JSON Schema (./schema.ts) carries
  // the same rule via `minItems: 2`; we re-assert here so a caller that
  // skips schema validation still gets the structural check.
  if (arrLen(scene.actors) < 2) {
    issues.push({
      path: `${at}.actors`,
      message: 'walkthrough requires at least 2 actors',
      severity: 'error',
      code: 'walkthrough/too-few-actors',
    });
    return issues;
  }

  const actors = scene.actors ?? [];
  const ids = new Set<string>();
  actors.forEach((a, i) => {
    if (typeof a.id !== 'string' || a.id.length === 0) {
      issues.push({
        path: `${at}.actors[${i}].id`,
        message: `actor at index ${i} is missing a string id`,
        severity: 'error',
        code: 'walkthrough/actor-missing-id',
      });
      return;
    }
    if (ids.has(a.id)) {
      issues.push({
        path: `${at}.actors[${i}].id`,
        message: `actor id ${JSON.stringify(a.id)} is duplicated; ids must be unique within the cast (a duplicate collapses two lifelines)`,
        severity: 'warning',
        code: 'walkthrough/duplicate-actor-id',
      });
    } else {
      ids.add(a.id);
    }
  });

  // Walk the beats; any beat-level `message` must reference declared
  // actors. The renderer silently draws from NaN if it doesn't — quiet
  // failure mode the spec author wants surfaced.
  const beats = Array.isArray(scene.beats) ? scene.beats : [];
  beats.forEach((beat, bi) => {
    const m = messageOf(beat);
    if (!m) return;
    if (!ids.has(m.from)) {
      issues.push({
        path: `${at}.beats[${bi}].message.from`,
        message: `message.from ${JSON.stringify(m.from)} does not match any declared actor id`,
        severity: 'warning',
        code: 'walkthrough/unknown-actor',
      });
    }
    if (!ids.has(m.to)) {
      issues.push({
        path: `${at}.beats[${bi}].message.to`,
        message: `message.to ${JSON.stringify(m.to)} does not match any declared actor id`,
        severity: 'warning',
        code: 'walkthrough/unknown-actor',
      });
    }
  });

  return issues;
};

export default validate;
