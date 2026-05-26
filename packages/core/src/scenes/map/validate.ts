// Per-scene structural validation for the `map` scene.
//
// MIGRATED from packages/engine/cli/validate.ts:1572-1795 (the `map` block
// + the per-type-rejection of `layout`/`gridSize`/`markers`/`connections`
// on non-map scenes). The cross-scene-type rejection logic does NOT live
// here — the engine's per-type validator is invoked only on scenes that
// are actually `type: 'map'`, so a `regions` field on (say) a `venn` scene
// is invisible to this validator by construction.
//
// What this validator enforces (mirroring the v2.5.x rules verbatim):
//   - layout is one of `topology` | `grid` (default `topology`).
//   - 2 ≤ regions.length ≤ 12 — under 2 there's no spatial argument; over
//     12 the diagram loses legibility.
//   - every region has a non-empty `id` and `label`; ids unique within
//     scene; `sub` (when present) is non-empty.
//   - region `pos` must carry finite numeric `x` and `y`. For `topology`,
//     `x`/`y` are normalized to 0..1 and optional `w`/`h` lie in (0..1].
//     For `grid`, `x`/`y` are integer cell coordinates inside `gridSize`.
//   - `grid` layout requires a positive-integer `gridSize` {cols, rows};
//     `gridSize` is rejected on `topology` layouts.
//   - markers (when present) carry id, `at` (a real region id), label;
//     `kind` ∈ {pin, dot, flag} when set.
//   - connections (when present) carry id, `from`/`to` (real region ids);
//     `kind` ∈ {route, transmission, supply} when set.

import type {Scene, SceneIssue, SceneValidationContext} from '@docent/kit';

export type MapLayout = 'topology' | 'grid';
export type MapMarkerKind = 'pin' | 'dot' | 'flag';
export type MapConnectionKind = 'route' | 'transmission' | 'supply';

export interface MapRegion {
  id: string;
  label: string;
  pos: {x: number; y: number; w?: number; h?: number};
  sub?: string;
}

export interface MapMarker {
  id: string;
  at: string;
  label: string;
  kind?: MapMarkerKind;
}

export interface MapConnection {
  id: string;
  from: string;
  to: string;
  label?: string;
  kind?: MapConnectionKind;
}

export interface MapScene extends Scene {
  type: 'map';
  layout?: MapLayout;
  gridSize?: {cols: number; rows: number};
  regions?: MapRegion[];
  markers?: MapMarker[];
  connections?: MapConnection[];
  kicker?: string;
  heading?: string;
}

export const validate = (
  scene: MapScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = `scenes[${ctx.sceneIndex}]`;

  // The narrowed open-shape view of the scene we work with. The kit's Scene
  // index signature gives every other field as `unknown`; we coerce locally
  // and validate explicitly.
  const sc = scene as unknown as {
    layout?: unknown;
    gridSize?: unknown;
    regions?: unknown;
    markers?: unknown;
    connections?: unknown;
  };

  const layoutRaw = sc.layout;
  const layout: MapLayout =
    layoutRaw === 'grid' || layoutRaw === 'topology' ? layoutRaw : 'topology';
  if (layoutRaw !== undefined && layoutRaw !== 'topology' && layoutRaw !== 'grid') {
    issues.push({
      path: `${at}.layout`,
      message: 'not a valid layout — one of: topology, grid',
      severity: 'error',
      code: 'map/invalid-layout',
    });
  }

  const regionIds = new Set<string>();
  const regions = sc.regions;
  if (!Array.isArray(regions) || regions.length < 2) {
    issues.push({
      path: `${at}.regions`,
      message: 'map requires at least 2 regions (position carries information)',
      severity: 'error',
      code: 'map/too-few-regions',
    });
  } else if (regions.length > 12) {
    issues.push({
      path: `${at}.regions`,
      message: `${regions.length} regions is past the legibility cap — keep to 12 or fewer`,
      severity: 'error',
      code: 'map/too-many-regions',
    });
  } else {
    regions.forEach((r: Record<string, any>, k: number) => {
      const rAt = `${at}.regions[${k}]`;
      if (!r || typeof r !== 'object') {
        issues.push({
          path: rAt,
          message: 'region must be an object {id, label, pos, sub?}',
          severity: 'error',
          code: 'map/region-shape',
        });
        return;
      }
      if (typeof r.id !== 'string' || !r.id.trim()) {
        issues.push({
          path: `${rAt}.id`,
          message: 'missing or empty string',
          severity: 'error',
          code: 'map/region-missing-id',
        });
      } else if (regionIds.has(r.id)) {
        issues.push({
          path: `${rAt}.id`,
          message: `duplicate region id "${r.id}"`,
          severity: 'error',
          code: 'map/region-duplicate-id',
        });
      } else {
        regionIds.add(r.id);
      }
      if (typeof r.label !== 'string' || !r.label.trim()) {
        issues.push({
          path: `${rAt}.label`,
          message: 'missing or empty string',
          severity: 'error',
          code: 'map/region-missing-label',
        });
      }
      if (r.sub !== undefined && (typeof r.sub !== 'string' || !r.sub.trim())) {
        issues.push({
          path: `${rAt}.sub`,
          message: 'sub must be a non-empty string when present',
          severity: 'error',
          code: 'map/region-empty-sub',
        });
      }
      if (!r.pos || typeof r.pos !== 'object') {
        issues.push({
          path: `${rAt}.pos`,
          message: 'pos must be an object {x, y, w?, h?}',
          severity: 'error',
          code: 'map/region-missing-pos',
        });
      } else {
        for (const f of ['x', 'y'] as const) {
          if (typeof r.pos[f] !== 'number' || !Number.isFinite(r.pos[f])) {
            issues.push({
              path: `${rAt}.pos.${f}`,
              message: 'must be a finite number',
              severity: 'error',
              code: 'map/region-pos-non-finite',
            });
          }
        }
        if (layout === 'topology') {
          for (const f of ['x', 'y'] as const) {
            if (typeof r.pos[f] === 'number' && (r.pos[f] < 0 || r.pos[f] > 1)) {
              issues.push({
                path: `${rAt}.pos.${f}`,
                message: 'topology positions must be normalized in 0..1',
                severity: 'error',
                code: 'map/region-pos-out-of-range',
              });
            }
          }
          for (const f of ['w', 'h'] as const) {
            if (r.pos[f] !== undefined) {
              if (typeof r.pos[f] !== 'number' || !Number.isFinite(r.pos[f])) {
                issues.push({
                  path: `${rAt}.pos.${f}`,
                  message: 'must be a finite number',
                  severity: 'error',
                  code: 'map/region-pos-non-finite',
                });
              } else if (r.pos[f] <= 0 || r.pos[f] > 1) {
                issues.push({
                  path: `${rAt}.pos.${f}`,
                  message: 'topology sizes must be in (0..1]',
                  severity: 'error',
                  code: 'map/region-size-out-of-range',
                });
              }
            }
          }
        } else {
          // grid — integer cell coords
          for (const f of ['x', 'y'] as const) {
            if (typeof r.pos[f] === 'number' && !Number.isInteger(r.pos[f])) {
              issues.push({
                path: `${rAt}.pos.${f}`,
                message: 'grid layout positions must be integers (col / row)',
                severity: 'error',
                code: 'map/region-pos-non-integer',
              });
            }
          }
        }
      }
    });
  }

  // gridSize required when layout is `grid`; rejected when layout is topology.
  const gridSize = sc.gridSize as
    | {cols?: unknown; rows?: unknown}
    | undefined;
  if (layout === 'grid') {
    if (
      !gridSize ||
      typeof gridSize !== 'object' ||
      typeof gridSize.cols !== 'number' ||
      typeof gridSize.rows !== 'number' ||
      !Number.isInteger(gridSize.cols) ||
      !Number.isInteger(gridSize.rows) ||
      gridSize.cols < 1 ||
      gridSize.rows < 1
    ) {
      issues.push({
        path: `${at}.gridSize`,
        message: 'layout: "grid" requires gridSize {cols, rows} of positive integers',
        severity: 'error',
        code: 'map/grid-missing-size',
      });
    } else if (Array.isArray(regions)) {
      // Validate every region's grid pos sits inside the gridSize.
      const cols = gridSize.cols as number;
      const rows = gridSize.rows as number;
      regions.forEach((r: Record<string, any>, k: number) => {
        if (!r?.pos) return;
        if (
          typeof r.pos.x === 'number' &&
          (r.pos.x < 0 || r.pos.x >= cols)
        ) {
          issues.push({
            path: `${at}.regions[${k}].pos.x`,
            message: `col ${r.pos.x} is outside the ${cols}-column grid`,
            severity: 'error',
            code: 'map/grid-col-out-of-range',
          });
        }
        if (
          typeof r.pos.y === 'number' &&
          (r.pos.y < 0 || r.pos.y >= rows)
        ) {
          issues.push({
            path: `${at}.regions[${k}].pos.y`,
            message: `row ${r.pos.y} is outside the ${rows}-row grid`,
            severity: 'error',
            code: 'map/grid-row-out-of-range',
          });
        }
      });
    }
  } else if (gridSize !== undefined) {
    issues.push({
      path: `${at}.gridSize`,
      message: 'gridSize has meaning only when layout is "grid"',
      severity: 'error',
      code: 'map/grid-size-on-topology',
    });
  }

  // markers — `at` must reference a real region id.
  const markers = sc.markers;
  if (markers !== undefined && !Array.isArray(markers)) {
    issues.push({
      path: `${at}.markers`,
      message: 'markers must be an array',
      severity: 'error',
      code: 'map/markers-not-array',
    });
  } else if (Array.isArray(markers)) {
    const markerIds = new Set<string>();
    markers.forEach((m: Record<string, any>, k: number) => {
      const mAt = `${at}.markers[${k}]`;
      if (!m || typeof m !== 'object') {
        issues.push({
          path: mAt,
          message: 'marker must be an object {id, at, label, kind?}',
          severity: 'error',
          code: 'map/marker-shape',
        });
        return;
      }
      if (typeof m.id !== 'string' || !m.id.trim()) {
        issues.push({
          path: `${mAt}.id`,
          message: 'missing or empty string',
          severity: 'error',
          code: 'map/marker-missing-id',
        });
      } else if (markerIds.has(m.id)) {
        issues.push({
          path: `${mAt}.id`,
          message: `duplicate marker id "${m.id}"`,
          severity: 'error',
          code: 'map/marker-duplicate-id',
        });
      } else {
        markerIds.add(m.id);
      }
      if (typeof m.at !== 'string' || !m.at.trim()) {
        issues.push({
          path: `${mAt}.at`,
          message: 'missing region id',
          severity: 'error',
          code: 'map/marker-missing-at',
        });
      } else if (regionIds.size > 0 && !regionIds.has(m.at)) {
        issues.push({
          path: `${mAt}.at`,
          message: `marker "at" references "${m.at}", which is not a region in this scene`,
          severity: 'error',
          code: 'map/marker-unknown-region',
        });
      }
      if (typeof m.label !== 'string' || !m.label.trim()) {
        issues.push({
          path: `${mAt}.label`,
          message: 'missing or empty string',
          severity: 'error',
          code: 'map/marker-missing-label',
        });
      }
      if (m.kind !== undefined && !['pin', 'dot', 'flag'].includes(m.kind)) {
        issues.push({
          path: `${mAt}.kind`,
          message: 'not a valid kind — one of: pin, dot, flag',
          severity: 'error',
          code: 'map/marker-invalid-kind',
        });
      }
    });
  }

  // connections — from / to must reference real region ids.
  const connections = sc.connections;
  if (connections !== undefined && !Array.isArray(connections)) {
    issues.push({
      path: `${at}.connections`,
      message: 'connections must be an array',
      severity: 'error',
      code: 'map/connections-not-array',
    });
  } else if (Array.isArray(connections)) {
    const connIds = new Set<string>();
    connections.forEach((c: Record<string, any>, k: number) => {
      const cAt = `${at}.connections[${k}]`;
      if (!c || typeof c !== 'object') {
        issues.push({
          path: cAt,
          message: 'connection must be an object {id, from, to, label?, kind?}',
          severity: 'error',
          code: 'map/connection-shape',
        });
        return;
      }
      if (typeof c.id !== 'string' || !c.id.trim()) {
        issues.push({
          path: `${cAt}.id`,
          message: 'missing or empty string',
          severity: 'error',
          code: 'map/connection-missing-id',
        });
      } else if (connIds.has(c.id)) {
        issues.push({
          path: `${cAt}.id`,
          message: `duplicate connection id "${c.id}"`,
          severity: 'error',
          code: 'map/connection-duplicate-id',
        });
      } else {
        connIds.add(c.id);
      }
      for (const f of ['from', 'to'] as const) {
        if (typeof c[f] !== 'string' || !c[f].trim()) {
          issues.push({
            path: `${cAt}.${f}`,
            message: 'missing region id',
            severity: 'error',
            code: 'map/connection-missing-endpoint',
          });
        } else if (regionIds.size > 0 && !regionIds.has(c[f])) {
          issues.push({
            path: `${cAt}.${f}`,
            message: `connection "${f}" references "${c[f]}", which is not a region in this scene`,
            severity: 'error',
            code: 'map/connection-unknown-region',
          });
        }
      }
      if (c.kind !== undefined && !['route', 'transmission', 'supply'].includes(c.kind)) {
        issues.push({
          path: `${cAt}.kind`,
          message: 'not a valid kind — one of: route, transmission, supply',
          severity: 'error',
          code: 'map/connection-invalid-kind',
        });
      }
    });
  }

  return issues;
};

export default validate;
