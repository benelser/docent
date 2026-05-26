// Kit-provided default Remotion entry — a working reference path.
//
// This file IS the entry the kit ships for `remotion render`. The CLI
// generates a per-render entry that statically imports `@docent/core` plus
// any user plugins and calls `registerKitRoot({plugins, spec})`. The kit
// constructs the engine once at module-load time and binds the composition
// to it via a context that survives Remotion's prop serialization.
//
// Why a module-level singleton: Remotion's renderer serializes the props
// every Composition declares to JSON before sending them to chromium. A
// live `Engine` instance has methods (`engine.scenes.get(...)`) — JSON
// strips those. To preserve the engine across the Node-bundle → chromium-
// render hop, we build the engine inside chromium itself, at bundle-load
// time, and keep it module-scoped. The composition reads from this module-
// level engine rather than from props.

import React, {createContext, useContext} from 'react';
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
  type TtsAudioMap,
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
  /**
   * Optional per-beat audio map (indexed by `<sceneIndex>-<beatIndex>`) the
   * CLI's render-entry generator emits inline from the persisted per-film
   * TTS manifest at `<publicDir>/audio/<filmId>/manifest.json`. Threaded into
   * the schedule so the narration feature can attach per-beat `<Audio>`
   * overlays via Remotion's `staticFile()`.
   */
  readonly ttsAudio?: TtsAudioMap;
}

/**
 * Module-level engine + spec singleton. Set by `buildKitRoot` at composition-
 * registration time; read by `<KitFilm>` inside the chromium bundle. Survives
 * Remotion's JSON-only inputProps serialization because both sides of the
 * Node↔chromium hop evaluate the same bundle module-init code.
 */
let _registeredEngine: Engine | null = null;
let _registeredSpec: FilmSpec | null = null;
let _registeredTtsAudio: TtsAudioMap | undefined = undefined;

/**
 * Render-side wrapper that reads the module-level engine + spec singleton
 * and mounts `<DocentFilm>`. The Composition's inputProps are intentionally
 * empty — the engine + spec ride along in module state, not in props.
 *
 * The wrapper resolves the style once per render and threads it into
 * `<DocentFilm>`. Without this, scenes that read `style.tokens.accent.blue`
 * crash because the kit's fallback style ships empty tokens.
 */
const KitFilm: React.FC = () => {
  if (!_registeredEngine || !_registeredSpec) {
    return (
      <div
        style={{
          color: '#ff5252',
          fontFamily: 'monospace',
          fontSize: 24,
          padding: 48,
        }}
      >
        [@docent/kit] no engine/spec registered — call buildKitRoot() in the
        entry before registerRoot().
      </div>
    );
  }
  const style = _registeredEngine.resolveStyle(_registeredSpec);
  return (
    <DocentFilm
      spec={_registeredSpec}
      engine={_registeredEngine}
      style={style}
      {...(_registeredTtsAudio !== undefined ? {ttsAudio: _registeredTtsAudio} : {})}
    />
  );
};

/**
 * Build a Remotion `Root` component that registers exactly one composition
 * (matching `spec.meta.id`) and mounts `<DocentFilm spec engine>`.
 *
 * @example The CLI-generated entry looks like:
 *
 *   import {registerRoot} from 'remotion';
 *   import {buildKitRoot} from '@docent/kit/remotion/entry';
 *   import corePlugins from '@docent/core';
 *   import userPlugins from '/abs/path/to/docent.config.ts';
 *   import spec from '/abs/path/to/film.json';
 *   registerRoot(buildKitRoot({plugins: [...corePlugins, ...userPlugins], spec}));
 */
export const buildKitRoot = (opts: BuildKitRootOptions): React.FC => {
  const engine = new Engine().use(opts.plugins as Plugin[]);
  _registeredEngine = engine;
  _registeredSpec = opts.spec;
  _registeredTtsAudio = opts.ttsAudio;

  const schedule = buildFrameSchedule(opts.spec, engine, opts.ttsAudio);
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

  const Root: React.FC = () => (
    <Composition
      id={compositionId}
      component={KitFilm}
      durationInFrames={durationInFrames}
      fps={fps}
      width={width}
      height={height}
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

// Silence unused-import warnings for items kept for type re-export.
void createContext;
void useContext;
