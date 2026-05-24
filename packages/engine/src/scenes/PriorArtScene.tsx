import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {glow} from '../theme';
import type {ResolvedStyle} from '../style';
import {interFamily, monoFamily} from '../fonts';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {FittedText} from '../components/FittedText';
import {activeBeatIndex, type PriorArtNovelty, type SceneProps} from '../engine/spec';
import {paletteGlowScale, paletteSceneHex} from '../engine/knobs';

// Prior Art — the AR-mode scene that places the subject against 2-4 systems
// that occupy similar terrain, and names the divergence *dimensionally*. Not
// "X is better than Y" but "X took this trade-off; Y took that one". A column
// per prior system; a row per dimension; each cell marks `same` (✓) or
// `diverges` (✗) with a short claim. One dimension is the *novelty* row —
// the line of difference the film argues from; it is rendered with the accent
// rule and a brighter wash so the eye lands on it last.
//
// Position is fixed: between `frame` and the first `structure`. The viewer
// learns what's at stake, then what's been tried, then sees the system.
//
// Pace is `walk`: the narration walks one column at a time, then the novelty
// row that names the new line. Beats reveal columns by id (the system id) and
// the novelty row by the dimension id; `focus` narrows the eye to a column.
export const PriorArtScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
  ts,
  sceneIndex,
  sceneCount,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const {bg, ink} = style.tokens;
  const accentHex = paletteSceneHex(scene.palette, scene.accent, style);
  const systems = scene.systems ?? [];
  const dimensions = scene.dimensions ?? [];
  const cells = scene.cells ?? [];
  // Narrow `Scene.novelty` (the widened `PriorArtNovelty | VennNovelty`
  // union) via the `kind` discriminator. The validator pins
  // `novelty.kind === 'prior-art'` on every prior-art scene; this read is
  // safe on any spec that passes the contract.
  const novelty: PriorArtNovelty | undefined =
    scene.novelty?.kind === 'prior-art' ? scene.novelty : undefined;

  // Cell lookup — keyed by `${systemId}|${dimensionId}`.
  const cellMap = new Map<string, {mark: 'same' | 'diverges'; note: string}>();
  for (const c of cells) {
    cellMap.set(`${c.system}|${c.dimension}`, {mark: c.mark, note: c.note});
  }

  // Which beat is on, and what it reveals/focuses.
  const active = activeBeatIndex(ts.beats, frame);
  // A revealed *id* may name a system (a column appears) or a dimension (a
  // row appears). Compose a single "revealed" set from every beat at or
  // before the active beat.
  const revealedIds = new Set<string>();
  for (let i = 0; i <= active; i++) {
    const r = ts.beats[i]?.reveal;
    if (Array.isArray(r)) for (const id of r) revealedIds.add(id);
  }
  // If no beat ever reveals anything by id, fall back to "all revealed once
  // the first beat has played" — keeps a minimal spec rendering sensibly.
  const allByDefault = !ts.beats.some(
    (b) => Array.isArray(b.reveal) && b.reveal.length > 0,
  );

  const focusIds = new Set(ts.beats[active]?.focus ?? []);
  const hasFocus = focusIds.size > 0;

  // Per-id reveal frame — the first beat at or before `frame` that named it.
  const enterFrameFor = (id: string): number => {
    for (const b of ts.beats) {
      const r = b.reveal;
      if (Array.isArray(r) && r.includes(id)) return b.from;
    }
    return 0;
  };

  // Table geometry — gutter for dimension labels, even columns for systems.
  const tableW = 1620;
  const tableX = (1920 - tableW) / 2;
  const gutterW = 360;
  const colW = (tableW - gutterW) / Math.max(1, systems.length);
  const headerH = 108;
  const rowH = Math.min(132, 560 / Math.max(1, dimensions.length));
  const tableY = 312;

  const intro = spring({frame, fps, config: {damping: 200}});

  // The novelty dimension id — the row that lights up.
  const noveltyDim = novelty?.dimension;

  return (
    <SceneFrame
      style={style}      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      glowScale={paletteGlowScale(scene.palette)}
    >
      <AbsoluteFill>
        {/* column headers — one per prior system */}
        {systems.map((s, ci) => {
          const enter = enterFrameFor(s.id);
          const local = frame - enter;
          const a = allByDefault
            ? intro
            : revealedIds.has(s.id)
              ? spring({frame: local, fps, config: {damping: 200, mass: 0.7}})
              : 0;
          if (a <= 0) return null;
          const focused = focusIds.has(s.id);
          const dim = hasFocus && !focused;
          const opacity = a * (dim ? 0.36 : 1);

          return (
            <div
              key={s.id}
              style={{
                position: 'absolute',
                left: tableX + gutterW + ci * colW + 8,
                top: tableY,
                width: colW - 16,
                height: headerH,
                opacity,
                transform: `translateY(${interpolate(a, [0, 1], [-14, 0])}px)`,
                borderRadius: 12,
                background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
                border: `1.5px solid ${bg.line}`,
                borderBottom: `2.5px solid ${accentHex}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              {/* system header — column tile is (colW-16) wide; reserve
                  ~24px interior. shrink-single is right here: a system
                  name reads as a single phrase. */}
              <FittedText
                text={s.label}
                maxWidth={colW - 16 - 24}
                basePx={26}
                floorPx={14}
                charAdvance={0.58}
                mode="shrink-single"
                style={{
                  fontFamily: interFamily,
                  fontWeight: 600,
                  color: ink.hi,
                  letterSpacing: -0.2,
                  textAlign: 'center',
                }}
              />
              {s.sub || s.year ? (
                <FittedText
                  text={[s.sub, s.year].filter(Boolean).join(' · ')}
                  maxWidth={colW - 16 - 24}
                  basePx={14}
                  floorPx={10}
                  charAdvance={0.62}
                  mode="shrink-single"
                  style={{
                    fontFamily: monoFamily,
                    color: ink.low,
                    textAlign: 'center',
                  }}
                />
              ) : null}
            </div>
          );
        })}

        {/* dimension rows — labels in the gutter, cells across systems */}
        {dimensions.map((d, ri) => {
          const enter = enterFrameFor(d.id);
          const local = frame - enter;
          const a = allByDefault
            ? intro
            : revealedIds.has(d.id)
              ? spring({frame: local, fps, config: {damping: 200, mass: 0.7}})
              : 0;
          if (a <= 0) return null;
          const focused = focusIds.has(d.id);
          const dim = hasFocus && !focused;
          const rowOpacity = a * (dim ? 0.36 : 1);
          const y = tableY + headerH + 16 + ri * rowH;
          const isNovelty = d.id === noveltyDim;
          // The novelty row lights up only once the row itself is on screen —
          // and slightly more once it is focused, the moment the narration
          // lands on it.
          const noveltyGlowAlpha = isNovelty
            ? a * (focused ? 0.22 : 0.12)
            : 0;

          return (
            <div
              key={d.id}
              style={{
                position: 'absolute',
                left: tableX,
                top: y,
                width: tableW,
                height: rowH - 14,
                opacity: rowOpacity,
                transform: `translateX(${interpolate(a, [0, 1], [-22, 0])}px)`,
                display: 'flex',
                borderRadius: 12,
                background: isNovelty
                  ? `linear-gradient(90deg, ${glow(accentHex, noveltyGlowAlpha)}, transparent)`
                  : 'transparent',
              }}
            >
              {/* dimension label — left gutter. The gutter is 360px; the
                  rail+spacer eat ~36px and the trailing pad ~22px. Wrap
                  to 2 lines so a longer dimension phrase
                  ("Operational complexity per consensus event") reads
                  cleanly inside the gutter. */}
              <div
                style={{
                  width: gutterW,
                  display: 'flex',
                  alignItems: 'center',
                  paddingRight: 22,
                }}
              >
                <div
                  style={{
                    width: 4,
                    height: 30,
                    borderRadius: 2,
                    marginRight: 16,
                    background: isNovelty
                      ? accentHex
                      : focused
                        ? accentHex
                        : bg.lineHi,
                    flexShrink: 0,
                  }}
                />
                <FittedText
                  text={d.label}
                  maxWidth={gutterW - 4 - 16 - 22}
                  basePx={21}
                  floorPx={13}
                  charAdvance={0.55}
                  mode="shrink-wrap"
                  maxLines={2}
                  lineHeight={1.18}
                  style={{
                    fontFamily: interFamily,
                    fontWeight: isNovelty ? 600 : 500,
                    color: focused
                      ? ink.hi
                      : isNovelty
                        ? ink.hi
                        : ink.mid,
                    letterSpacing: -0.2,
                  }}
                />
              </div>

              {/* one cell per system */}
              {systems.map((s, ci) => {
                const c = cellMap.get(`${s.id}|${d.id}`);
                const mark = c?.mark;
                const diverges = mark === 'diverges';
                const same = mark === 'same';
                // A cell in the novelty row that diverges gets the accent
                // wash — the visual claim the film argues from.
                const lit = isNovelty && diverges;
                return (
                  <div key={s.id} style={{width: colW, padding: '0 8px'}}>
                    <div
                      style={{
                        height: '100%',
                        borderRadius: 11,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        textAlign: 'left',
                        padding: '0 16px',
                        gap: 10,
                        background: lit
                          ? `linear-gradient(158deg, ${glow(accentHex, 0.18)}, ${glow(accentHex, 0.05)})`
                          : bg.panel,
                        border: `1.5px solid ${lit ? accentHex : bg.line}`,
                        boxShadow: lit
                          ? `0 0 22px -8px ${glow(accentHex, 0.6)}`
                          : 'none',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: monoFamily,
                          fontSize: 22,
                          fontWeight: 700,
                          color: diverges
                            ? accentHex
                            : same
                              ? ink.mid
                              : ink.low,
                          flexShrink: 0,
                          width: 18,
                          textAlign: 'center',
                        }}
                      >
                        {diverges ? '✗' : same ? '✓' : '·'}
                      </span>
                      {/* cell note — the per-cell short claim. The cell
                          is (colW-16) wide, with 16px interior pad and
                          the verdict glyph (18px) on its left. Wrap to
                          3 lines and shrink past that — a longer note
                          ("Co-located commit log; no quorum needed in the
                          happy path") still reads inside the cell. */}
                      <FittedText
                        text={c?.note ?? '—'}
                        maxWidth={colW - 16 - 32 - 18 - 10}
                        basePx={17}
                        floorPx={11}
                        charAdvance={0.56}
                        mode="shrink-wrap"
                        maxLines={3}
                        lineHeight={1.25}
                        style={{
                          fontFamily: interFamily,
                          fontWeight: lit ? 600 : 500,
                          color: lit
                            ? accentHex
                            : diverges
                              ? ink.hi
                              : same
                                ? ink.mid
                                : ink.low,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* novelty statement — appears beneath the table once the novelty
            dimension has been revealed; it is the one-liner that names the
            new line the film argues from. */}
        {novelty && revealedIds.has(novelty.dimension) ? (
          (() => {
            const enter = enterFrameFor(novelty.dimension);
            const local = frame - enter;
            const a = spring({
              frame: local,
              fps,
              config: {damping: 200, mass: 0.9},
            });
            if (a <= 0) return null;
            const y = tableY + headerH + 16 + dimensions.length * rowH + 18;
            return (
              <div
                style={{
                  position: 'absolute',
                  left: tableX,
                  top: y,
                  width: tableW,
                  opacity: a,
                  transform: `translateY(${interpolate(a, [0, 1], [10, 0])}px)`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 22px',
                  borderRadius: 12,
                  background: `linear-gradient(90deg, ${glow(accentHex, 0.08)}, transparent)`,
                  border: `1px dashed ${glow(accentHex, 0.55)}`,
                }}
              >
                <span
                  style={{
                    fontFamily: monoFamily,
                    fontSize: 13,
                    letterSpacing: 1.4,
                    color: accentHex,
                    textTransform: 'uppercase',
                  }}
                >
                  the new line
                </span>
                {/* novelty statement — the one-liner that names the
                    new line. The dashed banner spans the table width
                    (~1620px) with ~44px reserved for the kicker chip
                    and 28px interior padding. Wrap to 2 lines so a
                    longer statement
                    ("Co-locating the commit log with consensus state
                    in a single Raft group is the move") still fits
                    without dropping below the safe band. */}
                <FittedText
                  text={novelty.statement}
                  maxWidth={1620 - 44 - 28 - 60}
                  basePx={20}
                  floorPx={13}
                  charAdvance={0.56}
                  mode="shrink-wrap"
                  maxLines={2}
                  lineHeight={1.28}
                  style={{
                    fontFamily: interFamily,
                    color: ink.hi,
                    fontWeight: 500,
                    letterSpacing: -0.1,
                    flex: 1,
                    minWidth: 0,
                  }}
                />
              </div>
            );
          })()
        ) : null}
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
