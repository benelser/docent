import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {accent} from '../theme';
import {SceneFrame} from '../components/SceneFrame';
import {Card, type CardState} from '../components/Card';
import {Connector, type EdgeState} from '../components/Connector';
import {Pulse} from '../components/Pulse';
import {Narration} from '../components/Narration';
import {nodeBox, type Box} from '../engine/layout';
import {resolveCamera} from '../engine/camera';
import {activeBeatIndex, type SceneProps} from '../engine/spec';

// Renders a node-and-edge diagram, revealed and focused beat by beat, with
// optional flow pulses. This one template carries most architecture films.
export const StructureScene: React.FC<SceneProps> = ({
  ts,
  sceneIndex,
  sceneCount,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = ts.scene;
  const accentHex = accent(scene.accent);
  const cols = scene.grid?.cols ?? 3;
  const rows = scene.grid?.rows ?? 3;
  const nodes = scene.nodes ?? [];
  const edges = scene.edges ?? [];

  const boxes: Record<string, Box> = {};
  nodes.forEach((n) => {
    boxes[n.id] = nodeBox(n, cols, rows);
  });

  // First frame at which each node/edge id is revealed.
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
  const beat = ts.beats[active];
  const focusIds = new Set(beat?.focus ?? []);
  const focusNodes = new Set([...focusIds].filter((id) => boxes[id]));
  const hasNodeFocus = focusNodes.size > 0;

  const nodeState = (id: string): CardState => {
    if (frame < revealOf(id)) return 'hidden';
    if (hasNodeFocus) return focusNodes.has(id) ? 'focus' : 'dim';
    return 'normal';
  };
  const edgeState = (id: string): EdgeState =>
    frame < revealOf(id) ? 'hidden' : 'normal';

  // Flow pulses for the active beat, staggered sequentially.
  const pulses = beat?.pulse ?? [];
  const inBeat = frame - (beat?.from ?? 0);
  const pulseWindow = (beat?.durationInFrames ?? 1) * 0.8;
  const each = pulses.length ? pulseWindow / pulses.length : 1;

  // The camera leans toward focus — clamped so the diagram never leaves frame.
  const cam = resolveCamera(ts.beats, active, boxes, frame, fps);

  return (
    <SceneFrame
      accentHex={accentHex}
      kicker={scene.kicker}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      cam={cam}
    >
      <AbsoluteFill
        style={{
          transformOrigin: '0 0',
          transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.scale})`,
        }}
      >
      {edges.map((e) => (
        <Connector
          key={e.id}
          from={boxes[e.from]}
          to={boxes[e.to]}
          accentHex={e.kind === 'feedback' ? accentHex : '#8c98ad'}
          state={edgeState(e.id)}
          enterFrame={revealOf(e.id)}
          kind={e.kind}
          label={e.label}
        />
      ))}

      {nodes.map((n) => (
        <Card
          key={n.id}
          box={boxes[n.id]}
          label={n.label}
          sub={n.sub}
          tag={n.tag}
          accentHex={accent(n.accent ?? scene.accent)}
          emphasis={n.emphasis}
          weight={n.weight}
          state={nodeState(n.id)}
          enterFrame={revealOf(n.id)}
        />
      ))}

      {pulses.map(([f, t], i) => {
        if (!boxes[f] || !boxes[t]) return null;
        const localT = (inBeat - i * each) / each;
        return (
          <Pulse key={`${f}-${t}-${i}`} from={boxes[f]} to={boxes[t]} accentHex={accentHex} t={localT} />
        );
      })}
      </AbsoluteFill>

      <Narration beats={ts.beats} />
    </SceneFrame>
  );
};
