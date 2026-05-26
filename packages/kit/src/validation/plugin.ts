// PluginBase shape validator — the structural sniff `engine.use()` performs
// before dispatching to a registry.
//
// The kit accepts ONLY objects that satisfy `PluginBase` (`kind`, `name`,
// `version` as strings). A misshapen plugin throws at `use()` time with a
// pointed error so a third-party pack's mistake is loud, not silent.

import type {Plugin, PluginBase, PluginKind} from '../protocols';

const VALID_KINDS: readonly PluginKind[] = [
  'scene',
  'preset',
  'tts',
  'feature',
] as const;

/**
 * Validate that an unknown value is a {@link PluginBase}. Throws with a
 * pointed error on misshape; narrows `value` to {@link Plugin} on success.
 *
 * Strictly checks the THREE mandatory fields (`name`, `version`, `kind`).
 * Per-kind extra fields (`sceneType`, `presetName`, etc.) are checked by
 * the matching registry's `register()` — they're branded into the type
 * system there.
 *
 * Used internally by `Engine.use()` to refuse non-object input and
 * malformed plugins before they reach a registry. Exposed for test
 * harnesses and doctor surfaces.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.1
 */
export function assertPluginBase(value: unknown): asserts value is Plugin {
  if (value === null || typeof value !== 'object') {
    throw new Error(
      `[@docent/kit] engine.use() expects a Plugin object; received ${describe(
        value,
      )}.`,
    );
  }
  const v = value as Record<string, unknown>;
  if (typeof v.name !== 'string' || v.name.length === 0) {
    throw new Error(
      `[@docent/kit] engine.use() expects plugin.name as a non-empty string; received ${describe(
        v.name,
      )}.`,
    );
  }
  if (typeof v.version !== 'string' || v.version.length === 0) {
    throw new Error(
      `[@docent/kit] engine.use() expects plugin.version as a non-empty string (plugin "${String(
        v.name,
      )}"); received ${describe(v.version)}.`,
    );
  }
  if (typeof v.kind !== 'string' || !(VALID_KINDS as readonly string[]).includes(v.kind)) {
    throw new Error(
      `[@docent/kit] engine.use() expects plugin.kind to be one of ` +
        `${VALID_KINDS.map((k) => `"${k}"`).join(' | ')} ` +
        `(plugin "${String(v.name)}"); received ${describe(v.kind)}. ` +
        `Note: 'modifier' is NOT a plugin kind — register modifiers via ` +
        `a FeaturePlugin.registerModifiers hook.`,
    );
  }
}

/**
 * Validate a {@link ScenePlugin}'s additional surface (sceneType +
 * cluster + component + schema). Throws on misshape. The cluster
 * value-check (must be one of the 7 closed taxonomy values, or `null`)
 * runs in the scene registry; this fires earlier and catches
 * structurally-wrong shapes (e.g. `sceneType` missing or non-string).
 *
 * Used internally by `Engine.use()` after `assertPluginBase`. Exposed so
 * test harnesses can assert their fixtures match the kit's expectations.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2
 */
export function assertScenePluginShape(plugin: PluginBase): void {
  const v = plugin as unknown as Record<string, unknown>;
  if (typeof v.sceneType !== 'string' || v.sceneType.length === 0) {
    throw new Error(
      `[@docent/kit] ScenePlugin "${plugin.name}" must declare a non-empty sceneType; ` +
        `received ${describe(v.sceneType)}.`,
    );
  }
  if (typeof v.component !== 'function') {
    throw new Error(
      `[@docent/kit] ScenePlugin "${plugin.name}" (sceneType "${String(
        v.sceneType,
      )}") must declare a React component; received ${describe(v.component)}.`,
    );
  }
  if (v.schema === null || typeof v.schema !== 'object') {
    throw new Error(
      `[@docent/kit] ScenePlugin "${plugin.name}" (sceneType "${String(
        v.sceneType,
      )}") must declare a JSON Schema; received ${describe(v.schema)}.`,
    );
  }
  if (!('cluster' in v)) {
    throw new Error(
      `[@docent/kit] ScenePlugin "${plugin.name}" (sceneType "${String(
        v.sceneType,
      )}") must declare a cluster (one of the 7 closed cognitive clusters, ` +
        `or null for chrome-only scenes like 'frame' and 'recap').`,
    );
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'function') return '<function>';
  if (typeof value === 'object') return `<${(value.constructor || Object).name}>`;
  return String(value);
}
