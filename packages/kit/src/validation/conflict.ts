// Registry conflict detection — Phase A safety net.
//
// Per §6 of the strategy doc: when two plugins register the same
// `sceneType`, `presetName`, or `providerId`, hard-fail with BOTH names in
// the error message. This is the discipline that keeps the fan-out parallel
// safe — an integrator can spot which two plugins clash without spelunking.

/**
 * Hard-fail when two plugins try to register the same id. Always surfaces
 * both plugin names so the integrator can resolve the conflict immediately
 * without spelunking.
 *
 * `kind` is the human-readable name of the collision domain
 * (e.g. `'sceneType'`, `'presetName'`, `'providerId'`, `'feature name'`).
 *
 * @throws {@link RegistryConflictError} — always; the function's return
 * type is `never`.
 *
 * @see docs/design/plugin-architecture-strategy.md §6 (conflict policy)
 */
export function assertNoConflict(
  kind: string,
  id: string,
  existingPluginName: string,
  incomingPluginName: string,
): never {
  // Note: this function ALWAYS throws when called — the call site only
  // invokes it on detected conflict.
  throw new RegistryConflictError(
    kind,
    id,
    existingPluginName,
    incomingPluginName,
  );
}

/**
 * Thrown when two plugins try to register the same id within a registry
 * (sceneType, presetName, providerId, feature name). Surfaces the conflict
 * fields so tooling (the doctor surface, the cascade's preflight) can
 * match on it via `instanceof` or by reading the structured fields.
 *
 * @see docs/design/plugin-architecture-strategy.md §6
 */
export class RegistryConflictError extends Error {
  /** The collision domain — `'sceneType'`, `'presetName'`, etc. */
  readonly kind: string;
  /** The colliding id. */
  readonly id: string;
  /** The plugin that registered first. */
  readonly existingPluginName: string;
  /** The plugin that tried to register the duplicate. */
  readonly incomingPluginName: string;

  constructor(
    kind: string,
    id: string,
    existingPluginName: string,
    incomingPluginName: string,
  ) {
    super(
      `[@bjelser/kit] Registry conflict: ${kind} "${id}" registered by ` +
        `both "${existingPluginName}" and "${incomingPluginName}". ` +
        `Each ${kind} must be globally unique within the active engine. ` +
        `Resolve by removing or renaming one of the plugins.`,
    );
    this.name = 'RegistryConflictError';
    this.kind = kind;
    this.id = id;
    this.existingPluginName = existingPluginName;
    this.incomingPluginName = incomingPluginName;
  }
}
