import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {accent, theme, glow} from '../theme';
import {interFamily, monoFamily} from '../fonts';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {FittedText} from '../components/FittedText';
import {activeBeatIndex, type Beat, type Mark, type SceneProps} from '../engine/spec';

// A passage scene — annotates a plain-text artifact (a poem, prose, a
// primary-source document). NOT code: no syntax highlighter, no gutter, no
// file-path window chrome. The artifact is `scene.text`, typeset as prose or
// verse in a serif face with line breaks preserved. The annotation unit is a
// `mark` — a span (`quote`) located in the text, underlined/highlighted, with
// a short `note` pinned beside it. Beats activate marks through the existing
// reveal/focus model: `reveal` brings marks in, `focus` narrows to a subset.
// Several marks can be live at once. The author writes *what to mark*.

// A serif face for the artifact body — legibility, and a register distinct
// from the code/mono of CloseupScene. Georgia is universally bundled.
const serifFamily = 'Georgia, "Times New Roman", serif';

// One run of the typeset text — either plain prose or a span owned by a mark.
type Run = {text: string; markId: string | null};

// Slice `text` into runs at the boundaries of every mark's `quote`. Each mark
// is located by its first non-overlapping occurrence, in declared order; a
// quote not found in the text is simply skipped (the scene still renders).
const sliceRuns = (text: string, marks: Mark[]): Run[] => {
  // Resolve each mark to a [start, end) span in the text.
  type Span = {markId: string; start: number; end: number};
  const spans: Span[] = [];
  for (const m of marks) {
    if (!m.quote) continue;
    let from = 0;
    // Skip occurrences already claimed by an earlier mark so two marks on the
    // same phrase still each get a distinct span.
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

export const PassageScene: React.FC<SceneProps> = ({
  ts,
  sceneIndex,
  sceneCount,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const accentHex = accent(scene.accent);
  const text = (scene.text ?? '').replace(/\s+$/, '');
  const marks = scene.marks ?? [];

  // First frame at which each mark id becomes live. A beat's `reveal` array
  // names the marks it brings on; once revealed a mark stays revealed. This is
  // the same model StructureScene uses for nodes.
  const revealFrame: Record<string, number> = {};
  ts.beats.forEach((b) => {
    if (Array.isArray(b.reveal)) {
      b.reveal.forEach((id) => {
        if (revealFrame[id] === undefined) revealFrame[id] = b.from;
      });
    }
  });
  const revealOf = (id: string): number => revealFrame[id] ?? 0;

  const active = activeBeatIndex(ts.beats, frame);
  const beat: Beat | undefined = ts.beats[active];
  // `focus` narrows attention to a subset of the live marks; the rest dim.
  const focusIds = new Set(beat?.focus ?? []);
  const hasFocus = focusIds.size > 0;

  // A mark's display state at the current frame.
  type MarkState = 'hidden' | 'focus' | 'dim' | 'live';
  const markState = (id: string): MarkState => {
    if (frame < revealOf(id)) return 'hidden';
    if (hasFocus) return focusIds.has(id) ? 'focus' : 'dim';
    return 'live';
  };

  const markById: Record<string, Mark> = {};
  marks.forEach((m) => (markById[m.id] = m));

  const runs = sliceRuns(text, marks);

  // The artifact panel — sized off the text so a short poem and a long prose
  // block both sit comfortably centred.
  const lineCount = text.split('\n').length;
  const fontSize = lineCount > 22 ? 24 : lineCount > 12 ? 28 : 33;
  const lineH = Math.round(fontSize * 1.62);
  // Size the panel to the longest line — hug short verse, breathe for long
  // prose. The 1180 ceiling holds the safe band on a wide document; the 720
  // floor stops a single-word mark from collapsing the box.
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

  // The marks live right now, with a resolved note — the annotation column.
  const liveMarks = marks.filter((m) => markState(m.id) !== 'hidden');

  return (
    <SceneFrame
      accentHex={accentHex}
      kicker={scene.kicker}
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
            background: theme.bg.panel,
            border: `1.5px solid ${theme.bg.line}`,
            boxShadow: `0 44px 110px -34px #000000, 0 0 0 1px ${glow(accentHex, 0.12)}`,
            padding: '46px 64px',
          }}
        >
          <div
            style={{
              fontFamily: serifFamily,
              fontSize,
              lineHeight: `${lineH}px`,
              color: theme.ink.hi,
              whiteSpace: 'pre-wrap',
            }}
          >
            {runs.map((run, i) => {
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
                    color: lit ? theme.ink.hi : theme.ink.mid,
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
            })}
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
                      fontFamily: interFamily,
                      color: theme.ink.mid,
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
              color: theme.ink.faint,
              textAlign: 'center',
            }}
          >
            primary source · read in full
          </div>
        ) : null}
      </div>

      <Narration beats={ts.beats} />
    </SceneFrame>
  );
};
