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

/**
 * Convert a `SceneSchedule` entry into the kit's public `TimelineSlot`.
 *
 * Coordinate-system rule (matches v2.5's `buildTimeline`):
 *   - `TimelineSlot.startFrame`     — ABSOLUTE (the scene's offset in the
 *     global film timeline; the composition uses it for `<Sequence from={}>`).
 *   - `BeatTimelineSlot.startFrame` — SCENE-RELATIVE (the beat's offset
 *     within its scene). Scenes are mounted in a `<Sequence>` so their
 *     `useCurrentFrame()` returns scene-relative frames; beat reveal-gates
 *     compare against that same coordinate. Schedule emits absolute beat
 *     frames internally, so we subtract the scene's absolute start here.
 *
 * Getting this wrong is silent: chrome and headings still render (they
 * don't gate on beats), but every reveal-gated body element stays
 * `hidden` because `useCurrentFrame() < absolute b.startFrame` is always
 * true within the Sequence.
 */
const toTimelineSlot = (entry: SceneSchedule): TimelineSlot => {
  const beats: BeatTimelineSlot[] = entry.beats.map((b) => ({
    beatIndex: b.beatIndex,
    // Subtract the scene's absolute start so this is scene-relative — the
    // same coordinate as `useCurrentFrame()` inside the Sequence.
    startFrame: b.startFrame - entry.startFrame,
    frames: b.frames,
    beat: b.beat,
    // Threaded through so a feature plugin (e.g. narration) can attach a
    // per-beat `<Audio>` overlay via Remotion's `staticFile()`.
    ...(b.audio !== undefined ? {audio: b.audio} : {}),
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
export interface DocentFilmInternalProps extends DocentFilmProps {
  /**
   * Optional per-beat audio map produced by the TTS stage. Indexed by
   * `<sceneIndex>-<beatIndex>`. When set the schedule attaches the file path
   * to each `BeatTimelineSlot` so the narration feature can mount per-beat
   * `<Audio>` overlays. When absent the film renders silently.
   */
  readonly ttsAudio?: import('./schedule').TtsAudioMap;
}

export const DocentFilm: React.FC<DocentFilmInternalProps> = ({
  spec,
  engine,
  style,
  ttsAudio,
}) => {
  const schedule = buildFrameSchedule(spec, engine, ttsAudio);
  const resolvedStyle = style ?? fallbackStyle();
  const sceneCount = schedule.scenes.length;

  // Collect every feature that wants to mount alongside scenes (audio
  // overlay, captions, watermark, …). Held outside the loop so a plugin's
  // component identity is stable across scenes — React reconciliation needs
  // the same type to avoid remounting on every scene boundary.
  const sceneFeatures = engine.features.all().filter((f) => !!f.wrapsScenes);

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
            {sceneFeatures.map((feature) => {
              const FeatureComponent = feature.wrapsScenes!;
              return (
                <FeatureComponent
                  key={`feature-${feature.name}-${entry.sceneIndex}`}
                  ts={ts}
                  sceneIndex={entry.sceneIndex}
                  sceneCount={sceneCount}
                  meta={spec.meta}
                  style={resolvedStyle}
                />
              );
            })}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
