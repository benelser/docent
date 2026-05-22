import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {accent, theme, glow, ACCENTS} from '../theme';
import {interFamily, monoFamily} from '../fonts';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {activeBeatIndex, type SceneProps} from '../engine/spec';
import {
  cadenceOffset,
  cadenceSpringConfig,
  numericRevealMap,
  paletteGlowScale,
  paletteSceneHex,
} from '../engine/knobs';

// A sensitivity probe: a baseline (its label → its outcome) pinned at the top,
// then a row per variation — the perturbed input, an arrow, the resulting
// outcome, and a flip indicator. `flips: true` is a bold rose "flipped"
// marker; otherwise a muted "held". Variations reveal one beat at a time.
export const ProbeScene: React.FC<SceneProps> = ({
  ts,
  sceneIndex,
  sceneCount,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  // `palette` (a scene knob) re-selects the chrome accent over its family;
  // without a palette this is exactly `accent(scene.accent)`.
  const accentHex = paletteSceneHex(scene.palette, scene.accent);
  const baseline = scene.baseline;
  const variations = scene.variations ?? [];

  // `cadence` (a beat knob) shapes how the variations a beat reveals enter —
  // the numeric-reveal map gives each variation's revealing-beat frame,
  // cadence, and batch order. A knob-free scene is byte-identical.
  const reveals = numericRevealMap(ts.beats, variations.length);
  const variationEnterFor = (i: number): number => {
    const r = reveals[i];
    return r ? r.from + cadenceOffset(r.cadence, r.order) : 0;
  };

  const active = activeBeatIndex(ts.beats, frame);
  const focusIds = new Set(ts.beats[active]?.focus ?? []);
  const hasFocus = focusIds.size > 0;

  const intro = spring({frame, fps, config: {damping: 200}});
  const rowW = 1380;
  const rowX = (1920 - rowW) / 2;

  // A single change → outcome row, used for both baseline and variations.
  const Row: React.FC<{
    change: string;
    outcome: string;
    tag: React.ReactNode;
    arrow: boolean;
  }> = ({change, outcome, tag, arrow}) => (
    <div style={{display: 'flex', alignItems: 'center', gap: 22, width: '100%'}}>
      <div
        style={{
          flex: 1,
          fontFamily: monoFamily,
          fontSize: 21,
          fontWeight: 500,
          color: theme.ink.hi,
          padding: '0 4px',
        }}
      >
        {change}
      </div>
      <div
        style={{
          fontFamily: monoFamily,
          fontSize: 26,
          color: theme.ink.low,
          width: 40,
          textAlign: 'center',
        }}
      >
        {arrow ? '→' : ''}
      </div>
      <div
        style={{
          flex: 1.1,
          fontFamily: interFamily,
          fontSize: 21,
          fontWeight: 500,
          color: theme.ink.mid,
        }}
      >
        {outcome}
      </div>
      <div style={{width: 132, flexShrink: 0, textAlign: 'right'}}>{tag}</div>
    </div>
  );

  return (
    <SceneFrame
      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      glowScale={paletteGlowScale(scene.palette)}
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
                : spring({frame: local, fps, config: cadenceSpringConfig(reveals[i]?.cadence)});
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

      <Narration beats={ts.beats} />
    </SceneFrame>
  );
};
