// Validation framework — Phase A.4.
//
// `validateSpec(spec, engine)` is the implementation behind `Engine.validate()`.
// It is the kit's structural validator: it iterates the spec, dispatches each
// scene to its registered `ScenePlugin.validate?` hook, and aggregates the
// returned per-scene issues into a flat list. It also performs film-level
// structural checks the kit itself owns (every spec carries `meta` + `scenes`,
// every scene declares a `type`, every scene type is registered).
//
// What lives here:
//   - Top-level shape checks (`meta`, `scenes`, the `scenes[].type` discriminator).
//   - Registry-aware checks (every `scene.type` must match a registered
//     `ScenePlugin.sceneType`).
//   - Dispatch to per-plugin `validate` hooks; the kit DOES NOT know what a
//     `frame` scene's fields are — that knowledge is the plugin's.
//
// What does NOT live here (deferred):
//   - JSON Schema (AJV) validation against `engine.schema()` — Phase A.8
//     wires the schema computation; future work composes AJV on top. The
//     contract is stable from day 1: `validateSpec` returns `Issue[]`, the
//     caller chooses how to surface.
//   - FeaturePlugin `preprocessSpec` (R6) — the engine will run this BEFORE
//     calling `validateSpec`; the validator itself is a pure function.
//
// Returns: an array of `Issue`. Empty array = clean. Severity 'error' means
// the spec is unsafe to render; 'warning' means it renders but the author
// should look.

import type {Engine} from '../engine';
import type {FeaturePlugin, Issue, SceneIssue, ScenePlugin} from '../protocols';
import type {FilmSpec, Scene} from '../types/spec';
import {
  STYLE_AUDIENCES,
  STYLE_DENSITIES,
  STYLE_EMPHASES,
  STYLE_MEDIUMS,
  STYLE_THEMES,
  STYLE_TONES,
} from '../types/style';

/**
 * The closed enums for every `style.intent` key. Pulled from the runtime
 * vocabulary exports so a typo like `tone: 'execcutive'` is caught at
 * validate time — the schema fragment alone doesn't help, because the
 * kit's validator does not yet run AJV at runtime.
 */
const INTENT_ENUMS: Readonly<Record<string, readonly string[]>> = {
  tone: STYLE_TONES,
  audience: STYLE_AUDIENCES,
  medium: STYLE_MEDIUMS,
  density: STYLE_DENSITIES,
  theme: STYLE_THEMES,
  emphasis: STYLE_EMPHASES,
};
const INTENT_KEYS = Object.keys(INTENT_ENUMS);

/**
 * Validate a candidate film spec against the active engine. The pure
 * function behind {@link Engine.validate}. Surfaced as a standalone export
 * so a doctor surface or custom CI gate can call it directly.
 *
 * Flow:
 *   1. Film-level structural checks — `meta`, `scenes` must exist and be of
 *      the right shape.
 *   2. For each scene: confirm `type` is a non-empty string AND matches a
 *      registered `ScenePlugin.sceneType`.
 *   3. For each scene whose plugin declares `validate?`, call it and pull in
 *      its {@link SceneIssue}s (re-rooting the path to `scenes[i].…`).
 *
 * @returns A flat {@link Issue} array. Empty means the spec is
 * structurally clean.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.7
 */
export function validateSpec(
  spec: unknown,
  engine: Engine,
  opts?: {readonly projectRoot?: string},
): Issue[] {
  const issues: Issue[] = [];

  // ---- film-level structural checks ----------------------------------------

  if (spec === null || typeof spec !== 'object') {
    issues.push({
      path: '',
      message: `FilmSpec must be an object; received ${describe(spec)}.`,
      severity: 'error',
      code: 'spec.not-object',
    });
    return issues;
  }
  const s = spec as Record<string, unknown>;

  if (s.meta === null || typeof s.meta !== 'object') {
    issues.push({
      path: 'meta',
      message: `FilmSpec.meta is required and must be an object; received ${describe(
        s.meta,
      )}.`,
      severity: 'error',
      code: 'meta.missing',
    });
  } else {
    const meta = s.meta as Record<string, unknown>;
    if (typeof meta.id !== 'string' || meta.id.length === 0) {
      issues.push({
        path: 'meta.id',
        message: `FilmSpec.meta.id is required and must be a non-empty string.`,
        severity: 'error',
        code: 'meta.id.missing',
      });
    }
    if (typeof meta.title !== 'string' || meta.title.length === 0) {
      issues.push({
        path: 'meta.title',
        message: `FilmSpec.meta.title is required and must be a non-empty string.`,
        severity: 'error',
        code: 'meta.title.missing',
      });
    }
  }

  if (!Array.isArray(s.scenes)) {
    issues.push({
      path: 'scenes',
      message: `FilmSpec.scenes is required and must be an array; received ${describe(
        s.scenes,
      )}.`,
      severity: 'error',
      code: 'scenes.missing',
    });
    // We can't iterate scenes if it's not an array — return early with
    // whatever else we've accumulated.
    return issues;
  }
  if (s.scenes.length === 0) {
    issues.push({
      path: 'scenes',
      message: `FilmSpec.scenes is empty — a film must have at least one scene.`,
      severity: 'warning',
      code: 'scenes.empty',
    });
  }

  // ---- per-scene checks ----------------------------------------------------

  const filmId = ((s.meta as Record<string, unknown> | undefined)?.id ??
    '<unknown>') as string;

  s.scenes.forEach((scene, sceneIndex) => {
    const path = `scenes[${sceneIndex}]`;
    if (scene === null || typeof scene !== 'object') {
      issues.push({
        path,
        message: `Scene must be an object; received ${describe(scene)}.`,
        severity: 'error',
        code: 'scene.not-object',
      });
      return;
    }
    const sc = scene as Record<string, unknown>;
    if (typeof sc.type !== 'string' || sc.type.length === 0) {
      issues.push({
        path: `${path}.type`,
        message: `Scene.type is required and must be a non-empty string discriminator.`,
        severity: 'error',
        code: 'scene.type.missing',
      });
      return;
    }
    const plugin = engine.scenes.get(sc.type);
    if (!plugin) {
      issues.push({
        path: `${path}.type`,
        message:
          `Scene.type "${sc.type}" is not registered with the active engine. ` +
          `Register a ScenePlugin (engine.use(plugin)) that declares ` +
          `sceneType: "${sc.type}" before validating this film.`,
        severity: 'error',
        code: 'scene.type.unknown',
      });
      return;
    }

    // The plugin's own validator — only run when declared. The kit knows
    // nothing about per-scene-type fields.
    if (plugin.validate) {
      const sceneIssues = runPluginValidate(plugin, sc as Scene, {
        filmId,
        sceneIndex,
        ...(opts?.projectRoot !== undefined
          ? {projectRoot: opts.projectRoot}
          : {}),
      });
      for (const si of sceneIssues) {
        issues.push(reroot(si, path, plugin.name));
      }
    }
  });

  // ---- film-level style cross-checks --------------------------------------
  // The schema accepts any string for `style.preset` because the schema is
  // pure (it can't reach into the engine's preset registry). Without this
  // cross-check, a typo like `"preset": "engineerng"` validates clean and
  // only blows up at render time inside `resolveStyle`. Surface it early so
  // the author finds the typo at `docent validate` time, not on minute 3 of
  // a render.
  const style = (s as {style?: unknown}).style;
  if (style && typeof style === 'object') {
    const presetName = (style as {preset?: unknown}).preset;
    if (typeof presetName === 'string' && presetName.length > 0) {
      // The kit's `resolveStyle` honours 'neutral' as the implicit floor
      // even when no preset is registered with that name. Mirror that
      // behaviour here so the validator does not contradict the resolver.
      if (presetName !== 'neutral' && !engine.presets.has(presetName)) {
        const known = engine.presets
          .all()
          .map((p) => p.presetName)
          .sort();
        issues.push({
          path: 'style.preset',
          message:
            `style.preset "${presetName}" is not registered. ` +
            (known.length > 0
              ? `Registered presets: ${known.join(', ')}.`
              : '(no presets registered).'),
          severity: 'error',
          code: 'style/preset-not-registered',
        });
      }
    }

    // `style.intent` keys + values are CLOSED enums. The schema fragment
    // pins them but the kit doesn't run AJV at validate time, so a typo
    // ("tonne" or "execcutive") slips through into the resolver where it
    // silently no-ops. Surface both classes of typo here.
    const intent = (style as {intent?: unknown}).intent;
    if (intent && typeof intent === 'object' && !Array.isArray(intent)) {
      for (const [key, value] of Object.entries(intent as Record<string, unknown>)) {
        const enumList = INTENT_ENUMS[key];
        if (!enumList) {
          issues.push({
            path: `style.intent.${key}`,
            message:
              `style.intent.${key} is not a recognised intent key. ` +
              `Allowed keys: ${INTENT_KEYS.join(', ')}.`,
            severity: 'error',
            code: 'style/intent-unknown-key',
          });
          continue;
        }
        if (typeof value !== 'string' || !enumList.includes(value)) {
          issues.push({
            path: `style.intent.${key}`,
            message:
              `style.intent.${key} = ${JSON.stringify(value)} is not valid. ` +
              `Allowed values: ${enumList.join(', ')}.`,
            severity: 'error',
            code: 'style/intent-bad-value',
          });
        }
      }
    }
  }

  // ---- feature-level film validation --------------------------------------
  // Every registered feature gets a chance to surface film-scope issues —
  // the audio-bed feature uses this to verify `meta.music` resolves to a
  // file on disk before the slow render. A throw is caught and surfaced
  // as a structured error attributed to the plugin (same pattern as the
  // per-scene runner).
  const features = engine.features.all();
  for (const feature of features) {
    if (!feature.validateSpec) continue;
    const filmIssues = runFeatureValidate(feature, s as unknown as FilmSpec, {
      filmId,
      ...(opts?.projectRoot !== undefined
        ? {projectRoot: opts.projectRoot}
        : {}),
    });
    for (const si of filmIssues) {
      issues.push(reroot(si, '', feature.name));
    }
  }

  return issues;
}

/**
 * Invoke a feature's `validateSpec` hook, catching any throw so a
 * misbehaving plugin doesn't take down the whole validator.
 */
function runFeatureValidate(
  feature: FeaturePlugin,
  spec: FilmSpec,
  ctx: {filmId: string; projectRoot?: string},
): ReadonlyArray<SceneIssue> {
  try {
    return feature.validateSpec!(spec, ctx) ?? [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [
      {
        path: '',
        message:
          `FeaturePlugin "${feature.name}" threw while validating: ${message}`,
        severity: 'error',
        code: 'plugin.validate.threw',
      },
    ];
  }
}

/**
 * Invoke a plugin's `validate` hook, catching any throw so a misbehaving
 * plugin doesn't take down the whole validator. Throws are converted to a
 * single error-severity Issue attributed to the plugin.
 */
function runPluginValidate(
  plugin: ScenePlugin<any>,
  scene: Scene,
  ctx: {filmId: string; sceneIndex: number; projectRoot?: string},
): SceneIssue[] {
  try {
    return plugin.validate!(scene, ctx) ?? [];
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    return [
      {
        path: '',
        message:
          `ScenePlugin "${plugin.name}" (sceneType "${plugin.sceneType}") ` +
          `threw while validating: ${message}`,
        severity: 'error',
        code: 'plugin.validate.threw',
      },
    ];
  }
}

/**
 * Re-root a SceneIssue's path under the film-level scene path, and attribute
 * the issue to the plugin that produced it.
 */
function reroot(issue: SceneIssue, scenePath: string, source: string): Issue {
  const path = issue.path
    ? issue.path.startsWith('[') || issue.path.startsWith('.')
      ? `${scenePath}${issue.path}`
      : scenePath
        ? `${scenePath}.${issue.path}`
        : issue.path
    : scenePath;
  return {
    path,
    message: issue.message,
    severity: issue.severity,
    ...(issue.code !== undefined ? {code: issue.code} : {}),
    source,
  };
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (Array.isArray(value)) return `<array(${value.length})>`;
  if (typeof value === 'object') return `<${(value.constructor || Object).name}>`;
  return String(value);
}

// ---------------------------------------------------------------------------
// Smoke — proves validate + schema work end-to-end with the Engine smoke from
// A.1. Not a vitest suite (the kit doesn't carry a runner yet); it's a pure
// function exported alongside the validator so a future test harness can pull
// it in, and so the type-checker exercises the surface during `tsc`.
// ---------------------------------------------------------------------------

/**
 * Smoke test: register a fake ScenePlugin, validate a tiny spec, assert the
 * shape of the returned issues. Throws on failure, returns `true` on pass.
 *
 * Intended as a sanity hook — run by hand from a REPL or wired into a future
 * test runner. Not invoked at import time.
 */
export function __smokeValidateAndSchema(EngineCtor: typeof Engine): boolean {
  const engine = new EngineCtor();

  // Register a minimum ScenePlugin so the validator has something to dispatch.
  engine.use({
    kind: 'scene',
    name: 'smoke',
    version: '0.0.0',
    sceneType: 'smoke',
    cluster: null,
    schema: {type: 'object', required: ['type'], properties: {type: {const: 'smoke'}}},
    component: (() => null) as unknown as ScenePlugin['component'],
    validate(scene) {
      const sc = scene as {label?: unknown};
      if (typeof sc.label !== 'string') {
        return [
          {
            path: 'label',
            message: 'smoke scene requires a string label',
            severity: 'error' as const,
            code: 'smoke.label.missing',
          },
        ];
      }
      return [];
    },
  } as ScenePlugin);

  // 1. valid spec — should have zero issues
  const clean = engine.validate({
    meta: {id: 'smoke-film', title: 'Smoke'},
    scenes: [{type: 'smoke', label: 'hi'}],
  });
  if (clean.length !== 0) {
    throw new Error(
      `smoke: expected 0 issues for a clean spec; got ${JSON.stringify(clean)}`,
    );
  }

  // 2. missing meta — should surface meta.missing
  const dirtyMeta = engine.validate({scenes: []});
  if (!dirtyMeta.some((i) => i.code === 'meta.missing')) {
    throw new Error(
      `smoke: expected 'meta.missing' issue for spec without meta; got ${JSON.stringify(
        dirtyMeta,
      )}`,
    );
  }

  // 3. unknown scene type — should surface scene.type.unknown
  const dirtyType = engine.validate({
    meta: {id: 'smoke', title: 'Smoke'},
    scenes: [{type: 'nope'}],
  });
  if (!dirtyType.some((i) => i.code === 'scene.type.unknown')) {
    throw new Error(
      `smoke: expected 'scene.type.unknown' issue; got ${JSON.stringify(dirtyType)}`,
    );
  }

  // 4. plugin validator surfaces — re-rooted
  const dirtyLabel = engine.validate({
    meta: {id: 'smoke', title: 'Smoke'},
    scenes: [{type: 'smoke'}],
  });
  const labelIssue = dirtyLabel.find((i) => i.code === 'smoke.label.missing');
  if (!labelIssue) {
    throw new Error(
      `smoke: expected plugin-contributed issue; got ${JSON.stringify(dirtyLabel)}`,
    );
  }
  if (labelIssue.path !== 'scenes[0].label') {
    throw new Error(
      `smoke: expected path 'scenes[0].label'; got '${labelIssue.path}'`,
    );
  }
  if (labelIssue.source !== 'smoke') {
    throw new Error(
      `smoke: expected source 'smoke'; got '${labelIssue.source}'`,
    );
  }

  // 5. schema() — computed union exists, has a `oneOf` discriminated branch
  const sch = engine.schema();
  if (!sch || typeof sch !== 'object') {
    throw new Error(`smoke: schema() returned non-object: ${describe(sch)}`);
  }

  // Narrow: keep FilmSpec import live so tsc sees it.
  const _typed: FilmSpec | undefined = undefined;
  void _typed;

  return true;
}
