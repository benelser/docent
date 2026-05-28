// Depthcheck rules for the `landscape` scene.
//
// Ported behaviorally from the "landscape contract" block in
// packages/engine/cli/depthcheck.ts (around lines 602-647). The contract:
//
//   (1) axis-asymmetric — the two axes name TWO DIFFERENT trade-offs.
//       A landscape on "simplicity vs simplicity" is a category error:
//       the plane has collapsed to a line, not a quadrant. The rule
//       compares the trimmed/lowercased `label` of both axes, plus a
//       second clause comparing the {lowLabel, highLabel} pair.
//
//   (2) landscape-spread — the subjects ARGUE: the max pairwise
//       Euclidean distance in [0..1]² is ≥ 0.4. Otherwise it's a cluster,
//       not a landscape: the axes' argument doesn't land.
//
// Both rules are scene-scoped — they fire on every landscape scene in the
// film independently.

import type {DepthFinding, DepthRule, Scene} from '@bjelser/kit';

import type {LandscapeScene} from './validate';

const axisAsymmetric: DepthRule<Scene> = {
  id: 'axis-asymmetric',
  description:
    'Landscape axes are asymmetric — the two trade-offs the plane names are different',
  severity: 'error',
  scope: 'scene',
  check(scene): DepthFinding | null {
    if (scene.type !== 'landscape') return null;
    const sc = scene as LandscapeScene;
    const xLabel = (sc.xAxis?.label ?? '').trim().toLowerCase();
    const yLabel = (sc.yAxis?.label ?? '').trim().toLowerCase();
    const xLow = (sc.xAxis?.lowLabel ?? '').trim().toLowerCase();
    const xHigh = (sc.xAxis?.highLabel ?? '').trim().toLowerCase();
    const yLow = (sc.yAxis?.lowLabel ?? '').trim().toLowerCase();
    const yHigh = (sc.yAxis?.highLabel ?? '').trim().toLowerCase();
    const sameAxis =
      (xLabel.length > 0 && yLabel.length > 0 && xLabel === yLabel) ||
      (xLow.length > 0 &&
        yLow.length > 0 &&
        xLow === yLow &&
        xHigh.length > 0 &&
        yHigh.length > 0 &&
        xHigh === yHigh);
    if (!sameAxis) return null;
    const sceneId = typeof sc.id === 'string' ? sc.id : '(unnamed)';
    return {
      ruleId: 'axis-asymmetric',
      path: `scenes[${sceneId}]`,
      severity: 'error',
      message: `landscape "${xLabel}" vs "${yLabel}" — same axis on both — the plane has collapsed to a line, not a quadrant`,
      suggestion:
        'rename one of the two axes so the plane names a genuine trade-off; the quadrant analysis works only when the two axes pull on different tensions',
    };
  },
};

const landscapeSpread: DepthRule<Scene> = {
  id: 'landscape-spread',
  description:
    'Landscape is a landscape, not a cluster — at least one subject is visually distant',
  severity: 'error',
  scope: 'scene',
  check(scene): DepthFinding | null {
    if (scene.type !== 'landscape') return null;
    const sc = scene as LandscapeScene;
    const subs = sc.subjects ?? [];
    let maxDist = 0;
    for (let i = 0; i < subs.length; i++) {
      for (let j = i + 1; j < subs.length; j++) {
        const a = subs[i];
        const b = subs[j];
        if (!a || !b) continue;
        const dx = (a.x ?? 0) - (b.x ?? 0);
        const dy = (a.y ?? 0) - (b.y ?? 0);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > maxDist) maxDist = d;
      }
    }
    if (maxDist >= 0.4) return null;
    const sceneId = typeof sc.id === 'string' ? sc.id : '(unnamed)';
    return {
      ruleId: 'landscape-spread',
      path: `scenes[${sceneId}]`,
      severity: 'error',
      message: `max pairwise distance ${maxDist.toFixed(2)} < 0.4 — the subjects cluster; the axes' argument doesn't land`,
      suggestion:
        'either spread the subjects across the plane so the argument the axes name is visible, or replace the landscape with a different move (cluster → compare table; same-position points → quantities or a sequence)',
    };
  },
};

export const depthRules: ReadonlyArray<DepthRule<Scene>> = [
  axisAsymmetric,
  landscapeSpread,
];

export default depthRules;
