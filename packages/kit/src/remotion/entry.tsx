// Kit-provided default Remotion entry — a working reference path.
//
// This file IS the entry the kit ships for `remotion render`. To stay
// opinion-free, the entry resolves its plugin source at **bundle time** by
// reading two `webpack.DefinePlugin`-style env vars baked into the bundle by
// the invoker (the CLI's render stage). The trick: Remotion bundles via
// webpack; webpack inlines `process.env.X` at compile time when the invoker
// has set up `EnvironmentPlugin`. We avoid that complexity by using a
// SIMPLER pattern instead — the CLI **generates a per-render entry file**
// that statically imports `@docent/core` plus any user plugins and then
// re-exports the kit's `buildKitRoot` helper. This file documents the
// pattern and exposes that helper.
//
// Why generation-time imports (vs. runtime dynamic import): Remotion bundles
// the composition for **chromium**. Anything the entry references must be
// statically reachable at bundle time so webpack can include it in the
// browser bundle. Runtime `import()` resolves at chromium-execution time
// against filesystem paths chromium can't see — it doesn't work.
//
// The kit therefore provides `buildKitRoot({plugins, specPath})` and the
// CLI generates a 5-line entry that calls it. See
// `@docent/cli/src/render-entry.ts` for the generator.

import React from 'react';
import {Composition, registerRoot} from 'remotion';

import {Engine} from '../engine';
import type {Plugin} from '../protocols';
import type {FilmSpec} from '../types/spec';
import {DocentFilm, type DocentFilmProps} from './composition';
import {
  DEFAULT_FPS,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  buildFrameSchedule,
} from './schedule';

/**
 * Options accepted by `buildKitRoot`. The CLI's per-render entry passes
 * `plugins` (statically imported) and `spec` (statically imported from a
 * JSON file written by the cascade). Optional `compositionId` overrides
 * `spec.meta.id` — useful if a caller wants a stable composition id across
 * multiple specs.
 */
export interface BuildKitRootOptions {
  readonly plugins: ReadonlyArray<Plugin>;
  readonly spec: FilmSpec;
  readonly compositionId?: string;
}

/**
 * Build a Remotion `Root` component that registers exactly one composition
 * (matching `spec.meta.id`) and mounts `<DocentFilm spec engine>`.
 *
 * The CLI's per-render entry calls this with statically imported plugins +
 * spec. The engine is constructed at module scope so webpack bundles every
 * referenced scene component for chromium.
 *
 * @example The CLI-generated entry looks like:
 *
 *   import {buildKitRoot} from '@docent/kit/remotion/entry';
 *   import corePlugins from '@docent/core';
 *   import userPlugins from '/abs/path/to/docent.config.ts';
 *   import spec from '/abs/path/to/film.json';
 *   import {registerRoot} from 'remotion';
 *   registerRoot(buildKitRoot({plugins: [...corePlugins, ...userPlugins], spec}));
 */
export const buildKitRoot = (opts: BuildKitRootOptions): React.FC => {
  const engine = new Engine().use(opts.plugins as Plugin[]);
  const schedule = buildFrameSchedule(opts.spec, engine);
  const res = opts.spec.meta.resolution;
  // Legacy films carry fps/width/height directly on meta; honour both shapes.
  const metaAny = opts.spec.meta as unknown as {
    fps?: number;
    width?: number;
    height?: number;
  };
  const fps = res?.fps ?? metaAny.fps ?? DEFAULT_FPS;
  const width = res?.width ?? metaAny.width ?? DEFAULT_WIDTH;
  const height = res?.height ?? metaAny.height ?? DEFAULT_HEIGHT;
  const durationInFrames = Math.max(1, Math.round(schedule.totalFrames));
  const compositionId = opts.compositionId ?? opts.spec.meta.id;

  // Cast through `unknown` because Remotion's Composition constrains props
  // to `Record<string, unknown>`; our `DocentFilmProps` carries typed
  // engine/spec fields the index signature can't widen to. Sound at runtime:
  // <DocentFilm> reads exactly these fields off defaultProps.
  const ComponentForComposition =
    DocentFilm as unknown as React.ComponentType<Record<string, unknown>>;
  const defaultProps: Record<string, unknown> = {
    spec: opts.spec as unknown,
    engine: engine as unknown,
  };

  const Root: React.FC = () => (
    <Composition
      id={compositionId}
      component={ComponentForComposition}
      durationInFrames={durationInFrames}
      fps={fps}
      width={width}
      height={height}
      defaultProps={defaultProps}
    />
  );
  return Root;
};

/**
 * Convenience: build the root and register it in one call. The generated
 * CLI entry uses this directly.
 */
export const registerKitRoot = (opts: BuildKitRootOptions): void => {
  registerRoot(buildKitRoot(opts));
};

// Pin the DocentFilmProps type so it survives `verbatimModuleSyntax` and is
// re-exported for downstream type consumers.
export type {DocentFilmProps};
