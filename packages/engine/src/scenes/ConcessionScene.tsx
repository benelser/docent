import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {glow} from '../theme';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {FittedText} from '../components/FittedText';
import {activeBeatIndex, type SceneProps} from '../engine/spec';
import type {ResolvedStyle} from '../style';

// ConcessionScene — what the film does NOT cover.
//
// Every film that argues something narrow ought to draw the line. Most don't,
// because the spec author doesn't think to add one. The concession scene is
// the move that *strengthens every other claim* in the film — by saying what
// the film is choosing not to fight about.
//
// Render contract: two columns — IN SCOPE (kept, lit in the film's accent)
// and OUT OF SCOPE (set aside, dimmed, with a strike-through ledger mark).
// An optional `reason` sits beneath the two columns as a single quiet line.
// No nodes, no diagrams; the scene is a piece of editorial commitment.

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string>;
  return (key && map[key]) || map.blue;
};

export const ConcessionScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
  ts,
  sceneIndex,
  sceneCount,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const accentHex = accentOf(style, scene.accent);
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;

  const scopeItems = scene.scope ?? [];
  const outItems = scene.outOfScope ?? [];
  const reason = scene.reason ?? '';

  // The active beat — used to gate the reason line, which arrives last so the
  // narration has time to walk the two columns before the editor's cut lands.
  const active = activeBeatIndex(ts.beats, frame);

  // Each item rises on its own spring. The cadence is staggered so the eye
  // walks down each column rather than the whole grid arriving at once.
  const rise = (delay: number) => {
    const local = frame - delay;
    return local <= 0
      ? 0
      : spring({frame: local, fps, config: {damping: 200, mass: 1}});
  };

  // Auto-fit per-item — each row is at most ~700px wide (two columns inside
  // a 1680 safe band, with a comfortable gutter).
  const colWidth = 720;

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
    >
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 268,
          width: 1680,
          display: 'flex',
          flexDirection: 'row',
          gap: 60,
        }}
      >
        {/* IN SCOPE column — lit in the film's accent. */}
        <div style={{flex: 1, minWidth: 0}}>
          <div
            style={{
              fontFamily: monoFamily,
              fontSize: 18,
              color: accentHex,
              letterSpacing: 3,
              textTransform: 'uppercase',
              marginBottom: 22,
              fontWeight: 600,
              opacity: rise(0),
            }}
          >
            in scope
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
            {scopeItems.map((it, i) => {
              const a = rise(12 + i * 9);
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 16,
                    opacity: a,
                    transform: `translateX(${interpolate(a, [0, 1], [-16, 0])}px)`,
                    padding: '14px 18px',
                    borderRadius: 10,
                    background: `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
                    border: `1.5px solid ${glow(accentHex, 0.5)}`,
                    boxShadow: `0 0 22px -10px ${glow(accentHex, 0.5)}`,
                  }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: accentHex,
                      boxShadow: `0 0 8px ${accentHex}`,
                      flexShrink: 0,
                      marginTop: 8,
                    }}
                  />
                  <FittedText
                    text={it}
                    maxWidth={colWidth - 70}
                    basePx={24}
                    floorPx={16}
                    charAdvance={0.55}
                    mode="shrink-wrap"
                    maxLines={3}
                    lineHeight={1.32}
                    style={{
                      fontFamily: sansFamily,
                      fontWeight: 500,
                      color: ink.hi,
                      letterSpacing: -0.2,
                      flex: 1,
                      minWidth: 0,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* OUT OF SCOPE column — set aside, dimmed, strike-through ledger
            mark to make the editorial cut visible. */}
        <div style={{flex: 1, minWidth: 0}}>
          <div
            style={{
              fontFamily: monoFamily,
              fontSize: 18,
              color: ink.low,
              letterSpacing: 3,
              textTransform: 'uppercase',
              marginBottom: 22,
              fontWeight: 600,
              opacity: rise(0),
            }}
          >
            out of scope
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
            {outItems.map((it, i) => {
              const a = rise(20 + i * 9);
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 16,
                    opacity: a * 0.7,
                    transform: `translateX(${interpolate(a, [0, 1], [16, 0])}px)`,
                    padding: '14px 18px',
                    borderRadius: 10,
                    background: bg.panel,
                    border: `1px dashed ${ink.faint}`,
                  }}
                >
                  {/* The strike-through ledger mark — a small horizontal
                      bar through a faint disc, the gesture of an editor
                      crossing the item off the list. */}
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      border: `1.5px solid ${ink.faint}`,
                      position: 'relative',
                      flexShrink: 0,
                      marginTop: 8,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: -2,
                        top: 5,
                        width: 18,
                        height: 1.5,
                        background: ink.low,
                        transform: 'rotate(-12deg)',
                      }}
                    />
                  </div>
                  <FittedText
                    text={it}
                    maxWidth={colWidth - 70}
                    basePx={22}
                    floorPx={15}
                    charAdvance={0.55}
                    mode="shrink-wrap"
                    maxLines={3}
                    lineHeight={1.32}
                    style={{
                      fontFamily: sansFamily,
                      fontWeight: 400,
                      color: ink.mid,
                      letterSpacing: -0.2,
                      textDecoration: 'line-through',
                      textDecorationColor: ink.low,
                      flex: 1,
                      minWidth: 0,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* The optional reason — one quiet line beneath both columns. Arrives
          on the second beat so the narration has time to walk the columns
          first; the reason is the cut, not the items. */}
      {reason ? (
        <div
          style={{
            position: 'absolute',
            left: 120,
            right: 120,
            bottom: 150,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            opacity: rise(active >= 1 ? Math.max(0, (ts.beats[1]?.from ?? 0)) : 1e9),
          }}
        >
          <div
            style={{
              fontFamily: monoFamily,
              fontSize: 18,
              color: accentHex,
              letterSpacing: 2,
              textTransform: 'uppercase',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            the cut
          </div>
          <div
            style={{
              width: 28,
              height: 1.5,
              background: accentHex,
              opacity: 0.6,
            }}
          />
          <FittedText
            text={reason}
            maxWidth={1480}
            basePx={22}
            floorPx={16}
            charAdvance={0.55}
            mode="shrink-wrap"
            maxLines={2}
            lineHeight={1.35}
            style={{
              fontFamily: sansFamily,
              fontWeight: 400,
              color: ink.mid,
              letterSpacing: -0.2,
              fontStyle: 'italic',
              flex: 1,
              minWidth: 0,
            }}
          />
        </div>
      ) : null}

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
