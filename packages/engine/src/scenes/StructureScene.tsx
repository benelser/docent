import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {accent} from '../theme';
import {SceneFrame} from '../components/SceneFrame';
import {Card, type CardState} from '../components/Card';
import {Connector, type EdgeState} from '../components/Connector';
import {Pulse} from '../components/Pulse';
import {Narration} from '../components/Narration';
import {NodeRepresentation} from '../components/NodeRepr';
import {nodeBox, resolveLayout, type Box} from '../engine/layout';
import {resolveCamera} from '../engine/camera';
import {
  activeBeatIndex,
  hasTransform,
  morphTimeline,
  resolveMorph,
  type Beat,
  type Node,
  type SceneProps,
} from '../engine/spec';
import {
  cadenceOffset,
  paletteAccentKey,
  paletteGlowScale,
  paletteSceneHex,
} from '../engine/knobs';

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
  // The scene's chrome accent. `palette` (a scene knob), when set, re-selects
  // it over the palette family; without a palette this is exactly
  // `accent(scene.accent)` — byte-identical to before the knob existed.
  const accentHex = paletteSceneHex(scene.palette, scene.accent);
  const cols = scene.grid?.cols ?? 3;
  const rows = scene.grid?.rows ?? 3;
  // Resolve any wide-flag collisions before computing boxes — the layout-level
  // belt that ensures a card cannot visually overlap another, even if the spec
  // is bad. validate.ts is the suspenders; this is the belt.
  const nodes = resolveLayout(scene.nodes ?? [], cols);
  const edges = scene.edges ?? [];

  const boxes: Record<string, Box> = {};
  nodes.forEach((n) => {
    boxes[n.id] = nodeBox(n, cols, rows);
  });

  // First frame at which each node/edge id is revealed. `cadence` (a beat
  // knob) shapes the *entrance* of the set a beat reveals: `cascade` staggers
  // each item by ~5 frames in its declared order; `together`/`snap`/undefined
  // keep the shared start frame. The order index is the item's position in
  // the beat's `reveal` array. A beat with no cadence yields offset 0 — so a
  // knob-free scene's reveal frames are identical to before.
  const revealFrame: Record<string, number> = {};
  const revealCadence: Record<string, Beat['cadence']> = {};
  ts.beats.forEach((b) => {
    if (Array.isArray(b.reveal)) {
      b.reveal.forEach((id, order) => {
        if (revealFrame[id] === undefined) {
          revealFrame[id] = b.from + cadenceOffset(b.cadence, order);
          revealCadence[id] = b.cadence;
        }
      });
    }
  });
  const revealOf = (id: string): number => revealFrame[id] ?? 0;
  const cadenceOf = (id: string): Beat['cadence'] => revealCadence[id];

  // `palette` (a scene knob) biases which of the six accents each node draws.
  // Without a palette this is the identity — every node resolves exactly the
  // accent it did before. With a palette, a node's unset accent is filled
  // from the family, spread across nodes by declared order.
  const nodeAccentKey = (n: Node, order: number): string =>
    paletteAccentKey(scene.palette, scene.accent, n.accent, order);

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
  // `order` is the node's declared index, used for palette spread.
  const renderNode = (n: Node, order: number): React.ReactNode => {
    // Fast path — a non-transformed node is exactly the original <Card>.
    if (!morphTargets.has(n.id)) {
      return (
        <Card
          key={n.id}
          box={boxes[n.id]}
          label={n.label}
          sub={n.sub}
          tag={n.tag}
          accentHex={accent(nodeAccentKey(n, order))}
          emphasis={n.emphasis}
          weight={n.weight}
          state={nodeState(n.id)}
          enterFrame={revealOf(n.id)}
          cadence={cadenceOf(n.id)}
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
    // Accent resolution mirrors the original `def.accent ?? scene.accent`,
    // with `palette` (when set) re-selecting an unset accent over the family.
    const reprAccentOf = (def: Node): string =>
      accent(paletteAccentKey(scene.palette, scene.accent, def.accent, order));
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
            accentHex={reprAccentOf(def)}
            emphasis={def.emphasis}
            weight={def.weight}
            state={state}
            enterFrame={revealOf(n.id)}
            cadence={cadenceOf(n.id)}
          />
        ) : (
          <NodeRepresentation
            box={box}
            node={def}
            accentHex={reprAccentOf(def)}
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
      glowScale={paletteGlowScale(scene.palette)}
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
          // An entailment / causal claim takes the scene accent — the line is
          // the argument, so it carries the scene's voice. A plain `relation`
          // stays the neutral wire grey, byte-identical to before.
          accentHex={
            e.kind === 'feedback' || e.kind === 'entails' || e.kind === 'causes'
              ? accentHex
              : '#8c98ad'
          }
          state={edgeState(e.id)}
          enterFrame={revealOf(e.id)}
          kind={e.kind}
          strength={e.strength}
          label={e.label}
          cadence={cadenceOf(e.id)}
        />
      ))}

      {nodes.map((n, i) => renderNode(n, i))}

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
