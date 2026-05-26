// ProbeScene — a sensitivity probe.
//
// Migrated from packages/engine/src/scenes/ProbeScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. Behavior is UNCHANGED from the
// v2.5.x renderer; only import paths and the prop shape were updated:
//   - props receive `SceneRenderProps<ProbeSceneSpec>` from @docent/kit
//     (the kit-owned `{scene, common}` envelope), rather than the legacy
//     `SceneProps` (the engine-owned `ts: TimedScene` envelope).
//   - the engine-shared chrome (SceneFrame, Narration, FittedText, fonts,
//     theme, glow, ACCENTS, activeBeatIndex, the cadence/palette knob
//     helpers) lives as colocated underscore-prefixed helpers in this
//     scene's directory until the shared-infra migration agent lands;
//     the integrator will swap the local helpers for shared imports at
//     merge time.
//
// A sensitivity probe: a baseline (its label → its outcome) pinned at the
// top, then a row per variation — the perturbed input, an arrow, the
// resulting outcome, and a flip indicator. `flips: true` is a bold rose
// "flipped" marker; otherwise a muted "held". Variations reveal one beat
// at a time.

import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Beat, BeatCadence, BeatTimelineSlot, SceneRenderProps} from '@docent/kit';

import {
  ACCENTS,
  FittedText,
  Narration,
  SceneFrame,
  activeBeatIndex,
  cadenceOffset,
  cadenceSpringConfig,
  glow,
  interFamily,
  monoFamily,
  numericRevealMap,
  paletteGlowScale,
  paletteSceneHex,
  theme,
} from '../../_shared';

// Local helper type — the projected beat shape `numericRevealMap` reads. Each
// element carries the beat's scene-relative start frame, its numeric `reveal`
// (or undefined / a string[] for non-numeric reveal forms — both of which are
// skipped by the map), and its cadence.
type Cadence = BeatCadence | undefined;
type RevealBeat = {
  from: number;
  reveal?: number | readonly string[] | undefined;
  cadence?: Cadence;
};
import type {ProbeScene as ProbeSceneSpec} from './validate';

// Read the open-index-signature beat fields the engine's ProbeScene used:
// `reveal` (number form for list scenes), `cadence`, and `focus`. These
// are plugin-owned fields the kit's `Beat` type carries as opaque opaque
// values; we narrow them locally where the renderer needs them.
const beatReveal = (beat: Beat): number | readonly string[] | undefined => {
  const v = (beat as {reveal?: unknown}).reveal;
  if (typeof v === 'number') return v;
  if (Array.isArray(v) && v.every((s) => typeof s === 'string')) {
    return v as readonly string[];
  }
  return undefined;
};

const beatCadence = (beat: Beat): Cadence => {
  const v = (beat as {cadence?: unknown}).cadence;
  return v === 'together' || v === 'cascade' || v === 'snap' ? v : undefined;
};

const beatFocus = (beat: Beat): readonly string[] => {
  const v = (beat as {focus?: unknown}).focus;
  if (Array.isArray(v) && v.every((s) => typeof s === 'string')) {
    return v as readonly string[];
  }
  return [];
};

// Adapt the kit's BeatTimelineSlot[] to the RevealBeat[] shape
// `numericRevealMap` walks. The engine's ProbeScene called the helper
// directly against its TimedBeat (which surfaced `from`/`reveal`/`cadence`
// flat); the kit nests beats under `beat`, so we project here at the
// callsite.
const toRevealBeats = (
  beats: ReadonlyArray<BeatTimelineSlot>,
): RevealBeat[] =>
  beats.map((b) => ({
    from: b.startFrame,
    reveal: beatReveal(b.beat),
    cadence: beatCadence(b.beat),
  }));

export const ProbeSceneComponent: React.FC<
  SceneRenderProps<ProbeSceneSpec>
> = ({scene, common}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, style} = common;
  // `palette` (a scene knob) re-selects the chrome accent over its family;
  // without a palette this is exactly `accent(scene.accent)`.
  const accentHex = paletteSceneHex(undefined, undefined, style);
  const baseline = scene.baseline;
  const variations = scene.variations ?? [];

  // `cadence` (a beat knob) shapes how the variations a beat reveals enter —
  // the numeric-reveal map gives each variation's revealing-beat frame,
  // cadence, and batch order. A knob-free scene is byte-identical.
  const reveals = numericRevealMap(toRevealBeats(ts.beats), variations.length);
  const variationEnterFor = (i: number): number => {
    const r = reveals[i];
    return r ? r.from + cadenceOffset(r.cadence, r.order) : 0;
  };

  const active = activeBeatIndex(ts.beats, frame);
  const focusIds = new Set(
    ts.beats[active] ? beatFocus(ts.beats[active]!.beat) : [],
  );
  const hasFocus = focusIds.size > 0;

  const intro = spring({frame, fps, config: {damping: 200}});
  const rowW = 1380;

  // A single change → outcome row, used for both baseline and variations.
  // Row geometry: row is 1380px wide with 56px horizontal padding (28
  // each side). Subtract the arrow column (40), the tag column (132),
  // and the two gaps (22 each). Each text column gets ~585px to itself
  // — wrap to 2 lines and auto-shrink for longer prose.
  const Row: React.FC<{
    change: string;
    outcome: string;
    tag: React.ReactNode;
    arrow: boolean;
  }> = ({change, outcome, tag, arrow}) => {
    const textCol = Math.floor((rowW - 56 - 40 - 132 - 22 * 3) / 2);
    return (
      <div style={{display: 'flex', alignItems: 'center', gap: 22, width: '100%'}}>
        <div style={{flex: 1, minWidth: 0, padding: '0 4px'}}>
          <FittedText
            text={change}
            maxWidth={textCol - 8}
            basePx={21}
            floorPx={13}
            charAdvance={0.62}
            mode="shrink-wrap"
            maxLines={2}
            lineHeight={1.22}
            style={{
              fontFamily: monoFamily,
              fontWeight: 500,
              color: theme.ink.hi,
            }}
          />
        </div>
        <div
          style={{
            fontFamily: monoFamily,
            fontSize: 26,
            color: theme.ink.low,
            width: 40,
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          {arrow ? '→' : ''}
        </div>
        <div style={{flex: 1, minWidth: 0}}>
          <FittedText
            text={outcome}
            maxWidth={textCol}
            basePx={21}
            floorPx={13}
            charAdvance={0.58}
            mode="shrink-wrap"
            maxLines={2}
            lineHeight={1.22}
            style={{
              fontFamily: interFamily,
              fontWeight: 500,
              color: theme.ink.mid,
            }}
          />
        </div>
        <div style={{width: 132, flexShrink: 0, textAlign: 'right'}}>{tag}</div>
      </div>
    );
  };

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker ?? ''}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      glowScale={paletteGlowScale(undefined)}
    >
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <div style={{width: rowW, display: 'flex', flexDirection: 'column', gap: 18}}>
          {/* baseline — pinned at the top */}
          {baseline ? (
            <div
              style={{
                opacity: intro,
                borderRadius: 14,
                background: `radial-gradient(120% 160% at 0% 0%, ${glow(accentHex, 0.12)} 0%, ${theme.bg.panelHi} 46%, ${theme.bg.panel} 100%)`,
                border: `1.5px solid ${accentHex}`,
                boxShadow: `0 0 26px -10px ${glow(accentHex, 0.55)}`,
                padding: '24px 28px',
              }}
            >
              <Row
                change={baseline.label}
                outcome={baseline.outcome}
                arrow
                tag={
                  <span
                    style={{
                      fontFamily: monoFamily,
                      fontSize: 13,
                      letterSpacing: 1,
                      color: accentHex,
                      padding: '5px 11px',
                      borderRadius: 7,
                      background: glow(accentHex, 0.12),
                      border: `1px solid ${glow(accentHex, 0.34)}`,
                    }}
                  >
                    BASELINE
                  </span>
                }
              />
            </div>
          ) : null}

          {/* the perturbations */}
          {variations.map((v, i) => {
            const local = frame - variationEnterFor(i);
            const a =
              local <= 0
                ? 0
                : spring({
                    frame: local,
                    fps,
                    config: cadenceSpringConfig(reveals[i]?.cadence),
                  });
            if (a <= 0) return null;
            const focused = focusIds.has(v.id);
            const dim = hasFocus && !focused;
            const opacity = a * (dim ? 0.36 : 1);
            const flipped = v.flips === true;
            const flipHex = ACCENTS.rose;

            return (
              <div
                key={v.id}
                style={{
                  opacity,
                  transform: `translateX(${interpolate(a, [0, 1], [-22, 0])}px)`,
                  borderRadius: 14,
                  background: `linear-gradient(158deg, ${theme.bg.panelHi}, ${theme.bg.panel})`,
                  border: `1.5px solid ${
                    focused
                      ? flipped
                        ? flipHex
                        : accentHex
                      : flipped
                        ? glow(flipHex, 0.5)
                        : theme.bg.line
                  }`,
                  boxShadow: focused
                    ? `0 0 24px -10px ${glow(flipped ? flipHex : accentHex, 0.55)}`
                    : '0 16px 40px -24px #000000cc',
                  padding: '22px 28px',
                }}
              >
                <Row
                  change={v.change}
                  outcome={v.outcome}
                  arrow
                  tag={
                    flipped ? (
                      <span
                        style={{
                          fontFamily: monoFamily,
                          fontSize: 14,
                          fontWeight: 600,
                          letterSpacing: 0.6,
                          color: flipHex,
                          padding: '6px 12px',
                          borderRadius: 7,
                          background: glow(flipHex, 0.14),
                          border: `1px solid ${flipHex}`,
                        }}
                      >
                        ⤳ flipped
                      </span>
                    ) : (
                      <span
                        style={{
                          fontFamily: monoFamily,
                          fontSize: 14,
                          letterSpacing: 0.6,
                          color: theme.ink.low,
                        }}
                      >
                        held
                      </span>
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
