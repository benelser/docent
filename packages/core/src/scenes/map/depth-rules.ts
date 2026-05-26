// Depthcheck rules for the `map` scene.
//
// MIGRATED from packages/engine/cli/depthcheck.ts:414-444. The v2.5.x rule
// is film-wide: across ALL map scenes in a film, at least 30% of regions
// must carry a non-empty `sub` annotation — without `sub` a region is just
// a dot and the position is decoration, not argument.
//
// Per the kit contract, a `DepthRule` runs either per-scene (default) or
// per-film (`scope: 'film'`). The v2.5.x rule reads the whole film at once
// — it counts regions across every map scene and fails iff the aggregated
// ratio is below the floor. We declare `scope: 'film'` so the rule runs
// once with the full film spec, identical to v2.5.x semantics.

import type {DepthFinding, DepthRule, FilmSpec, Scene} from '@docent/kit';

import type {MapScene} from './validate';

interface RawRegion {
  sub?: unknown;
}

// Narrow a scene to a map scene + read its regions as the open type the
// validator coerces. The kit's Scene index signature gives `regions` as
// `unknown`; we coerce locally.
const mapRegionsOf = (sc: Scene): RawRegion[] => {
  const arr = (sc as unknown as {regions?: unknown}).regions;
  return Array.isArray(arr) ? (arr as RawRegion[]) : [];
};

const positionMeaningfulRule: DepthRule<MapScene> = {
  id: 'position-meaningful',
  description:
    'Position is load-bearing — regions carry annotated meaning, not just dots. Across all map scenes in the film, at least 30% of regions must carry a non-empty `sub` annotation.',
  severity: 'error',
  scope: 'film',
  check(_target: MapScene, ctx): DepthFinding | null {
    const spec: FilmSpec = ctx.filmSpec;
    const mapScenes = spec.scenes.filter((sc) => sc.type === 'map');
    if (mapScenes.length === 0) return null;

    const allRegions = mapScenes.flatMap((sc) => mapRegionsOf(sc));
    if (allRegions.length === 0) {
      return {
        ruleId: 'position-meaningful',
        path: 'scenes',
        message:
          'a map scene has no regions to argue from — position is decoration, not argument',
        severity: 'error',
      };
    }

    const annotated = allRegions.filter(
      (r) => typeof r.sub === 'string' && (r.sub as string).trim().length > 0,
    ).length;
    const ratio = annotated / allRegions.length;
    if (ratio >= 0.3) return null;

    const pct = Math.round(ratio * 100);
    return {
      ruleId: 'position-meaningful',
      path: 'scenes',
      message: `${annotated}/${allRegions.length} map regions annotated (${pct}%) — without per-region "sub" the regions are dots; the spatial argument doesn't land. Floor: 30%.`,
      severity: 'error',
      suggestion:
        'name what each region\'s position MEANS — its role in the topology, its trade-off, what is true at this place that is not true elsewhere',
    };
  },
};

export const depthRules: ReadonlyArray<DepthRule<MapScene>> = [
  positionMeaningfulRule,
];

export default depthRules;
