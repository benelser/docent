// PassageScene — annotates a plain-text artifact (a poem, prose, a
// primary-source document). NOT code: no syntax highlighter, no gutter,
// no file-path window chrome. The artifact is `scene.text`, typeset as
// prose or verse in a serif face with line breaks preserved. The
// annotation unit is a `mark` — a span (`quote`) located in the text,
// underlined/highlighted, with a short `note` pinned beside it. Beats
// activate marks through the existing reveal/focus model: `reveal`
// brings marks in, `focus` narrows to a subset. Several marks can be
// live at once. The author writes *what to mark*.
//
// Migrated from packages/engine/src/scenes/PassageScene.tsx as part of
// the v3.0 plugin-architecture rip-and-replace. Behavior is UNCHANGED
// from the v2.5.x renderer; only import paths and the prop shape were
// updated:
//   - props receive `SceneRenderProps<PassageSceneSpec>` from
//     @bjelser/kit (the kit-owned `{scene, common}` envelope), rather
//     than the legacy `SceneProps` (the engine-owned `ts: TimedScene`
//     envelope).
//   - beat timing reads through the kit's BeatTimelineSlot — its
//     `startFrame` replaces the v2.5.x engine's legacy `from`.
//   - the engine-shared chrome (SceneFrame, Narration, FittedText,
//     fonts, glow, activeBeatIndex) lives as colocated helpers in this
//     scene's directory until the shared-infra migration agent lands;
//     the integrator will swap the underscore-prefixed local helpers
//     for shared imports at merge time.

import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Beat, ResolvedStyle, SceneRenderProps, WordTiming} from '@bjelser/kit';
import {useBeatWordTimings} from '@bjelser/kit';

import {FittedText, KaraokeText, Narration, SceneFrame, activeBeatIndex, glow} from '../../_shared';
import type {PassageMark, PassageScene as PassageSceneSpec} from './validate';

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string | undefined>;
  return (key ? map[key] : undefined) ?? map.blue ?? '#5cb6ff';
};

// One run of the typeset text — either plain prose or a span owned by a
// mark.
type Run = {text: string; markId: string | null};

// Slice `text` into runs at the boundaries of every mark's `quote`. Each
// mark is located by its first non-overlapping occurrence, in declared
// order; a quote not found in the text is simply skipped (the scene
// still renders).
const sliceRuns = (text: string, marks: PassageMark[]): Run[] => {
  // Resolve each mark to a [start, end) span in the text.
  type Span = {markId: string; start: number; end: number};
  const spans: Span[] = [];
  for (const m of marks) {
    if (!m.quote) continue;
    let from = 0;
    // Skip occurrences already claimed by an earlier mark so two marks
    // on the same phrase still each get a distinct span.
    while (from <= text.length) {
      const at = text.indexOf(m.quote, from);
      if (at < 0) break;
      const end = at + m.quote.length;
      const clash = spans.some((s) => at < s.end && end > s.start);
      if (!clash) {
        spans.push({markId: m.id, start: at, end});
        break;
      }
      from = at + 1;
    }
  }
  spans.sort((a, b) => a.start - b.start);

  const runs: Run[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start > cursor) runs.push({text: text.slice(cursor, s.start), markId: null});
    runs.push({text: text.slice(s.start, s.end), markId: s.markId});
    cursor = s.end;
  }
  if (cursor < text.length) runs.push({text: text.slice(cursor), markId: null});
  return runs;
};

// Beat fields the kit treats as opaque (reveal/focus arrays). The engine
// reads them through the open index signature on Beat.
const revealList = (beat: Beat): readonly string[] => {
  const v = (beat as {reveal?: unknown}).reveal;
  return Array.isArray(v) ? (v as string[]) : [];
};
const focusList = (beat: Beat | undefined): readonly string[] => {
  if (!beat) return [];
  const v = (beat as {focus?: unknown}).focus;
  return Array.isArray(v) ? (v as string[]) : [];
};

export const PassageSceneComponent: React.FC<SceneRenderProps<PassageSceneSpec>> = ({
  scene,
  common,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, style} = common;
  const accentHex = accentOf(style, undefined);
  const text = (scene.text ?? '').replace(/\s+$/, '');
  const marks = scene.marks ?? [];

  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  // The serif face for the artifact body is sourced from the resolved
  // tokens: presets like `editorial` and `paper` swap in their own
  // serif, while the default `neutral` keeps a Georgia-family fallback.
  // The register is intentionally distinct from CloseupScene's mono.
  const serifFamily = style.tokens.typography.family.serif;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;

  // First frame at which each mark id becomes live. A beat's `reveal`
  // array names the marks it brings on; once revealed a mark stays
  // revealed. This is the same model StructureScene uses for nodes.
  const revealFrame: Record<string, number> = {};
  ts.beats.forEach((b) => {
    revealList(b.beat).forEach((id) => {
      if (revealFrame[id] === undefined) revealFrame[id] = b.startFrame;
    });
  });
  const revealOf = (id: string): number => revealFrame[id] ?? 0;

  const active = activeBeatIndex(ts.beats, frame);
  const beat: Beat | undefined = ts.beats[active]?.beat;
  // R5: word-level timing IR. When the TTS stage persisted per-word
  // timings for the active beat, render the prose as karaoke-style words
  // (per-word color/opacity sweep in lock-step with the speaker). When
  // the active provider supplies no word timings, fall through to the
  // existing static-text path — no regression for films whose providers
  // declared `nativeAlignment: 'none'` (and whose users opted out of the
  // estimator).
  const activeBeatStartFrame = ts.beats[active]?.startFrame ?? 0;
  const beatWords: ReadonlyArray<WordTiming> | null = useBeatWordTimings(
    sceneIndex,
    active >= 0 ? active : 0,
  );
  const karaokeOn = !!beatWords && beatWords.length > 0;
  // `focus` narrows attention to a subset of the live marks; the rest
  // dim.
  const focusIds = new Set(focusList(beat));
  const hasFocus = focusIds.size > 0;

  // A mark's display state at the current frame.
  type MarkState = 'hidden' | 'focus' | 'dim' | 'live';
  const markState = (id: string): MarkState => {
    if (frame < revealOf(id)) return 'hidden';
    if (hasFocus) return focusIds.has(id) ? 'focus' : 'dim';
    return 'live';
  };

  const markById: Record<string, PassageMark> = {};
  marks.forEach((m) => (markById[m.id] = m));

  const runs = sliceRuns(text, marks);

  // The artifact panel — sized off the text so a short poem and a long
  // prose block both sit comfortably centred.
  const lineCount = text.split('\n').length;
  const fontSize = lineCount > 22 ? 24 : lineCount > 12 ? 28 : 33;
  const lineH = Math.round(fontSize * 1.62);
  // Size the panel to the longest line — hug short verse, breathe for
  // long prose. The 1180 ceiling holds the safe band on a wide
  // document; the 720 floor stops a single-word mark from collapsing
  // the box.
  const longestLine = text
    .split('\n')
    .reduce((a, b) => (b.length > a.length ? b : a), '');
  const estTextWidth = longestLine.length * fontSize * 0.55;
  const panelW = Math.round(Math.max(720, Math.min(estTextWidth + 132, 1180)));

  const winScale = spring({frame, fps, config: {damping: 200, mass: 0.6}});
  const winOpacity = interpolate(frame, [0, 9], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // The marks live right now, with a resolved note — the annotation
  // column.
  const liveMarks = marks.filter((m) => markState(m.id) !== 'hidden');

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker ?? ''}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 232,
          transform: `translateX(-50%) scale(${interpolate(winScale, [0, 1], [0.975, 1])})`,
          opacity: winOpacity,
          width: panelW,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {/* the artifact — typeset as prose / verse, serif, line breaks kept */}
        <div
          style={{
            borderRadius: 16,
            background: bg.panel,
            border: `1.5px solid ${bg.line}`,
            boxShadow: `0 44px 110px -34px #000000, 0 0 0 1px ${glow(accentHex, 0.12)}`,
            padding: '46px 64px',
          }}
        >
          <div
            style={{
              fontFamily: serifFamily,
              fontSize,
              lineHeight: `${lineH}px`,
              color: ink.hi,
              whiteSpace: 'pre-wrap',
            }}
          >
            {karaokeOn ? (
              // R5: karaoke render — every word in the active beat's
              // narration gets a per-word color sweep on its
              // [startFrame, endFrame). The prose body is replaced by
              // an accent-glowed karaoke panel; past words hold the
              // accent, future words sit at `ink.faint`. Browser-
              // safe; no node imports. The accent wash + heavier
              // panel chrome are what distinguishes this render from
              // the static-marks render — visibly diff'd in the R5
              // smoke (mean-abs-pixel-diff > 25% target).
              <div
                style={{
                  background: glow(accentHex, 0.55),
                  border: `4px solid ${accentHex}`,
                  padding: '32px 36px',
                  borderRadius: 14,
                  boxShadow: `0 0 90px -8px ${glow(accentHex, 0.9)}, inset 0 0 60px ${glow(accentHex, 0.18)}`,
                  minHeight: lineH * 5,
                }}
              >
                <KaraokeText
                  words={beatWords!}
                  clipStartFrame={activeBeatStartFrame}
                  dimColor={ink.faint}
                  accentColor={accentHex}
                  underlineActive
                  style={{whiteSpace: 'pre-wrap', fontSize: fontSize * 1.15}}
                  renderWord={(w, color, opacity) => (
                    <span
                      style={{
                        color,
                        opacity,
                        transition: 'color 60ms linear',
                        textShadow: `0 0 28px ${glow(accentHex, 0.85)}`,
                        fontWeight: 700,
                      }}
                    >
                      {w.text}
                    </span>
                  )}
                />
              </div>
            ) : (
              runs.map((run, i) => {
                if (run.markId === null) {
                  return <span key={i}>{run.text}</span>;
                }
                const st = markState(run.markId);
                // Hidden marks render as plain, un-highlighted text.
                if (st === 'hidden') return <span key={i}>{run.text}</span>;
                const lit = st === 'focus' || st === 'live';
                return (
                  <span
                    key={i}
                    style={{
                      background: lit
                        ? glow(accentHex, st === 'focus' ? 0.26 : 0.16)
                        : glow(accentHex, 0.06),
                      color: lit ? ink.hi : ink.mid,
                      borderBottom: `2.5px solid ${
                        lit ? accentHex : glow(accentHex, 0.3)
                      }`,
                      borderRadius: 3,
                      padding: '1px 3px',
                      boxShadow:
                        st === 'focus'
                          ? `0 0 22px -6px ${glow(accentHex, 0.7)}`
                          : 'none',
                    }}
                  >
                    {run.text}
                  </span>
                );
              })
            )}
          </div>
        </div>

        {/* annotation column — a pinned note per live mark */}
        {liveMarks.length ? (
          <div
            style={{
              marginTop: 26,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {liveMarks.map((m) => {
              const st = markState(m.id);
              const local = frame - revealOf(m.id);
              const a =
                local <= 0
                  ? 0
                  : spring({frame: local, fps, config: {damping: 200, mass: 0.7}});
              const dim = st === 'dim';
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 16,
                    opacity: a * (dim ? 0.4 : 1),
                    transform: `translateX(${interpolate(a, [0, 1], [-20, 0])}px)`,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      flexShrink: 0,
                      alignSelf: 'center',
                      background: accentHex,
                      boxShadow: dim ? 'none' : `0 0 12px ${accentHex}`,
                    }}
                  />
                  {/* annotation quote — single-line shrink with
                      ellipsis; the quoted phrase is the *handle*, not
                      the substance. */}
                  <FittedText
                    text={`“${m.quote}”`}
                    maxWidth={360}
                    basePx={21}
                    floorPx={14}
                    charAdvance={0.58}
                    mode="shrink-single"
                    style={{
                      fontFamily: serifFamily,
                      fontStyle: 'italic',
                      color: accentHex,
                      flexShrink: 0,
                    }}
                  />
                  {/* annotation note — the substantive prose. Wrap to
                      3 lines and auto-shrink past that. The annotation
                      row's available width is panelW - quote (360) -
                      gap (16) - bullet (24). */}
                  <FittedText
                    text={m.note}
                    maxWidth={Math.max(300, panelW - 360 - 40)}
                    basePx={21}
                    floorPx={13}
                    charAdvance={0.56}
                    mode="shrink-wrap"
                    maxLines={3}
                    lineHeight={1.4}
                    style={{
                      fontFamily: sansFamily,
                      color: ink.mid,
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : null}

        {/* a quiet caption when the artifact carries no marks at all */}
        {marks.length === 0 ? (
          <div
            style={{
              marginTop: 22,
              fontFamily: monoFamily,
              fontSize: 16,
              letterSpacing: 1.4,
              color: ink.faint,
              textAlign: 'center',
            }}
          >
            primary source · read in full
          </div>
        ) : null}
      </div>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
