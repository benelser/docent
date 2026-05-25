import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {glow} from '../theme';
import {SceneFrame} from '../components/SceneFrame';
import {Narration} from '../components/Narration';
import {FittedText} from '../components/FittedText';
import {activeBeatIndex, type SceneProps} from '../engine/spec';
import type {ResolvedStyle} from '../style';

// ObjectionScene — the film argues against itself, then refutes.
//
// Distinct from `tension` (which is the design trade-off the author chose)
// and from `recap` (which adjudicates the whole film): the objection scene
// is the *intellectual counterattack the author has anticipated*. The strong
// version is a steelman the author has not invented to beat: a real
// counterposition the film answers, partially or in full.
//
// Render contract: three stacked panels — CLAIM (lit, the film's accent),
// OBJECTION (a rose-leaning panel, slightly dimmed), and REFUTATION (lit
// again, dimming the objection but not deleting it). The refutation visually
// *overlays* the objection: the objection panel sits behind, dimmed by the
// refutation arriving. The strength (`partial` / `full`) drives a chip on
// the refutation panel — a `partial` ribbon says explicitly that the
// objection is partly conceded; a `full` chip is the film's whole answer.

const accentOf = (style: ResolvedStyle, key?: string): string => {
  const map = style.tokens.accent as unknown as Record<string, string>;
  return (key && map[key]) || map.blue;
};

const ROSE = '#ff7d97';

type PanelKind = 'claim' | 'objection' | 'refutation';

const PanelHeader: React.FC<{
  label: string;
  color: string;
  monoFamily: string;
  rightChip?: React.ReactNode;
}> = ({label, color, monoFamily, rightChip}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    }}
  >
    <div
      style={{
        fontFamily: monoFamily,
        fontSize: 17,
        color,
        letterSpacing: 3,
        textTransform: 'uppercase',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
      {label}
    </div>
    {rightChip}
  </div>
);

export const ObjectionScene: React.FC<SceneProps & {style: ResolvedStyle}> = ({
  ts,
  sceneIndex,
  sceneCount,
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const accentHex = accentOf(style, undefined);
  const ink = style.tokens.ink;
  const bg = style.tokens.bg;
  const sansFamily = style.tokens.typography.family.sans;
  const monoFamily = style.tokens.typography.family.mono;

  const claim = scene.claim ?? '';
  const objection = scene.objection ?? '';
  const evidence = scene.evidence ?? [];
  const refutation = scene.refutation ?? '';
  const strength: 'partial' | 'full' = scene.refutationStrength ?? 'full';

  // Each panel arrives on its own beat (claim → objection → refutation). The
  // dimming of the objection ties to the refutation's arrival, so the
  // visual rhetoric — refutation overlays objection — is animation-led.
  const beatStart = (i: number): number => ts.beats[i]?.from ?? 1e9;
  const rise = (start: number) => {
    const local = frame - start;
    return local <= 0
      ? 0
      : spring({frame: local, fps, config: {damping: 200, mass: 1.1}});
  };

  // First three beats drive the three panels; later beats reinforce. If the
  // author shipped fewer than 3 beats we degrade gracefully (everything
  // arrives on the first beat).
  const claimAt = beatStart(0);
  const objectionAt = ts.beats.length >= 2 ? beatStart(1) : claimAt;
  const refutationAt =
    ts.beats.length >= 3
      ? beatStart(2)
      : ts.beats.length === 2
        ? beatStart(1)
        : claimAt;

  const claimA = rise(claimAt);
  const objectionA = rise(objectionAt);
  const refutationA = rise(refutationAt);

  // Once refutation arrives, the objection panel dims (but is not deleted —
  // the rhetorical contract is that the objection remains visible while the
  // refutation overlays it).
  const objectionDim = interpolate(refutationA, [0, 1], [1, 0.5]);

  const active = activeBeatIndex(ts.beats, frame);
  void active;

  const SLOT_W = 1480;

  // Panel — the shared shape. `kind` drives accent + dim behaviour.
  const Panel: React.FC<{
    kind: PanelKind;
    label: string;
    text: string;
    extra?: React.ReactNode;
    enter: number;
    dim?: number;
    rightChip?: React.ReactNode;
  }> = ({kind, label, text, extra, enter, dim = 1, rightChip}) => {
    const color = kind === 'objection' ? ROSE : accentHex;
    const isObjection = kind === 'objection';
    return (
      <div
        style={{
          opacity: enter * dim,
          transform: `translateY(${(1 - enter) * 12}px)`,
          padding: '20px 26px',
          borderRadius: 14,
          background: isObjection
            ? `linear-gradient(158deg, ${glow(color, 0.18)}, ${bg.panel})`
            : `linear-gradient(158deg, ${bg.panelHi}, ${bg.panel})`,
          border: `1.5px solid ${glow(color, isObjection ? 0.4 : 0.55)}`,
          boxShadow: `0 0 32px -12px ${glow(color, 0.55)}`,
          width: SLOT_W,
          boxSizing: 'border-box',
        }}
      >
        <PanelHeader
          label={label}
          color={color}
          monoFamily={monoFamily}
          rightChip={rightChip}
        />
        <FittedText
          text={text}
          maxWidth={SLOT_W - 60}
          basePx={26}
          floorPx={17}
          charAdvance={0.55}
          mode="shrink-wrap"
          maxLines={4}
          lineHeight={1.34}
          style={{
            fontFamily: sansFamily,
            fontWeight: kind === 'refutation' ? 500 : 400,
            color: ink.hi,
            letterSpacing: -0.2,
          }}
        />
        {extra}
      </div>
    );
  };

  // Strength chip — `partial` is honest about its concession; `full` is the
  // film's entire answer. The chip lives on the refutation panel and uses
  // the film's accent (refutation reasserts the film's voice).
  const StrengthChip: React.FC = () => (
    <div
      style={{
        fontFamily: monoFamily,
        fontSize: 13,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: strength === 'partial' ? ink.mid : accentHex,
        padding: '4px 10px',
        borderRadius: 999,
        background: strength === 'partial' ? bg.panel : glow(accentHex, 0.18),
        border: `1px solid ${strength === 'partial' ? ink.faint : glow(accentHex, 0.55)}`,
        opacity: refutationA,
      }}
    >
      {strength} refutation
    </div>
  );

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
          left: (1920 - SLOT_W) / 2,
          top: 248,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <Panel kind="claim" label="claim" text={claim} enter={claimA} />
        <Panel
          kind="objection"
          label="objection"
          text={objection}
          enter={objectionA}
          dim={objectionDim}
          extra={
            evidence.length > 0 ? (
              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  paddingLeft: 16,
                  borderLeft: `2px solid ${glow(ROSE, 0.5)}`,
                }}
              >
                {evidence.map((e, i) => (
                  <div
                    key={i}
                    style={{
                      fontFamily: sansFamily,
                      fontSize: 17,
                      color: ink.mid,
                      letterSpacing: -0.1,
                      lineHeight: 1.4,
                    }}
                  >
                    {e}
                  </div>
                ))}
              </div>
            ) : null
          }
        />
        <Panel
          kind="refutation"
          label="refutation"
          text={refutation}
          enter={refutationA}
          rightChip={<StrengthChip />}
        />
      </div>
      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
