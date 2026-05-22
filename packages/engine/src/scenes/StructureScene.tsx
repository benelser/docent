import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {accent} from '../theme';
import {SceneFrame} from '../components/SceneFrame';
import {Card, type CardState} from '../components/Card';
import {Connector, type EdgeState} from '../components/Connector';
import {Pulse} from '../components/Pulse';
import {Narration} from '../components/Narration';
import {NodeRepresentation} from '../components/NodeRepr';
import {nodeBox, type Box} from '../engine/layout';
import {resolveCamera} from '../engine/camera';
import {
  activeBeatIndex,
  hasTransform,
  morphTimeline,
  resolveMorph,
  type Node,
  type SceneProps,
} from '../engine/spec';

// Renders a node-and-edge diagram, revealed and focused beat by beat, with
// optional flow pulses. This one template carries most architecture films.
//
// Morph — a `transform` directive re-binds a node to a new definition; the
// engine eases old→new across that beat (the bounding box tweens, the
// representations cross-fade). Nodes that are *not* transform targets stay on
// the existing, unchanged code path, so every transform-free film renders
// byte-identically.
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

  // ----- morph — the set of node ids any beat transforms ------------------
  // When empty, every node below takes the existing unchanged <Card> path.
  const morphsHere = hasTransform(ts.beats);
  const morphTargets = new Set<string>();
  if (morphsHere) {
    ts.beats.forEach((b) =>
      b.transform?.forEach((t) => morphTargets.add(t.node)),
    );
  }

  // Render one node — either as the existing Card, or, for a morph target,
  // as a container-tweened box with the old→new representations cross-faded.
  const renderNode = (n: Node): React.ReactNode => {
    // Fast path — a non-transformed node is exactly the original <Card>.
    if (!morphTargets.has(n.id)) {
      return (
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
      );
    }

    // Morph path — resolve the bracketing (from, to) definitions and the
    // eased progress p between them at this frame.
    const states = morphTimeline(n, ts.beats);
    const {from: fromDef, to: toDef, p} = resolveMorph(
      states,
      ts.beats,
      frame,
      fps,
    );
    const state = nodeState(n.id);
    if (state === 'hidden') return null;

    // The container box tweens continuously between the two definitions'
    // geometry — the bounding box interpolates, so the morph reads as one
    // object changing rather than two objects swapping.
    const fromBox = nodeBox(fromDef, cols, rows);
    const toBox = nodeBox(toDef, cols, rows);
    const box: Box = {
      cx: fromBox.cx + (toBox.cx - fromBox.cx) * p,
      cy: fromBox.cy + (toBox.cy - fromBox.cy) * p,
      w: fromBox.w + (toBox.w - fromBox.w) * p,
      h: fromBox.h + (toBox.h - fromBox.h) * p,
    };

    // One representation, drawn into the tweened container at a given
    // opacity. `box` stays the existing <Card>; others use NodeRepresentation.
    const repr = (def: Node, opacity: number): React.ReactNode => {
      if (opacity <= 0) return null;
      const as = def.as ?? 'box';
      const inner =
        as === 'box' ? (
          <Card
            box={box}
            label={def.label}
            sub={def.sub}
            tag={def.tag}
            accentHex={accent(def.accent ?? scene.accent)}
            emphasis={def.emphasis}
            weight={def.weight}
            state={state}
            enterFrame={revealOf(n.id)}
          />
        ) : (
          <NodeRepresentation
            box={box}
            node={def}
            accentHex={accent(def.accent ?? scene.accent)}
          />
        );
      return <div style={{opacity}}>{inner}</div>;
    };

    // The cross-fade — old representation at 1−p, new at p. When p is 0 or 1
    // exactly one representation is drawn, so a resting node is crisp.
    return (
      <React.Fragment key={n.id}>
        {repr(fromDef, 1 - p)}
        {repr(toDef, p)}
      </React.Fragment>
    );
  };

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

      {nodes.map((n) => renderNode(n))}

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
