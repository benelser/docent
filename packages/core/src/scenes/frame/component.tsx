// FrameScene — the opening chrome of every film.
//
// Migrated from packages/engine/src/scenes/FrameScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. Behavior is UNCHANGED from
// the v2.5.x renderer; only import paths and the prop shape were updated:
//   - props receive `SceneRenderProps<FrameSceneSpec>` from @docent/kit
//     (the kit-owned `{scene, common}` envelope), rather than the legacy
//     `SceneProps & {style}` (the engine-owned `ts: TimedScene` envelope
//     with style threaded separately).
//   - beat lookup walks the kit's BeatTimelineSlot[] (which exposes
//     `startFrame` and nests the user-declared beat under `.beat`) rather
//     than the legacy TimedBeat[] (which surfaced `show`/`from` directly).
//   - the engine-shared chrome (SceneFrame, Narration, FittedText, fonts)
//     lives as colocated helpers in this scene's directory until the
//     shared-infra migration agent lands; the integrator will swap the
//     underscore-prefixed local helpers for shared imports at merge time.
//
// The frame is the film's setup: a faux-prompt with the film id, a large
// hero title, an optional divider + tagline, and an optional small mono
// footnote. Beats named `title`, `tagline`, and `footnote` (via the
// open-index `show` field on a beat) gate the spring-in of each element;
// the renderer auto-shrinks long text in tiered steps so a long title
// stays inside the safe band.

import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Beat, BeatTimelineSlot, ResolvedStyle, SceneRenderProps} from '@docent/kit';

import {Narration} from './_narration';
import {SceneFrame} from './_scene-frame';
import type {FrameScene as FrameSceneSpec} from './validate';

// Style-driven accent resolution — reads the closed accent palette off the
// resolved tokens. Mirrors theme.ts `accent()` but sourced from tokens, so
// presets that redefine a hue (e.g. paper's blue is marker-ink) take effect.
const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string | undefined>;
  return (key ? map[key] : undefined) ?? map.blue ?? '#5cb6ff';
};

// The v2.5.x engine surfaced a beat's user-declared `show` (and other
// plugin-owned beat fields) directly on the TimedBeat. In the kit's
// envelope these live on the open index signature of the nested Beat.
const beatShow = (beat: Beat): string | undefined => {
  const v = (beat as {show?: unknown}).show;
  return typeof v === 'string' ? v : undefined;
};

export const FrameSceneComponent: React.FC<SceneRenderProps<FrameSceneSpec>> = ({
  scene,
  common,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, meta, style} = common;
  const accentHex = accentOf(style, undefined);
  const ink = style.tokens.ink;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;

  const enterOf = (name: string): number => {
    const slot: BeatTimelineSlot | undefined = ts.beats.find(
      (b) => beatShow(b.beat) === name,
    );
    return slot?.startFrame ?? 0;
  };

  const rise = (at: number, mass = 0.8) => {
    const local = frame - at;
    return local <= 0 ? 0 : spring({frame: local, fps, config: {damping: 200, mass}});
  };

  const titleA = rise(enterOf('title'), 1);
  const taglineA = rise(enterOf('tagline'));
  const footA = rise(enterOf('footnote'));
  const blink = Math.floor(frame / 18) % 2 === 0;

  // Auto-fit the title — long titles (a poem name, a multi-clause subject)
  // would otherwise blow through the safe band at the static 158px size and
  // run flush to the frame edges. Shrink in steps; clamp the box.
  const titleText = scene.title ?? '';
  const titleFont =
    titleText.length <= 15 ? 158 :
    titleText.length <= 22 ? 132 :
    titleText.length <= 30 ? 108 :
    titleText.length <= 40 ? 88 :
    72;

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker ?? ''}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        {/* faux prompt */}
        <div
          style={{
            fontFamily: monoFamily,
            fontSize: 27,
            color: accentHex,
            opacity: titleA,
            marginBottom: 26,
            letterSpacing: 1,
          }}
        >
          <span style={{color: ink.low}}>~ </span>
          <span style={{color: accentHex}}>❯</span> docent {meta.id}
          <span
            style={{
              display: 'inline-block',
              width: 13,
              height: 26,
              background: accentHex,
              marginLeft: 6,
              transform: 'translateY(4px)',
              opacity: blink ? 1 : 0,
            }}
          />
        </div>

        {/* title — auto-fit for long titles; maxWidth keeps the box inside the safe band */}
        <div
          style={{
            fontSize: titleFont,
            fontWeight: 700,
            color: ink.hi,
            letterSpacing: -titleFont * 0.019,
            opacity: titleA,
            transform: `scale(${interpolate(titleA, [0, 1], [0.92, 1])})`,
            textShadow: `0 30px 90px ${accentHex}30`,
            maxWidth: 1680,
            textAlign: 'center',
            lineHeight: 1.05,
            padding: '0 16px',
          }}
        >
          {scene.title}
        </div>

        {/* divider */}
        <div
          style={{
            width: interpolate(taglineA, [0, 1], [0, 360]),
            height: 3,
            background: `linear-gradient(90deg, transparent, ${accentHex}, transparent)`,
            margin: '34px 0 30px',
            opacity: taglineA,
          }}
        />

        {/* tagline — auto-shrink + maxWidth + centred. Same belt-and-braces
            as title and footnote: long taglines step down in font size and
            stay inside the safe band, centered against the title above.
            Without this, "Three innocent capabilities — combine them in
            one agent and you have built an exfiltration weapon" renders
            left-aligned and bleeds past the right edge. */}
        {(() => {
          const text = scene.tagline ?? '';
          const fs = text.length <= 40 ? 41
                   : text.length <= 60 ? 34
                   : text.length <= 90 ? 28
                   : text.length <= 130 ? 24
                   : 21;
          return (
            <div
              style={{
                fontSize: fs,
                fontWeight: 400,
                color: ink.mid,
                opacity: taglineA,
                transform: `translateY(${(1 - taglineA) * 14}px)`,
                fontFamily: sansFamily,
                maxWidth: 1500,
                textAlign: 'center',
                lineHeight: 1.32,
                padding: '0 24px',
                alignSelf: 'center',
              }}
            >
              {text}
            </div>
          );
        })()}

        {/* footnote — auto-shrink + maxWidth so a long footnote never bleeds
            past the safe band. Same belt-and-braces shape as the heading in
            SceneFrame.tsx: tier fontSize by length, cap width, centre. */}
        {(() => {
          const text = scene.footnote ?? '';
          const fs = text.length <= 80 ? 23
                   : text.length <= 130 ? 19
                   : text.length <= 180 ? 16
                   : 14;
          return (
            <div
              style={{
                fontFamily: monoFamily,
                fontSize: fs,
                color: ink.low,
                opacity: footA,
                transform: `translateY(${(1 - footA) * 12}px)`,
                marginTop: 70,
                letterSpacing: 1,
                maxWidth: 1480,
                textAlign: 'center',
                lineHeight: 1.4,
                padding: '0 16px',
                alignSelf: 'center',
              }}
            >
              {text}
            </div>
          );
        })()}
      </AbsoluteFill>
      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
