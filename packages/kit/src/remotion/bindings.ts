// bindings — glue between a docent `FilmSpec` and Remotion's `<Composition>`.
//
// Remotion's composition surface is a `{id, component, durationInFrames, fps,
// width, height, defaultProps}` bag. The kit owns the projection from a
// validated `FilmSpec` + populated `Engine` to that bag — callers (the CLI,
// `@docent/engine`'s Remotion `Root`, a third-party studio embed) read the
// returned `CompositionConfig` straight into `<Composition {...config} />`
// or `selectComposition` for headless renders.
//
// This file is intentionally a *thin* projection: the heavy lifting lives in
// `schedule.ts` (timing) and `composition.tsx` (the React tree). `mountComposition`
// composes those into the shape Remotion's registration API wants.

import type {ComponentType} from 'react';

import type {Engine} from '../engine';
import type {FilmSpec} from '../types/spec';
import type {ResolvedStyle} from '../types/style';
import {
  DocentFilm,
  type DocentFilmProps,
} from './composition';
import {
  DEFAULT_FPS,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  buildFrameSchedule,
} from './schedule';

/**
 * The Remotion-shaped configuration `<Composition>` consumes. Mirrors the
 * props of `remotion`'s `<Composition>` — kept structurally identical so a
 * caller can spread it directly:
 *
 * ```tsx
 * const config = mountComposition(spec, engine);
 * return <Composition {...config} />;
 * ```
 *
 * The `defaultProps` slot carries the typed props that flow through to
 * `<DocentFilm>` — `spec`, `engine`, and an optional pre-resolved `style`.
 */
export interface CompositionConfig {
  readonly id: string;
  readonly component: ComponentType<DocentFilmProps>;
  readonly durationInFrames: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly defaultProps: DocentFilmProps;
}

/** Options accepted by `mountComposition`. */
export interface MountCompositionOptions {
  /**
   * Pre-resolved style bundle. Phase A.7's `engine.resolveStyle(spec)`
   * produces this; when omitted the composition runs a minimal fallback
   * so `remotion studio` works on a fresh spec.
   */
  readonly style?: ResolvedStyle;
  /**
   * Override the composition id. Defaults to `spec.meta.id`.
   */
  readonly id?: string;
}

/**
 * Project a docent film into a Remotion composition config.
 *
 * The single thin glue function the CLI and a third-party `Root` mount.
 * Reads `meta.resolution` (with kit-wide defaults), walks the spec via
 * `buildFrameSchedule` to compute the total frame count, and packages the
 * `<DocentFilm>` component plus typed `defaultProps`.
 *
 * Does NOT validate. Callers should run `engine.validate(spec)` first;
 * `mountComposition` assumes the spec is structurally sound and computes
 * its timeline.
 */
export const mountComposition = (
  spec: FilmSpec,
  engine: Engine,
  opts: MountCompositionOptions = {},
): CompositionConfig => {
  const schedule = buildFrameSchedule(spec, engine);
  const res = spec.meta.resolution;
  return {
    id: opts.id ?? spec.meta.id,
    component: DocentFilm,
    durationInFrames: Math.max(1, Math.round(schedule.totalFrames)),
    fps: res?.fps ?? DEFAULT_FPS,
    width: res?.width ?? DEFAULT_WIDTH,
    height: res?.height ?? DEFAULT_HEIGHT,
    defaultProps: {
      spec,
      engine,
      ...(opts.style ? {style: opts.style} : {}),
    },
  };
};
