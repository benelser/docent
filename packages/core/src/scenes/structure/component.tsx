// StructureScene — a node-and-edge diagram, revealed and focused beat by
// beat, with optional flow pulses and per-node morphs.
//
// MIGRATED from packages/engine/src/scenes/StructureScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. Behaviour is UNCHANGED from the
// v2.5.x renderer; only:
//   - props receive `SceneRenderProps<StructureScene>` from @bjelser/kit (the
//     kit-owned `{scene, common}` envelope), rather than the legacy
//     `SceneProps` (the engine-owned `ts: TimedScene` envelope). The
//     beat-timeline shape is the kit's `BeatTimelineSlot` (with
//     `startFrame`/`frames`/`beat`) rather than the engine's `TimedBeat`
//     (with `from`/`durationInFrames` + flat fields).
//   - the engine-shared chrome and helpers (SceneFrame, Narration, Card,
//     Connector, Pulse, NodeRepresentation, EmbeddedScene, layout, camera,
//     knobs, theme, fonts) live as colocated underscore-prefixed local
//     files until the shared-infra migration agent lands.
//
// Morph — a `transform` directive re-binds a node to a new definition; the
// engine eases old→new across that beat (the bounding box tweens, the
// representations cross-fade). Nodes that are *not* transform targets stay
// on the existing, unchanged code path, so every transform-free film
// renders byte-identically.

import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {SceneRenderProps} from '@bjelser/kit';

import {Card, type CardState} from './_card';
import {Connector, type EdgeState} from './_connector';
import {EmbeddedScene} from './_embedded-scene';
import {
  Narration,
  SceneFrame,
  activeBeatIndex,
  cadenceOffset,
  paletteAccentKey,
  paletteGlowScale,
  paletteSceneHex,
} from '../../_shared';
import type {Beat} from '@bjelser/kit';
import {
  hasTransform,
  morphTimeline,
  resolveMorph,
} from './_helpers';
import {nodeBox, resolveLayout, type Box} from './_layout';
import {resolveCamera} from './_camera';
import {useStage} from '@bjelser/kit';
import {NodeRepresentation} from './_node-repr';
import {Pulse} from './_pulse';
import type {StructureNode, StructureScene} from './_types';

type Cadence = Beat['cadence'];

export const StructureSceneComponent: React.FC<SceneRenderProps<StructureScene>> = ({
  scene,
  common,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {ts, sceneIndex, sceneCount, style} = common;
  // Aspect-aware STAGE — passed through to nodeBox/cellCenter so the grid
  // scales with the canvas.
  const stage = useStage();

  // Resolve an accent key against the active token bundle. Mirrors the
  // historical `accent(k)` fallback: unknown / undefined → blue.
  const accentOf = (k?: string): string =>
    (k && ((style.tokens.accent as unknown) as Record<string, string>)[k]) ||
    style.tokens.accent.blue;

  // The scene's chrome accent. `palette` (a scene knob) was removed in
  // v2.4.0; passing `undefined` reproduces the byte-identical default.
  const accentHex = paletteSceneHex(undefined, undefined, style);
  const cols = scene.grid?.cols ?? 3;
  const rows = scene.grid?.rows ?? 3;

  // Resolve any wide-flag collisions before computing boxes — the
  // layout-level belt that ensures a card cannot visually overlap another,
  // even if the spec is bad. validate.ts is the suspenders; this is the belt.
  const nodes = resolveLayout(scene.nodes ?? [], cols);
  const edges = scene.edges ?? [];

  const boxes: Record<string, Box> = {};
  nodes.forEach((n) => {
    boxes[n.id] = nodeBox(n, cols, rows, stage);
  });

  // First frame at which each node/edge id is revealed. `cadence` (a beat
  // knob) shapes the entrance of the set a beat reveals: `cascade` staggers
  // each item by CASCADE_STEP frames; `together`/`snap`/undefined keep the
  // shared start frame.
  const revealFrame: Record<string, number> = {};
  const revealCadence: Record<string, Cadence> = {};
  ts.beats.forEach((b) => {
    const r = (b.beat as {reveal?: unknown}).reveal;
    const cadence = (b.beat as {cadence?: Cadence}).cadence;
    if (Array.isArray(r)) {
      (r as string[]).forEach((id, order) => {
        if (revealFrame[id] === undefined) {
          revealFrame[id] = b.startFrame + cadenceOffset(cadence, order);
          revealCadence[id] = cadence;
        }
      });
    }
  });
  const revealOf = (id: string): number => revealFrame[id] ?? 0;
  const cadenceOf = (id: string): Cadence => revealCadence[id];

  // `palette` (a scene knob) biases which of the six accents each node
  // draws. Without a palette this is the identity — every node resolves
  // exactly the accent it did before.
  const nodeAccentKey = (n: StructureNode, order: number): string =>
    paletteAccentKey(undefined, undefined, n.accent, order);

  const active = activeBeatIndex(ts.beats, frame);
  const beatSlot = ts.beats[active];
  const beat = beatSlot?.beat;
  const focusList = (beat as {focus?: readonly string[]} | undefined)?.focus;
  const focusIds = new Set<string>(Array.isArray(focusList) ? focusList : []);
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
  const pulses = ((beat as {pulse?: ReadonlyArray<[string, string]>} | undefined)?.pulse) ?? [];
  const inBeat = frame - (beatSlot?.startFrame ?? 0);
  const pulseWindow = (beatSlot?.frames ?? 1) * 0.8;
  const each = pulses.length ? pulseWindow / pulses.length : 1;

  // The camera leans toward focus — clamped so the diagram never leaves frame.
  const cam = resolveCamera(ts.beats, active, boxes, frame, fps);

  // ----- morph — the set of node ids any beat transforms -----------------
  // When empty, every node below takes the existing unchanged <Card> path.
  const morphsHere = hasTransform(ts.beats);
  const morphTargets = new Set<string>();
  if (morphsHere) {
    ts.beats.forEach((b) => {
      // Structure's per-node morph shape is *wider* than the kit's
      // `BeatTransformDirective` (it carries a full `into: Partial<Node>`),
      // so we read it back as the structure-owned shape via `unknown` —
      // the kit's open index signature on Beat sanctions this.
      const ts2 = (b.beat as unknown as {
        transform?: ReadonlyArray<{node: string}>;
      }).transform;
      if (Array.isArray(ts2)) {
        ts2.forEach((t) => morphTargets.add(t.node));
      }
    });
  }

  // Render one node — either as the existing Card, or, for a morph target,
  // as a container-tweened box with the old→new representations cross-faded.
  const renderNode = (n: StructureNode, order: number): React.ReactNode => {
    // Fast path — a non-transformed node is exactly the original <Card>.
    if (!morphTargets.has(n.id)) {
      // boxes[n.id] non-null: `n` iterates over `nodes`, and `boxes` was
      // populated from the same `nodes` forEach above, so the entry exists.
      return (
        <Card
          style={style}
          key={n.id}
          box={boxes[n.id]!}
          label={n.label}
          sub={n.sub}
          tag={n.tag}
          accentHex={accentOf(nodeAccentKey(n, order))}
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
    const fromBox = nodeBox(fromDef, cols, rows, stage);
    const toBox = nodeBox(toDef, cols, rows, stage);
    const box: Box = {
      cx: fromBox.cx + (toBox.cx - fromBox.cx) * p,
      cy: fromBox.cy + (toBox.cy - fromBox.cy) * p,
      w: fromBox.w + (toBox.w - fromBox.w) * p,
      h: fromBox.h + (toBox.h - fromBox.h) * p,
    };

    // One representation, drawn into the tweened container at a given
    // opacity. `box` stays the existing <Card>; others use NodeRepresentation.
    const reprAccentOf = (def: StructureNode): string =>
      accentOf(paletteAccentKey(undefined, undefined, def.accent, order));
    const repr = (def: StructureNode, opacity: number): React.ReactNode => {
      if (opacity <= 0) return null;
      const as = def.as ?? 'box';
      const inner =
        as === 'box' ? (
          <Card
            style={style}
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
            style={style}
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
      style={style}
      accentHex={accentHex}
      kicker={scene.kicker ?? ''}
      heading={scene.heading}
      sceneIndex={sceneIndex}
      sceneCount={sceneCount}
      cam={cam}
      glowScale={paletteGlowScale(undefined)}
    >
      <AbsoluteFill
        style={{
          transformOrigin: '0 0',
          transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.scale})`,
        }}
      >
        {edges.map((e) => (
          // boxes[e.from / e.to] non-null: scene validation guarantees edge
          // endpoints reference existing nodes, and every node populated
          // `boxes` above.
          <Connector
            style={style}
            key={e.id}
            from={boxes[e.from]!}
            to={boxes[e.to]!}
            // An entailment / causal claim takes the scene accent — the line
            // is the argument, so it carries the scene's voice. A plain
            // `relation` stays the neutral wire grey, byte-identical to before.
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

        {/* Sprint B — compositional embeds. A structure node may carry a
            static sub-scene tableau drawn over its card. The embed is sized
            to the box and rendered on top of the Card (which the parent
            owns); reveal/dim follows the host node's state. */}
        <svg
          style={{position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none'}}
          viewBox={`0 0 ${stage.worldW} ${stage.worldH}`}
        >
          {nodes.map((n) => {
            if (!n.embed) return null;
            const state = nodeState(n.id);
            if (state === 'hidden') return null;
            const opacity = state === 'dim' ? 0.36 : 1;
            const box = boxes[n.id];
            if (!box) return null;
            return (
              <g key={`embed-${n.id}`} opacity={opacity}>
                <EmbeddedScene
                  embed={n.embed}
                  bounds={{cx: box.cx, cy: box.cy, w: box.w * 0.88, h: box.h * 0.7}}
                  inheritedStyle={style}
                  parentAccent={accentOf(nodeAccentKey(n, nodes.indexOf(n)))}
                />
              </g>
            );
          })}
        </svg>

        {pulses.map(([f, t], i) => {
          if (!boxes[f] || !boxes[t]) return null;
          const localT = (inBeat - i * each) / each;
          return (
            <Pulse
              style={style}
              key={`${f}-${t}-${i}`}
              from={boxes[f]}
              to={boxes[t]}
              accentHex={accentHex}
              t={localT}
            />
          );
        })}
      </AbsoluteFill>

      <Narration style={style} beats={ts.beats} />
    </SceneFrame>
  );
};
