// validate — per-scene structural validation for venn.
//
// MIGRATED from `packages/engine/cli/validate.ts` (v2.5.x) — the
// `sc.type === 'venn'` block. Behaviour preserved: same hard-fail
// conditions, same error messages.
//
// Per the strategy doc §4.2: each ScenePlugin owns its structural
// validator; the engine's `validate()` aggregates issues across all
// registered plugins. The per-type block that used to live in the
// monolithic engine validator becomes THIS function — keyed off the
// scene's `type === 'venn'`.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

/**
 * One named set — a circle of the diagram. Two or three sets per scene.
 */
export interface VennSet {
  id: string;
  label: string;
  sub?: string;
}

/**
 * One addressable region — the {A}, {B}, {C}, {A,B}, {A,C}, {B,C}, {A,B,C}
 * zones of the diagram. `in` lists which set ids the region falls inside.
 * The implicit "outside all" region {} is not addressable: a film does not
 * argue about what lies outside every set.
 */
export interface VennRegion {
  id: string;
  in: string[];
  label?: string;
  note?: string;
}

/**
 * The intersection the film argues from — the dangerous region. `kind:
 * 'venn'` is the discriminator that narrows `Scene.novelty` from the
 * widened `PriorArtNovelty | VennNovelty` union at the renderer.
 */
export interface VennNovelty {
  kind: 'venn';
  regionId: string;
  claim: string;
}

/**
 * The venn scene's spec shape — the per-type fields the plugin owns.
 * The kit's `Scene` carries the common shell (`type`, `kicker`, `heading`,
 * `beats`); these are the venn-specific additions.
 */
export interface VennScene extends Scene {
  type: 'venn';
  sets?: VennSet[];
  regions?: VennRegion[];
  novelty?: VennNovelty;
  kicker?: string;
  heading?: string;
}

/**
 * Validate a `venn` scene structurally. The kit handles common-shell
 * fields; this checks the per-type fields the plugin's schema carries:
 * sets, regions, novelty.
 *
 * HARD-FAIL contracts (verbatim from the engine validator):
 *   - `sets` must have 2 or 3 entries (a 1-circle Venn is not a Venn; a
 *     4+ Venn does not have a clean planar layout).
 *   - every region's `in` must reference real set ids in `sets`.
 *   - every region's `in` must be NON-EMPTY (the outside-all region is
 *     not addressable: a film does not argue about what lies outside
 *     every set).
 *   - `novelty.regionId` must reference a real region in `regions`.
 *   - `novelty.kind` must equal `'venn'` (the discriminator that narrows
 *     the union).
 */
export const validate = (
  scene: Scene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = ``;
  // The kit hands us a plain `Scene` (open shape); narrow per-type fields
  // through a record cast — every read is shape-checked locally.
  const sc = scene as unknown as Record<string, unknown>;

  // ---- sets ---------------------------------------------------------------
  const setIds = new Set<string>();
  if (
    !Array.isArray(sc.sets) ||
    sc.sets.length < 2 ||
    sc.sets.length > 3
  ) {
    issues.push({
      path: `${at}.sets`,
      message: 'venn requires 2 or 3 sets (the circles of the diagram)',
      severity: 'error',
    });
  } else {
    sc.sets.forEach((rawP: unknown, k: number) => {
      const pAt = `${at}.sets[${k}]`;
      if (!rawP || typeof rawP !== 'object') {
        issues.push({
          path: pAt,
          message: 'set must be an object {id, label, sub?}',
          severity: 'error',
        });
        return;
      }
      const p = rawP as Record<string, unknown>;
      if (typeof p.id !== 'string' || !p.id.trim()) {
        issues.push({
          path: `${pAt}.id`,
          message: 'missing or empty string',
          severity: 'error',
        });
      } else if (setIds.has(p.id)) {
        issues.push({
          path: `${pAt}.id`,
          message: `duplicate set id "${p.id}"`,
          severity: 'error',
        });
      } else {
        setIds.add(p.id);
      }
      if (typeof p.label !== 'string' || !p.label.trim()) {
        issues.push({
          path: `${pAt}.label`,
          message: 'missing or empty string',
          severity: 'error',
        });
      }
      if (p.sub !== undefined && (typeof p.sub !== 'string' || !p.sub.trim())) {
        issues.push({
          path: `${pAt}.sub`,
          message: 'sub must be a non-empty string when present',
          severity: 'error',
        });
      }
    });
  }

  // ---- regions ------------------------------------------------------------
  // Each region must reference real set ids in `in`, and `in` must be
  // non-empty (the outside-all region is not addressable).
  const regionIds = new Set<string>();
  if (sc.regions === undefined || !Array.isArray(sc.regions)) {
    issues.push({
      path: `${at}.regions`,
      message: 'venn requires a regions array (the addressable zones)',
      severity: 'error',
    });
  } else {
    sc.regions.forEach((rawR: unknown, k: number) => {
      const rAt = `${at}.regions[${k}]`;
      if (!rawR || typeof rawR !== 'object') {
        issues.push({
          path: rAt,
          message: 'region must be an object {id, in, label?, note?}',
          severity: 'error',
        });
        return;
      }
      const r = rawR as Record<string, unknown>;
      if (typeof r.id !== 'string' || !r.id.trim()) {
        issues.push({
          path: `${rAt}.id`,
          message: 'missing or empty string',
          severity: 'error',
        });
      } else if (regionIds.has(r.id)) {
        issues.push({
          path: `${rAt}.id`,
          message: `duplicate region id "${r.id}"`,
          severity: 'error',
        });
      } else {
        regionIds.add(r.id);
      }
      if (!Array.isArray(r.in) || r.in.length === 0) {
        issues.push({
          path: `${rAt}.in`,
          message:
            'in must be a non-empty array of set ids — the implicit "outside all" region is not addressable',
          severity: 'error',
        });
      } else {
        r.in.forEach((sid: unknown, ii: number) => {
          if (typeof sid !== 'string' || !sid.trim()) {
            issues.push({
              path: `${rAt}.in[${ii}]`,
              message: 'must be a set id',
              severity: 'error',
            });
          } else if (!setIds.has(sid)) {
            issues.push({
              path: `${rAt}.in[${ii}]`,
              message: `region references set "${sid}", which is not a set in this scene`,
              severity: 'error',
            });
          }
        });
      }
      if (r.label !== undefined && (typeof r.label !== 'string' || !r.label.trim())) {
        issues.push({
          path: `${rAt}.label`,
          message: 'label must be a non-empty string when present',
          severity: 'error',
        });
      }
      if (r.note !== undefined && (typeof r.note !== 'string' || !r.note.trim())) {
        issues.push({
          path: `${rAt}.note`,
          message: 'note must be a non-empty string when present',
          severity: 'error',
        });
      }
    });
  }

  // ---- novelty ------------------------------------------------------------
  // The dangerous intersection. Must reference a real region. `kind: 'venn'`
  // is the discriminator that narrows `Scene.novelty` from the widened
  // `PriorArtNovelty | VennNovelty` union at the renderer.
  if (!sc.novelty || typeof sc.novelty !== 'object') {
    issues.push({
      path: `${at}.novelty`,
      message:
        'venn requires a novelty {kind: "venn", regionId, claim} — the intersection the film argues from',
      severity: 'error',
    });
  } else {
    const nv = sc.novelty as Record<string, unknown>;
    if (nv.kind !== 'venn') {
      issues.push({
        path: `${at}.novelty.kind`,
        message:
          'venn scene requires `novelty.kind: "venn"` (the discriminator that narrows the union)',
        severity: 'error',
      });
    }
    if (typeof nv.regionId !== 'string' || !nv.regionId.trim()) {
      issues.push({
        path: `${at}.novelty.regionId`,
        message: 'missing or empty region id',
        severity: 'error',
      });
    } else if (!regionIds.has(nv.regionId)) {
      issues.push({
        path: `${at}.novelty.regionId`,
        message: `novelty references region "${nv.regionId}", which is not a region in this scene`,
        severity: 'error',
      });
    }
    if (typeof nv.claim !== 'string' || !nv.claim.trim()) {
      issues.push({
        path: `${at}.novelty.claim`,
        message: 'missing or empty claim',
        severity: 'error',
      });
    }
  }

  return issues;
};

export default validate;
