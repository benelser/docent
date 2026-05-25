import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {glow} from '../theme';
import type {ResolvedStyle} from '../style';
import {interFamily, monoFamily} from '../fonts';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {FittedText} from '../components/FittedText';
import {activeBeatIndex, type SceneProps} from '../engine/spec';
import {
  cadenceOffset,
  cadenceSpringConfig,
  numericRevealMap,
  paletteGlowScale,
  paletteSceneHex,
} from '../engine/knobs';
import {EmbeddedScene} from './EmbeddedScene';

// A judgement table: options across the top (columns), criteria down the left
// gutter (rows), cells in the grid. A `win` cell is accent-tinted, a `lose`
// cell is dimmed. Rows reveal top-to-bottom, one beat at a time.
export const CompareScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
  ts,
  sceneIndex,
  sceneCount,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const {bg, ink} = style.tokens;
  // `palette` (a scene knob) re-selects the chrome accent over its family;
  // without a palette this is exactly `accent(scene.accent)`. paletteSceneHex
  // remains the resolver — it owns palette-family selection logic.
  const accentHex = paletteSceneHex(scene.palette, scene.accent, style);
  const columns = scene.columns ?? [];
  const rows = scene.rows ?? [];

  // `cadence` (a beat knob) shapes how the rows a beat reveals enter — the
  // numeric-reveal map gives each row's revealing-beat frame, cadence, and
  // order within that beat's batch. A knob-free scene is byte-identical.
  const reveals = numericRevealMap(ts.beats, rows.length);
  const rowEnterFor = (i: number): number => {
    const r = reveals[i];
    return r ? r.from + cadenceOffset(r.cadence, r.order) : 0;
  };

  const active = activeBeatIndex(ts.beats, frame);
  const focusIds = new Set(ts.beats[active]?.focus ?? []);
  const hasFocus = focusIds.size > 0;

  // Table geometry — a left gutter for criteria, even column widths.
  const tableW = 1500;
  const tableX = (1920 - tableW) / 2;
  const gutterW = 380;
  const colW = (tableW - gutterW) / Math.max(1, columns.length);
  const headerH = 96;
  const rowH = Math.min(118, 620 / Math.max(1, rows.length));
  const tableY = 322;

  const intro = spring({frame, fps, config: {damping: 200}});

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
        {/* column headers */}
        {columns.map((c, ci) => (
          <div
            key={c.id}
            style={{
              position: 'absolute',
              left: tableX + gutterW + ci * colW + 8,
              top: tableY,
              width: colW - 16,
              height: headerH,
              opacity: intro,
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
            {/* column label / sub — auto-shrink so long option names
                ("Distributed event-sourced commit log") still fit
                centred without overrunning the header tile. The header
                tile is colW-16 wide; reserve ~22px internal margin. */}
            <FittedText
              text={c.label}
              maxWidth={colW - 16 - 22}
              basePx={24}
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
            {c.sub ? (
              <FittedText
                text={c.sub}
                maxWidth={colW - 16 - 22}
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
        ))}

        {/* rows */}
        {rows.map((r, ri) => {
          const local = frame - rowEnterFor(ri);
          const a =
            local <= 0
              ? 0
              : spring({frame: local, fps, config: cadenceSpringConfig(reveals[ri]?.cadence)});
          if (a <= 0) return null;
          const focused = focusIds.has(r.id);
          const dim = hasFocus && !focused;
          const rowOpacity = a * (dim ? 0.36 : 1);
          const y = tableY + headerH + 14 + ri * rowH;

          return (
            <div
              key={r.id}
              style={{
                position: 'absolute',
                left: tableX,
                top: y,
                width: tableW,
                height: rowH - 12,
                opacity: rowOpacity,
                transform: `translateX(${interpolate(a, [0, 1], [-22, 0])}px)`,
                display: 'flex',
              }}
            >
              {/* criterion — left gutter. Allow up to 2 wrapped lines so
                  a longer criterion ("Time-to-first-meaningful-response")
                  still reads inside the gutter without truncating
                  mid-thought. The gutter is 380px wide; subtract the
                  rail+spacer (~36px) and the trailing 22px pad. */}
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
                    height: 28,
                    borderRadius: 2,
                    marginRight: 16,
                    background: focused ? accentHex : bg.lineHi,
                    flexShrink: 0,
                  }}
                />
                <FittedText
                  text={r.label}
                  maxWidth={gutterW - 4 - 16 - 22}
                  basePx={21}
                  floorPx={13}
                  charAdvance={0.55}
                  mode="shrink-wrap"
                  maxLines={2}
                  lineHeight={1.18}
                  style={{
                    fontFamily: interFamily,
                    fontWeight: 500,
                    color: focused ? ink.hi : ink.mid,
                    letterSpacing: -0.2,
                  }}
                />
              </div>

              {/* cells */}
              {columns.map((c, ci) => {
                const cell = r.cells[ci];
                const verdict = cell?.verdict;
                const win = verdict === 'win';
                const lose = verdict === 'lose';
                return (
                  <div
                    key={c.id}
                    style={{
                      width: colW,
                      padding: '0 8px',
                    }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        height: '100%',
                        borderRadius: 11,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        padding: '0 18px',
                        background: win
                          ? `linear-gradient(158deg, ${glow(accentHex, 0.16)}, ${glow(accentHex, 0.06)})`
                          : bg.panel,
                        border: `1.5px solid ${win ? accentHex : bg.line}`,
                        boxShadow: win
                          ? `0 0 22px -8px ${glow(accentHex, 0.6)}`
                          : 'none',
                        opacity: lose ? 0.5 : 1,
                      }}
                    >
                      {/* Cell text — previously a fixed-19px nowrap span,
                          which let a long cell ("Eventually consistent
                          across regional read replicas") run off the
                          cell edge. Allow up to 3 wrapped lines and
                          auto-shrink. Cell interior is colW-16 (col
                          padding) - 36 (internal pad). The check
                          glyph is a flex sibling so it doesn't eat the
                          text's width. */}
                      {win ? (
                        <span
                          style={{
                            fontFamily: interFamily,
                            fontSize: 19,
                            fontWeight: 600,
                            color: accentHex,
                            marginRight: 6,
                            flexShrink: 0,
                          }}
                        >
                          ✓
                        </span>
                      ) : null}
                      <FittedText
                        text={cell?.text ?? '—'}
                        maxWidth={colW - 16 - 36 - (win ? 26 : 0)}
                        basePx={19}
                        floorPx={12}
                        charAdvance={0.56}
                        mode="shrink-wrap"
                        maxLines={3}
                        lineHeight={1.22}
                        style={{
                          fontFamily: interFamily,
                          fontWeight: win ? 600 : 500,
                          color: win
                            ? accentHex
                            : lose
                              ? ink.low
                              : ink.mid,
                          textAlign: 'center',
                        }}
                      />
                      {/* Sprint B — compositional embed. A compare cell may
                          carry a static sub-scene tableau drawn beneath the
                          cell text inside the cell tile. The embed inherits
                          the row's reveal/focus state through the parent
                          row's opacity (it lives inside the same flex). */}
                      {cell?.embed ? (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            pointerEvents: 'none',
                          }}
                        >
                          <svg
                            width="100%"
                            height="100%"
                            viewBox="0 0 1920 1080"
                            preserveAspectRatio="xMidYMid meet"
                            style={{position: 'absolute', inset: 0}}
                          >
                            <EmbeddedScene
                              embed={cell.embed}
                              bounds={{cx: 960, cy: 540, w: 900, h: 500}}
                              inheritedStyle={style}
                              parentAccent={accentHex}
                            />
                          </svg>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
