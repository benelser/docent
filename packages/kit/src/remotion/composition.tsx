// composition — the React/Remotion entry point for a kit-driven film.
//
// `<DocentFilm spec engine />` is the thin shell every render path mounts.
// It iterates `spec.scenes`, looks up each one's plugin in
// `engine.scenes.get(scene.type)`, and renders the plugin's `component` with
// the kit's `SceneRenderProps` shape.
//
// What this file does NOT do:
//   - own transitions (a feature plugin can wrap each scene to add cross-fades;
//     the kit keeps the surface minimal and uses plain `<Sequence>` here);
//   - resolve style (a caller passes a `ResolvedStyle` via the optional `style`
//     prop, or the engine's `resolveStyle` is run upstream — Phase A.7 lands
//     the cascade);
//   - synthesize audio (Phase A.5 owns TTS; this composition is silent until
//     a feature plugin adds an `<Audio>` overlay).
//
// The shape of `SceneRenderProps` is the public contract: every registered
// `ScenePlugin.component` receives `{scene, common}`, where `common` carries
// timing, style, and meta. A scene plugin can rely on this exactly.

import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';

import type {Engine} from '../engine';
import type {
  BeatTimelineSlot,
  CommonSceneProps,
  ScenePlugin,
  TimelineSlot,
} from '../protocols';
import type {FilmSpec} from '../types/spec';
import type {ResolvedStyle} from '../types/style';
import {buildFrameSchedule, type SceneSchedule} from './schedule';

/**
 * Props of the kit's composition. `spec` is the validated film, `engine` is
 * the populated kit instance whose `scenes` registry resolves each
 * `scene.type` to a `ScenePlugin`. `style` is the (optional) pre-resolved
 * style bundle — when omitted the composition renders with the minimal
 * fallback so a fresh spec is still drivable from `remotion studio`.
 */
export interface DocentFilmProps {
  readonly spec: FilmSpec;
  readonly engine: Engine;
  /**
   * Pre-resolved style bundle. When omitted, a minimal fallback is threaded
   * into every scene; Phase A.7's `engine.resolveStyle(spec)` is the
   * production path that produces this.
   */
  readonly style?: ResolvedStyle;
}

/**
 * The minimal `ResolvedStyle` the composition falls back to when no caller-
 * provided style is threaded. Lets `remotion studio` mount the composition
 * before the style cascade has landed.
 *
 * Note: the kit deliberately fills in placeholder token & visualization
 * objects. Real renderers should run `engine.resolveStyle()` upstream;
 * this fallback exists only so the composition does not crash at preview.
 */
const fallbackStyle = (): ResolvedStyle =>
  ({
    preset: 'neutral',
    intent: {},
    tokens: {} as ResolvedStyle['tokens'],
    visualization: {} as ResolvedStyle['visualization'],
    provenance: {
      preset: 'neutral',
      intent: {},
      hasTokenOverrides: false,
      hasUserOverrides: false,
    },
  });

/** Convert a `SceneSchedule` entry into the kit's public `TimelineSlot`. */
const toTimelineSlot = (entry: SceneSchedule): TimelineSlot => {
  const beats: BeatTimelineSlot[] = entry.beats.map((b) => ({
    beatIndex: b.beatIndex,
    startFrame: b.startFrame,
    frames: b.frames,
    beat: b.beat,
  }));
  return {
    startFrame: entry.startFrame,
    frames: entry.frames,
    beats,
  };
};

/**
 * Render one scene by looking up its plugin in the engine registry and
 * mounting the plugin's `component` with the kit's shared `SceneRenderProps`.
 *
 * An unregistered `scene.type` is a validation-time error; this renderer
 * surfaces it visibly in dev (the studio preview renders a placeholder card)
 * rather than crashing the whole composition.
 */
const RenderedScene: React.FC<{
  entry: SceneSchedule;
  sceneCount: number;
  plugin: ScenePlugin<any> | undefined;
  common: CommonSceneProps;
}> = ({entry, plugin, common}) => {
  if (!plugin) {
    // Visible placeholder so a typo'd scene.type doesn't silently disappear.
    // Validation should have caught this upstream; we render rather than throw
    // so the studio preview remains usable while authoring.
    return (
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ff5252',
          fontFamily: 'monospace',
          fontSize: 24,
          padding: 48,
          textAlign: 'center',
        }}
      >
        unknown scene type: {entry.scene.type}
        <br />
        scene #{entry.sceneIndex}
      </AbsoluteFill>
    );
  }
  const Component = plugin.component;
  return <Component scene={entry.scene as any} common={common} />;
};

/**
 * `<DocentFilm>` — the kit-driven composition entry point.
 *
 * Iterates `spec.scenes`, resolves each via `engine.scenes`, mounts the
 * plugin's component inside a Remotion `<Sequence>` keyed by absolute
 * frame. Returns an `<AbsoluteFill>` so a feature plugin can layer audio,
 * captions, watermarks, lower-thirds, etc. over the scene track.
 */
export const DocentFilm: React.FC<DocentFilmProps> = ({spec, engine, style}) => {
  const schedule = buildFrameSchedule(spec, engine);
  const resolvedStyle = style ?? fallbackStyle();
  const sceneCount = schedule.scenes.length;

  return (
    <AbsoluteFill>
      {schedule.scenes.map((entry) => {
        const plugin = engine.scenes.get(entry.scene.type);
        const ts = toTimelineSlot(entry);
        const common: CommonSceneProps = {
          ts,
          sceneIndex: entry.sceneIndex,
          sceneCount,
          meta: spec.meta,
          style: resolvedStyle,
        };
        return (
          <Sequence
            key={entry.scene.id ?? `scene-${entry.sceneIndex}`}
            from={entry.startFrame}
            durationInFrames={entry.frames}
            name={`${entry.scene.type}#${entry.sceneIndex}`}
          >
            <RenderedScene
              entry={entry}
              sceneCount={sceneCount}
              plugin={plugin}
              common={common}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
