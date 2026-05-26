// QuantitiesScene — magnitudes. A grid of big-number figure cards (a large
// mono value, unit, a small label above, a note below), a worked numeric
// matrix (row and column labels around a filled grid), or `metrics` — figure
// cards whose number is a *tweened* value that counts up across beats. Items
// reveal progressively.
//
// MIGRATED from `packages/engine/src/scenes/QuantitiesScene.tsx`. Behaviour
// is preserved; the only diffs vs the engine source are:
//   - Props now use the kit's `SceneRenderProps<Scene>` envelope: `scene`
//     (the per-type spec) + `common: {ts, sceneIndex, sceneCount, meta,
//     style}`. The engine's prior `SceneProps & {style}` bag is gone.
//   - Chrome (SceneFrame, Narration, FittedText, BoundValue) and the
//     palette/cadence/numeric-reveal helpers are sourced from
//     `@docent/core/_shared`. There is no path back into `packages/engine/`.

import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Scene, SceneRenderProps} from '@docent/kit';

import {
  BoundValue,
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
  paletteAccentKey,
  paletteGlowScale,
  paletteSceneHex,
  type RevealEntry,
} from '../../_shared';

// Magnitudes. A grid of big-number figure cards (a large mono value, unit, a
// small label above, a note below), a worked numeric matrix (row and column
// labels around a filled grid), or `metrics` — figure cards whose number is a
// *tweened* value that counts up across beats. Items reveal progressively.
export const QuantitiesScene: React.FC<SceneRenderProps<Scene>> = ({
  scene,
  common,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, style} = common;
  const sc = scene as Record<string, unknown>;
  const {bg, ink, accent: accentTokens} = style.tokens;
  const accentOf = (k?: string): string =>
    (k && ((accentTokens as unknown) as Record<string, string>)[k]) || accentTokens.blue;
  // `palette` (a scene knob) re-selects the chrome accent over its family;
  // without a palette this is exactly `accent(scene.accent)`.
  const accentHex = paletteSceneHex(undefined, undefined, style);
  const glowScale = paletteGlowScale(undefined);
  const figures = (sc.figures as Array<{
    id: string;
    label: string;
    value: string | number;
    unit?: string;
    note?: string;
  }> | undefined) ?? [];
  const matrix = sc.matrix as
    | {rowLabels?: string[]; colLabels?: string[]; cells?: string[][]}
    | undefined;
  const metrics = (sc.metrics as Array<{
    id: string;
    col: number;
    row: number;
    label: string;
    bind: string;
    format?: 'int' | 'float1' | 'percent';
    unit?: string;
    accent?: string;
  }> | undefined) ?? [];

  const kicker = (sc.kicker as string | undefined) ?? '';
  const heading = sc.heading as string | undefined;

  const active = activeBeatIndex(ts.beats, frame);
  const activeBeat = ts.beats[active]?.beat as
    | {focus?: string[]}
    | undefined;
  const focusIds = new Set(activeBeat?.focus ?? []);
  const hasFocus = focusIds.size > 0;

  // `cadence` (a beat knob) shapes how the set of items a beat reveals
  // enters. `appearWith` eases one item's entrance given its RevealEntry —
  // a knob-free entry resolves to the original
  //   spring({frame: frame - revealFrameFor(i), config: {damping:200, mass:0.7}})
  // so a film that sets no cadence renders byte-identically.
  const appearWith = (r: RevealEntry | undefined): number => {
    const from = r ? r.from + cadenceOffset(r.cadence, r.order) : 0;
    const local = frame - from;
    return local <= 0
      ? 0
      : spring({frame: local, fps, config: cadenceSpringConfig(r?.cadence)});
  };

  // Adapt kit's BeatTimelineSlot[] (`startFrame`/`frames`/`beat`) to the
  // {from, reveal, cadence} shape `numericRevealMap` reads.
  const beatsForReveal = ts.beats.map((slot) => {
    const b = slot.beat as {reveal?: number | readonly string[]; cadence?: 'cascade' | 'together' | 'snap'};
    return {
      from: slot.startFrame,
      reveal: b.reveal,
      cadence: b.cadence,
    };
  });

  const headingProp = heading !== undefined ? {heading} : {};

  // ----- metrics: figure cards whose number is a tweened, counting value -----
  // Reuses the figure-card visual shell; the number comes from <BoundValue>,
  // placed on a col/row grid. A metric card appears with the first beat that
  // sets its bound value.
  if (!matrix && metrics.length > 0) {
    const cols = Math.max(1, ...metrics.map((m) => m.col + 1));
    const rows = Math.max(1, ...metrics.map((m) => m.row + 1));
    const cardW = 392;
    const cardH = 268;
    const gap = 34;

    // The reveal of a metric — the first beat whose `set` drives its bound
    // value. `cadence` (a beat knob) staggers metrics first-set by the *same*
    // beat: order is the metric's position among that beat's batch, in
    // declared metric order. A knob-free metric resolves to the original
    // `{from: <first set beat>, cadence: undefined, order: 0}`.
    const metricRevealOf = (mIndex: number): RevealEntry => {
      const bind = metrics[mIndex].bind;
      const slot = ts.beats.find((s) => {
        const b = s.beat as {set?: Record<string, unknown>};
        return b.set && bind in b.set;
      });
      if (!slot) return {from: 0, cadence: undefined, order: 0};
      // The metric's order within this beat's batch: how many earlier metrics
      // are also first-set by this same beat.
      let order = 0;
      for (let j = 0; j < mIndex; j++) {
        const earlier = ts.beats.find((s) => {
          const b = s.beat as {set?: Record<string, unknown>};
          return b.set && metrics[j].bind in b.set;
        });
        if (earlier === slot) order++;
      }
      const cad = (slot.beat as {cadence?: 'cascade' | 'together' | 'snap'}).cadence;
      return {from: slot.startFrame, cadence: cad, order};
    };

    return (
      <SceneFrame
        style={style}
        accentHex={accentHex}
        kicker={kicker}
        {...headingProp}
        sceneIndex={sceneIndex}
        sceneCount={sceneCount}
        glowScale={glowScale}
      >
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, ${cardW}px)`,
              gridTemplateRows: `repeat(${rows}, ${cardH}px)`,
              gap,
              marginTop: 40,
            }}
          >
            {metrics.map((m, mi) => {
              const a = appearWith(metricRevealOf(mi));
              if (a <= 0) return null;
              const focused = focusIds.has(m.id);
              const dim = hasFocus && !focused;
              const opacity = a * (dim ? 0.34 : 1);
              const cardScale = interpolate(a, [0, 1], [0.88, 1]);
              const breathe = focused ? 0.5 + 0.5 * Math.sin((frame / fps) * 3.2) : 0;
              // `palette` re-selects an unset metric accent over the family,
              // spread across metrics by index. Identity when no palette:
              // the metric's own accent, else the scene's.
              const mAccent = accentOf(
                paletteAccentKey(undefined, undefined, m.accent, mi),
              );

              return (
                <div
                  key={m.id}
                  style={{
                    gridColumn: m.col + 1,
                    gridRow: m.row + 1,
                    width: cardW,
                    height: cardH,
                    opacity,
                    transform: `scale(${cardScale})`,
                    borderRadius: 18,
                    background: focused
                      ? `radial-gradient(120% 140% at 0% 0%, ${glow(mAccent, 0.14)} 0%, ${bg.panelHi} 44%, ${bg.panel} 100%)`
                      : `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
                    border: `1.5px solid ${focused ? mAccent : bg.line}`,
                    boxShadow: focused
                      ? `0 0 0 1px ${glow(mAccent, 0.35)}, 0 24px 60px -22px ${glow(mAccent, 0.5 + breathe * 0.2)}`
                      : '0 18px 44px -24px #000000cc',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    padding: '0 30px',
                    textAlign: 'center',
                  }}
                >
                  {/* metric label — uppercase mono caption above the value.
                      Card is 392px wide with 60px horizontal pad
                      (~332px content). Shrink-single keeps the
                      uppercase track legible at small sizes. */}
                  <FittedText
                    text={m.label}
                    maxWidth={332}
                    basePx={16}
                    floorPx={10}
                    charAdvance={0.66}
                    mode="shrink-single"
                    style={{
                      fontFamily: monoFamily,
                      letterSpacing: 1,
                      color: ink.low,
                      textTransform: 'uppercase',
                      textAlign: 'center',
                    }}
                  />
                  <div style={{display: 'flex', alignItems: 'baseline', gap: 8, maxWidth: '100%'}}>
                    <BoundValue
                      beats={ts.beats}
                      bind={m.bind}
                      format={m.format}
                      style={{
                        fontFamily: monoFamily,
                        fontSize: 76,
                        fontWeight: 600,
                        color: ink.hi,
                        lineHeight: 1,
                        letterSpacing: -1,
                      }}
                    />
                    {m.unit ? (
                      <FittedText
                        text={m.unit}
                        maxWidth={120}
                        basePx={26}
                        floorPx={13}
                        charAdvance={0.62}
                        mode="shrink-single"
                        style={{
                          fontFamily: monoFamily,
                          fontWeight: 500,
                          color: mAccent,
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>

        <Narration style={style} beats={ts.beats} />
      </SceneFrame>
    );
  }

  // ----- figures: a centred grid of big-number cards -----
  if (!matrix && figures.length > 0) {
    const perRow = figures.length <= 3 ? figures.length : figures.length <= 4 ? 2 : 3;
    const cardW = 392;
    const cardH = 268;
    const gap = 34;
    // `cadence` shapes how the figures a beat reveals enter.
    const figureReveals = numericRevealMap(beatsForReveal, figures.length);

    return (
      <SceneFrame
        style={style}
        accentHex={accentHex}
        kicker={kicker}
        {...headingProp}
        sceneIndex={sceneIndex}
        sceneCount={sceneCount}
        glowScale={glowScale}
      >
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap,
              justifyContent: 'center',
              width: perRow * cardW + (perRow - 1) * gap,
              marginTop: 40,
            }}
          >
            {figures.map((f, i) => {
              const a = appearWith(figureReveals[i]);
              if (a <= 0) return null;
              const focused = focusIds.has(f.id);
              const dim = hasFocus && !focused;
              const opacity = a * (dim ? 0.34 : 1);
              const cardScale = interpolate(a, [0, 1], [0.88, 1]);
              const breathe = focused ? 0.5 + 0.5 * Math.sin((frame / fps) * 3.2) : 0;

              return (
                <div
                  key={f.id}
                  style={{
                    width: cardW,
                    height: cardH,
                    opacity,
                    transform: `scale(${cardScale})`,
                    borderRadius: 18,
                    background: focused
                      ? `radial-gradient(120% 140% at 0% 0%, ${glow(accentHex, 0.14)} 0%, ${bg.panelHi} 44%, ${bg.panel} 100%)`
                      : `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
                    border: `1.5px solid ${focused ? accentHex : bg.line}`,
                    boxShadow: focused
                      ? `0 0 0 1px ${glow(accentHex, 0.35)}, 0 24px 60px -22px ${glow(accentHex, 0.5 + breathe * 0.2)}`
                      : '0 18px 44px -24px #000000cc',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    padding: '0 30px',
                    textAlign: 'center',
                  }}
                >
                  {/* figure label / value / unit / note — the card is
                      392px wide with 60px horizontal pad. The numeric
                      value auto-shrinks if a string ("4.7 × 10²³") is
                      passed instead of a short literal; floor at 36 so
                      the digit still reads at thumbnail size. */}
                  <FittedText
                    text={f.label}
                    maxWidth={332}
                    basePx={16}
                    floorPx={10}
                    charAdvance={0.66}
                    mode="shrink-single"
                    style={{
                      fontFamily: monoFamily,
                      letterSpacing: 1,
                      color: ink.low,
                      textTransform: 'uppercase',
                      textAlign: 'center',
                    }}
                  />
                  <div style={{display: 'flex', alignItems: 'baseline', gap: 8, maxWidth: '100%'}}>
                    <FittedText
                      text={String(f.value)}
                      maxWidth={f.unit ? 252 : 332}
                      basePx={76}
                      floorPx={36}
                      charAdvance={0.58}
                      mode="shrink-single"
                      style={{
                        fontFamily: monoFamily,
                        fontWeight: 600,
                        color: ink.hi,
                        lineHeight: 1,
                        letterSpacing: -1,
                      }}
                    />
                    {f.unit ? (
                      <FittedText
                        text={f.unit}
                        maxWidth={120}
                        basePx={26}
                        floorPx={13}
                        charAdvance={0.62}
                        mode="shrink-single"
                        style={{
                          fontFamily: monoFamily,
                          fontWeight: 500,
                          color: accentHex,
                        }}
                      />
                    ) : null}
                  </div>
                  {f.note ? (
                    <FittedText
                      text={f.note}
                      maxWidth={332}
                      basePx={16}
                      floorPx={11}
                      charAdvance={0.58}
                      mode="shrink-wrap"
                      maxLines={2}
                      lineHeight={1.3}
                      style={{
                        fontFamily: interFamily,
                        color: ink.mid,
                        textAlign: 'center',
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </AbsoluteFill>

        <Narration style={style} beats={ts.beats} />
      </SceneFrame>
    );
  }

  // ----- matrix: a labelled numeric grid -----
  const rowLabels: string[] = matrix?.rowLabels ?? [];
  const colLabels: string[] = matrix?.colLabels ?? [];
  const cells: string[][] = matrix?.cells ?? [];

  const gridW = 1480;
  const gridX = (1920 - gridW) / 2;
  const rowHeadW = 320;
  const colW = (gridW - rowHeadW) / Math.max(1, colLabels.length);
  const colHeadH = 84;
  const cellH = Math.min(116, 600 / Math.max(1, rowLabels.length));
  const gridY = 332;
  const intro = spring({frame, fps, config: {damping: 200}});

  // Cells reveal in row-major order. `cadence` shapes how the cells a beat
  // reveals enter — the numeric-reveal map is built over the cell count.
  const cellIndex = (ri: number, ci: number): number =>
    ri * Math.max(1, colLabels.length) + ci;
  const cellReveals = numericRevealMap(
    beatsForReveal,
    rowLabels.length * Math.max(1, colLabels.length),
  );

  return (
    <SceneFrame
      style={style}
      accentHex={accentHex}
      kicker={kicker}
      {...headingProp}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      glowScale={glowScale}
    >
      <AbsoluteFill>
        {/* column labels — single line, auto-shrink. */}
        {colLabels.map((cl, ci) => (
          <div
            key={`col-${ci}`}
            style={{
              position: 'absolute',
              left: gridX + rowHeadW + ci * colW,
              top: gridY,
              width: colW,
              height: colHeadH,
              opacity: intro,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 8px',
            }}
          >
            <FittedText
              text={cl}
              maxWidth={colW - 16}
              basePx={18}
              floorPx={11}
              charAdvance={0.62}
              mode="shrink-single"
              style={{
                fontFamily: monoFamily,
                fontWeight: 500,
                color: accentHex,
                letterSpacing: 0.4,
                textAlign: 'center',
              }}
            />
          </div>
        ))}

        {/* rows */}
        {rowLabels.map((rl, ri) => (
          <React.Fragment key={`row-${ri}`}>
            {/* row label — right-aligned in the gutter; wrap to 2 lines. */}
            <div
              style={{
                position: 'absolute',
                left: gridX,
                top: gridY + colHeadH + ri * cellH,
                width: rowHeadW,
                height: cellH,
                opacity: intro,
                display: 'flex',
                alignItems: 'center',
                paddingRight: 22,
                justifyContent: 'flex-end',
              }}
            >
              <FittedText
                text={rl}
                maxWidth={rowHeadW - 30}
                basePx={20}
                floorPx={12}
                charAdvance={0.58}
                mode="shrink-wrap"
                maxLines={2}
                lineHeight={1.18}
                style={{
                  fontFamily: interFamily,
                  fontWeight: 500,
                  color: ink.mid,
                  textAlign: 'right',
                }}
              />
            </div>

            {/* cells */}
            {colLabels.map((_cl, ci) => {
              const idx = cellIndex(ri, ci);
              const a = appearWith(cellReveals[idx]);
              if (a <= 0) return null;
              const id = `${ri}-${ci}`;
              const focused = focusIds.has(id) || focusIds.has(rowLabels[ri]);
              const dim = hasFocus && !focused;
              const opacity = a * (dim ? 0.32 : 1);
              const cellScale = interpolate(a, [0, 1], [0.85, 1]);
              return (
                <div
                  key={id}
                  style={{
                    position: 'absolute',
                    left: gridX + rowHeadW + ci * colW + 7,
                    top: gridY + colHeadH + ri * cellH + 7,
                    width: colW - 14,
                    height: cellH - 14,
                    opacity,
                    transform: `scale(${cellScale})`,
                    borderRadius: 11,
                    background: focused
                      ? `linear-gradient(158deg, ${glow(accentHex, 0.15)}, ${glow(accentHex, 0.05)})`
                      : `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
                    border: `1.5px solid ${focused ? accentHex : bg.line}`,
                    boxShadow: focused
                      ? `0 0 22px -8px ${glow(accentHex, 0.6)}`
                      : '0 14px 34px -24px #000000cc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 10px',
                  }}
                >
                  {/* matrix cell — usually a short numeric or 1-word
                      string; auto-shrink the rare long entry. */}
                  <FittedText
                    text={String(cells[ri]?.[ci] ?? '—')}
                    maxWidth={colW - 14 - 20}
                    basePx={26}
                    floorPx={12}
                    charAdvance={0.62}
                    mode="shrink-single"
                    style={{
                      fontFamily: monoFamily,
                      fontWeight: 500,
                      color: focused ? accentHex : ink.hi,
                      textAlign: 'center',
                    }}
                  />
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};

export default QuantitiesScene;
