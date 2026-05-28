// Depthcheck rules contributed by the mechanism scene plugin.
//
// Ported behaviorally from the `mechanism — motion-is-the-argument` block in
// packages/engine/cli/depthcheck.ts (around lines 524-576).
//
// The contract: a mechanism scene exists to let the viewer WATCH a thing
// operate — not to be narrated over. A beat clears the bar if any of:
//   - it carries a `freezes` entry (motion pauses, narration is about the
//     frozen visual state);
//   - it has no narration or vanishingly short narration (motion plays
//     unaccompanied);
//   - its narration references the visual state with one of the lexical
//     handles the mechanism vocabulary uses (watch / see / now / here /
//     this / the loop / the cycle / the cursor / the marker / the phase /
//     pause / hold / frozen / the motion / the step).
//
// If a mechanism scene contains zero such beats, the rule fails.

import type {DepthRule, DepthFinding, Scene} from '@bjelser/kit';

const VISUAL_HANDLE =
  /\b(watch|see|now|here|this|the loop|the cycle|the cursor|the marker|the token|the phase|pause|paused|hold|holds|frozen|the motion|the step)\b/i;

interface MechanismSceneShape extends Scene {
  type: 'mechanism';
  freezes?: ReadonlyArray<{beatId: string; phase: number}>;
}

const shownNotTold: DepthRule<Scene> = {
  id: 'mechanism-shown-not-told',
  description:
    'Motion is shown, not told — at least one mechanism beat lets the motion carry the argument',
  severity: 'error',
  scope: 'scene',
  check(scene): DepthFinding | null {
    // Only applies to mechanism scenes.
    if (scene.type !== 'mechanism') return null;
    const sc = scene as MechanismSceneShape;
    const freezeBeatIds = new Set(
      (sc.freezes ?? []).map((f) => f.beatId),
    );
    let sceneShowsNotTells = false;
    for (const b of sc.beats ?? []) {
      const narr = (b.narration ?? '').trim();
      const short = narr.split(/\s+/).filter(Boolean).length < 5;
      const frozen = b.id ? freezeBeatIds.has(b.id) : false;
      const handle = VISUAL_HANDLE.test(narr);
      if (frozen || short || handle) {
        sceneShowsNotTells = true;
        break;
      }
    }
    if (sceneShowsNotTells) return null;
    const sceneId = sc.id ?? '(unnamed)';
    return {
      ruleId: 'mechanism-shown-not-told',
      path: `scenes[${sceneId}]`,
      severity: 'error',
      message: `every beat in mechanism scene "${sceneId}" over-narrates — no beat uses freezes, no beat is short, and none references the visual state (watch/see/now/the loop/etc.)`,
      suggestion:
        'add a beat that freezes the motion on a named phase, OR shorten one beat\'s narration to < 5 words and let the motion play unaccompanied, OR reword one beat to reference the visual state (watch / see / now / the loop / the cursor / the phase / pause / hold / frozen / etc.)',
    };
  },
};

export const depthRules: ReadonlyArray<DepthRule<Scene>> = [shownNotTold];

export default depthRules;
