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
import {AbsoluteFill, Sequence, interpolate, useCurrentFrame} from 'remotion';

import type {Engine} from '../engine';
import type {
  BeatTimelineSlot,
  CommonSceneProps,
  FilmFeatureBeatSlot,
  FilmFeatureSceneClusterSlot,
  FilmFeatureWordTimingSlot,
  ScenePlugin,
  TimelineSlot,
} from '../protocols';
import type {
  FilmSpec,
  Scene,
  SceneArchetype,
  SceneMorphIds,
  SceneTransition,
  SceneVariant,
} from '../types/spec';
import type {ResolvedStyle} from '../types/style';
import {resolveSceneVariant} from '../frameworks/scene-variants';
import {buildFrameSchedule, type SceneSchedule} from './schedule';
import {findMatchedIds, MorphLayer} from './morph-layer';
import {TtsAudioMapContext} from './word-timings';

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
  // Features that mount ONCE at film scope (bg-music bed, watermark, …).
  // Mounted outside the per-scene Sequence stack so they see absolute
  // frames and don't restart at scene boundaries.
  const filmFeatures = engine.features.all().filter((f) => !!f.wrapsFilm);

  // Flat beat list in ABSOLUTE film coordinates — handed to wrapsFilm
  // features (the audio-bed plugin reads this to detect narration windows
  // for ducking).
  const filmBeats: FilmFeatureBeatSlot[] = [];
  // R8: parallel flat list of per-beat word timings, surfaced from the
  // inlined TtsAudioMap. Indexed by `(sceneIndex, beatIndex)`; the
  // music-bed feature reads it to compose per-WORD ducks rather than
  // per-beat windows. Absent or empty `words[]` ⇒ no entry pushed for
  // that beat ⇒ the feature falls through to per-beat behaviour.
  const filmWordTimings: FilmFeatureWordTimingSlot[] = [];
  // R8: parallel per-scene cluster slot. Emits one entry per scene
  // (regardless of whether a plugin is registered) so a downstream
  // feature can rely on coverage; `cluster` is the plugin's tag when
  // resolvable, `null` otherwise (chrome scenes OR unknown sceneType).
  const filmSceneClusters: FilmFeatureSceneClusterSlot[] = [];
  for (const entry of schedule.scenes) {
    const scenePlugin = engine.scenes.get(entry.scene.type);
    filmSceneClusters.push({
      sceneIndex: entry.sceneIndex,
      sceneType: entry.scene.type,
      startFrame: entry.startFrame,
      endFrame: entry.endFrame,
      // Plugin's CognitiveCluster tag (`null` for chrome scenes). When
      // the scene type isn't registered, we still emit the slot but
      // leave the cluster `null` — a feature that branches on cluster
      // gracefully degrades to its flat path.
      cluster: scenePlugin?.cluster ?? null,
    });
    for (const b of entry.beats) {
      filmBeats.push({
        sceneIndex: entry.sceneIndex,
        beatIndex: b.beatIndex,
        startFrame: b.startFrame, // schedule emits absolute frames internally
        frames: b.frames,
        // BeatSchedule.audio is `string | null | undefined`; project to
        // the narrower `string | undefined` for FilmFeatureBeatSlot —
        // `null` (legacy sentinel) and `undefined` (no clip) both mean
        // "no audio".
        ...(typeof b.audio === 'string' && b.audio.length > 0
          ? {audio: b.audio}
          : {}),
      });
      // Surface the per-beat word timings from the inlined TtsAudioMap
      // when the provider populated them. The shape on the map is
      // `{file, seconds?, words?}` — when `words` is missing or empty
      // we skip the slot (R5's gracefully-degraded baseline).
      const audioEntry = ttsAudio?.[`${entry.sceneIndex}-${b.beatIndex}`];
      const words = audioEntry?.words;
      if (words && words.length > 0) {
        filmWordTimings.push({
          sceneIndex: entry.sceneIndex,
          beatIndex: b.beatIndex,
          // Already frame-quantised + clip-relative — the same shape
          // a karaoke consumer reads via useBeatWordTimings.
          words: words.map((w) => ({
            text: w.text,
            startFrame: w.startFrame,
            endFrame: w.endFrame,
          })),
        });
      }
    }
  }
  const totalFrames = schedule.totalFrames;
  const fps = spec.meta.resolution?.fps ?? 30;

  return (
    <TtsAudioMapContext.Provider value={ttsAudio}>
      <AbsoluteFill>
      {filmFeatures.map((feature) => {
        const FilmComponent = feature.wrapsFilm!;
        return (
          <FilmComponent
            key={`film-feature-${feature.name}`}
            meta={spec.meta}
            totalFrames={totalFrames}
            fps={fps}
            style={resolvedStyle}
            beats={filmBeats}
            // R8: word timings + scene clusters are opt-in. Pass them
            // unconditionally; a feature that doesn't read them simply
            // ignores them. When `filmWordTimings` is empty the
            // music-bed feature falls through to per-beat behaviour.
            wordTimings={filmWordTimings}
            sceneClusters={filmSceneClusters}
          />
        );
      })}
      {schedule.scenes.map((entry) => {
        const plugin = engine.scenes.get(entry.scene.type);
        const ts = toTimelineSlot(entry);
        // Resolve the archetype × variant overlay once per scene. The
        // resolver is pure and returns a frozen bag; the byte-zero path
        // (both tags absent) returns the same singleton every time, so
        // existing films pay no extra cost.
        const sceneTagged = entry.scene as Scene;
        const variantTokens = resolveSceneVariant(
          resolvedStyle,
          sceneTagged.archetype as SceneArchetype | undefined,
          sceneTagged.variant as SceneVariant | undefined,
        );
        const common: CommonSceneProps = {
          ts,
          sceneIndex: entry.sceneIndex,
          sceneCount,
          meta: spec.meta,
          style: resolvedStyle,
          variantTokens,
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
      {/*
        R16.3 — cross-scene transition layers.
        Layering decision (documented at the wrap-Film helpers too):
          1. film-feature plugins (wrapsFilm) — bottom (mounted first).
          2. scene Sequences (above) — render scene content.
          3. transition Sequences (above the scenes) — the morphing
             element occludes the underlying scene chrome the eye is
             meant to follow.
          4. (Anything an editor wraps externally rides above all of these.)

        For each scene boundary where the SUBSEQUENT scene declares an
        explicit `transition` (`morph`, `dissolve`, `wipe`), mount a
        `<Sequence>` covering the carved-out tail of scene A. The
        schedule extended scene A's `endFrame` by
        `incomingTransitionFrames` so scene A keeps rendering through
        the window; scene B mounts cleanly at the END of the window
        (no double-render under the transition layer).
      */}
      {schedule.scenes.map((entry, idx) => {
        const next = schedule.scenes[idx + 1];
        if (!next) return null;
        const overlap = entry.incomingTransitionFrames ?? 0;
        if (overlap <= 0) return null;
        const incoming = (next.scene as Scene & {transition?: SceneTransition})
          .transition;
        if (!incoming || incoming.kind === 'cut') return null;
        const transitionStart = entry.endFrame - overlap;
        const fromMorph =
          incoming.kind === 'morph'
            ? ((entry.scene as Scene & {morphIds?: SceneMorphIds}).morphIds)
            : undefined;
        const toMorph =
          incoming.kind === 'morph'
            ? ((next.scene as Scene & {morphIds?: SceneMorphIds}).morphIds)
            : undefined;
        const matched =
          incoming.kind === 'morph' ? findMatchedIds(fromMorph, toMorph) : [];
        // R16.3 smart default: when an author asked for morph but no ids
        // bound between the two scenes, fall back to a dissolve so the
        // cut still feels intentional. The author can see this in the
        // build logs (validator warning).
        const effectiveKind =
          incoming.kind === 'morph' && matched.length === 0
            ? 'dissolve'
            : incoming.kind;
        return (
          <Sequence
            key={`transition-${entry.sceneIndex}-${next.sceneIndex}`}
            from={transitionStart}
            durationInFrames={overlap}
            name={`transition:${effectiveKind}#${entry.sceneIndex}->${next.sceneIndex}`}
          >
            <TransitionWindow
              kind={effectiveKind}
              fromMorph={fromMorph}
              toMorph={toMorph}
              totalFrames={overlap}
              resolvedStyle={resolvedStyle}
            />
          </Sequence>
        );
      })}
      </AbsoluteFill>
    </TtsAudioMapContext.Provider>
  );
};

/**
 * R16.3 — the in-Sequence component that reads `useCurrentFrame()` to
 * sample the transition's progress and dispatches to the right visual
 * (morph layer, dissolve, or wipe). Pulled out as a stateless component
 * so the composition stays readable.
 *
 * Dissolve / wipe are minimal-effort baselines (a full-canvas overlay
 * tweens its opacity / clip-path). The morph case delegates to
 * `<MorphLayer>` which carries the real R16.3 logic.
 */
const TransitionWindow: React.FC<{
  readonly kind: 'morph' | 'dissolve' | 'wipe';
  readonly fromMorph: SceneMorphIds | undefined;
  readonly toMorph: SceneMorphIds | undefined;
  readonly totalFrames: number;
  readonly resolvedStyle: ResolvedStyle;
}> = ({kind, fromMorph, toMorph, totalFrames, resolvedStyle}) => {
  const frame = useCurrentFrame();
  if (kind === 'morph' && fromMorph && toMorph) {
    return (
      <MorphLayer
        fromIds={fromMorph}
        toIds={toMorph}
        frameInWindow={frame}
        totalFrames={totalFrames}
      />
    );
  }
  if (kind === 'dissolve') {
    // A simple dissolve: a full-canvas panel of the resolved background
    // fades up to opacity 1 over the window. The next scene mounts
    // immediately after this Sequence ends, so the dissolve reads as
    // "scene A fades to a neutral plate, scene B pops in". Cheap, but
    // intentional — matches the R16.3 "fall back to dissolve" smart
    // default for unmatched morphs.
    const opacity = interpolate(frame, [0, totalFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    return (
      <AbsoluteFill
        style={{
          backgroundColor: resolvedStyle.tokens?.bg?.base ?? '#0a0a0a',
          opacity,
          pointerEvents: 'none',
        }}
      />
    );
  }
  if (kind === 'wipe') {
    // Left-to-right wipe — a black panel slides across the canvas.
    const t = interpolate(frame, [0, totalFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const clip = `inset(0 0 0 ${t * 100}%)`;
    return (
      <AbsoluteFill
        style={{
          backgroundColor: resolvedStyle.tokens?.bg?.base ?? '#0a0a0a',
          clipPath: clip,
          pointerEvents: 'none',
        }}
      />
    );
  }
  return null;
};
