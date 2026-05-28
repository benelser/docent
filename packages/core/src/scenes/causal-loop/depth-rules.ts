// Depthcheck rules contributed by the causal-loop scene plugin.
//
// Ported behaviorally from the `causal-loop contract — the "loop" must
// actually CLOSE` block in packages/engine/cli/depthcheck.ts (around lines
// 486-522).
//
// The contract: a causal-loop scene that ships loops whose `path` is a
// straight line (last variable doesn't reach back to the first) has
// labelled a non-loop with R/B — a failure of the scene's whole argument.
// We check, per loop, that an edge exists from path[last] → path[0]. The
// structural validator (./validate.ts) already enforces that every
// consecutive pair has an edge; this is the wrap-around dimension. A scene
// with no loops skips this entirely (the structural validator demands at
// least 1).

import type {DepthFinding, DepthRule, Scene} from '@bjelser/kit';

interface CausalLoopSceneShape extends Scene {
  type: 'causal-loop';
  causalEdges?: ReadonlyArray<{from: string; to: string}>;
  loops?: ReadonlyArray<{id: string; path: string[]}>;
}

const loopActuallyLoops: DepthRule<Scene> = {
  id: 'loop-actually-loops',
  description:
    'Loops actually close — a causal-loop scene argues a cycle, not a line',
  severity: 'error',
  scope: 'scene',
  check(scene): DepthFinding | null {
    if (scene.type !== 'causal-loop') return null;
    const sc = scene as CausalLoopSceneShape;
    const edgeKeys = new Set(
      (sc.causalEdges ?? []).map((e) => `${e.from}->${e.to}`),
    );
    const openLoops: string[] = [];
    for (const loop of sc.loops ?? []) {
      if (!Array.isArray(loop.path) || loop.path.length < 2) {
        openLoops.push(loop.id);
        continue;
      }
      const first = loop.path[0];
      const last = loop.path[loop.path.length - 1];
      if (!edgeKeys.has(`${last}->${first}`)) {
        openLoops.push(loop.id);
      }
    }
    if (openLoops.length === 0) return null;
    const sceneId = sc.id ?? '(unnamed)';
    return {
      ruleId: 'loop-actually-loops',
      path: `scenes[${sceneId}]`,
      severity: 'error',
      message: `${openLoops.length} loop(s) do not close — path[last] has no edge back to path[0]: ${openLoops.join(', ')}`,
      suggestion:
        'add the wrap-around causal edge from the last variable in the loop back to the first, OR reorder the loop path so its existing edges form a closed cycle. A loop labelled R/B that does not close has labelled a line as a cycle — the scene\'s argument is false.',
    };
  },
};

export const depthRules: ReadonlyArray<DepthRule<Scene>> = [loopActuallyLoops];

export default depthRules;
