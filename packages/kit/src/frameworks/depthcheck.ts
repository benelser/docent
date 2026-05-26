// Depthcheck framework — Phase A.5.
//
// `depthCheck(spec, engine)` is the open-grammar depth gate: for every scene
// in the spec, every registered `ScenePlugin.depthRules` runs over the scene
// (and its beats, by virtue of the rule reading them). FeaturePlugin-level
// rules are aggregated as well — they run film-scoped.
//
// The kit knows NOTHING about what a "deep enough" film looks like. Depth is
// the plugin's concern — a `tension` scene plugin contributes a rule "must
// have at least one resolution beat"; a feature contributes "film has at
// least one tension/recap"; etc. The kit's job is the registry-aware
// orchestration: walk scenes, dispatch rules, collect findings.
//
// Returns a flat `DepthFinding[]`. Empty array = the film clears the depth
// bar declared by every active plugin. Severities are author-chosen at
// rule-declaration time (`error` / `warning` / `info`).
//
// Async-tolerant: a `DepthRule.check` may return a Promise; this function is
// async so a rule that needs to look up something (e.g., probe the spec's
// asset paths) can.

import type {Engine} from '../engine';
import type {
  DepthCheckContext,
  DepthFinding,
  DepthRule,
} from '../protocols';
import type {FilmSpec, Scene} from '../types/spec';

/**
 * Run every registered depth rule over a spec; return the union of findings.
 *
 * Rules are dispatched in three buckets:
 *   1. Scene-scope rules from each `ScenePlugin.depthRules` — run once per
 *      matching scene (matching by sceneType).
 *   2. Film-scope rules from each `ScenePlugin.depthRules` whose `scope ===
 *      'film'` — run once per film. The plugin is responsible for finding
 *      its own scenes via `ctx.filmSpec`.
 *   3. Feature-plugin `depthRules` — always run once per film.
 *
 * The `scope` hint defaults to `'scene'` when omitted (matching the protocol
 * doc's behaviour: a scene plugin's rule is per-scene unless declared otherwise).
 */
export async function depthCheck(
  spec: FilmSpec,
  engine: Engine,
): Promise<DepthFinding[]> {
  const findings: DepthFinding[] = [];

  // --------------------------------------------------------------------------
  // 1+2. Scene-plugin rules — both 'scene' and 'film' scopes.
  // --------------------------------------------------------------------------

  for (const plugin of engine.scenes.all()) {
    const rules = plugin.depthRules;
    if (!rules || rules.length === 0) continue;

    for (const rule of rules) {
      const scope = rule.scope ?? 'scene';
      if (scope === 'film') {
        // Film-scope: run once with the whole spec. The rule reads
        // `ctx.filmSpec` and looks for its own scenes.
        const ctx: DepthCheckContext = {filmSpec: spec};
        await runRule(rule, spec as unknown, ctx, plugin.name, findings);
      } else {
        // Scene-scope: run for each scene whose type matches this plugin.
        for (let i = 0; i < spec.scenes.length; i++) {
          const scene = spec.scenes[i] as Scene | undefined;
          if (!scene || scene.type !== plugin.sceneType) continue;
          const ctx: DepthCheckContext = {filmSpec: spec, sceneIndex: i};
          await runRule(rule, scene as unknown, ctx, plugin.name, findings);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 3. Feature-plugin rules — always film-scope.
  // --------------------------------------------------------------------------

  for (const feature of engine.features.all()) {
    const rules = feature.depthRules;
    if (!rules || rules.length === 0) continue;
    for (const rule of rules) {
      const ctx: DepthCheckContext = {filmSpec: spec};
      await runRule(rule, spec as unknown, ctx, feature.name, findings);
    }
  }

  return findings;
}

/**
 * Invoke a single rule's `check`, catching any throw so a misbehaving plugin
 * doesn't take down the whole depthcheck pass. A throw is converted to a
 * single error-severity finding attributed to the contributing plugin.
 */
async function runRule(
  rule: DepthRule<any>,
  target: unknown,
  ctx: DepthCheckContext,
  source: string,
  findings: DepthFinding[],
): Promise<void> {
  try {
    const result = await rule.check(target as never, ctx);
    if (result) {
      // Re-attribute via the rule's own id — leave the rule's path/message
      // untouched; it knows its scope.
      findings.push(result);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    findings.push({
      ruleId: rule.id,
      path:
        ctx.sceneIndex !== undefined
          ? `scenes[${ctx.sceneIndex}]`
          : '',
      message:
        `Depth rule "${rule.id}" (contributed by "${source}") threw: ${message}`,
      severity: 'error',
    });
  }
}
