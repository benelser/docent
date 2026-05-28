// @example/docent-feature-microsyntax — the R6 preprocessSpec demo.
//
// A FeaturePlugin that uses preprocessSpec to expand inline microsyntax
// shortcuts BEFORE validation, so authors can write a tighter spec and
// have the cascade fill in the boilerplate. Three concrete directives:
//
//   @@@auto-id        — at scene level: any node/edge/cell/etc. without
//                       an `id` field gets one derived from its label
//                       (lowercase, hyphenated). Useful when authors
//                       hand-write scenes and want stable ids without
//                       repeating themselves.
//
//   @@@reveal-all     — at scene level: the LAST narration beat that
//                       doesn't already set `reveal` gets `reveal: [<all
//                       node ids>]`. Lets a scene declare "and then
//                       everything is on screen" without enumerating.
//
//   @@@beat-stride N  — at scene level: if a single beat carries a long
//                       narration, split it into N beats by sentence
//                       boundary (period+space, '. '). The first sentence
//                       inherits the original beat's `id`+`reveal`+...;
//                       the rest are bare narrations. Useful when authors
//                       draft long-form prose first and shape rhythm later.
//
// All three are SCENE-LEVEL directives — they appear in the scene object's
// optional `directives: ['@@@auto-id', '@@@reveal-all']` array (so the
// validator doesn't trip on unknown top-level fields). The preprocessor
// reads + removes them before the validator sees the spec.
//
// Chain semantics: this feature returns a NEW spec object; if multiple
// preprocessSpec features run, each receives the output of the previous.
// The orchestrator calls them in registration order. Identity is the
// default: scenes without a `directives` array pass through unchanged.

import type {FeaturePlugin, FilmSpec} from '@bjelser/kit';

const DIRECTIVE_AUTO_ID = '@@@auto-id';
const DIRECTIVE_REVEAL_ALL = '@@@reveal-all';
const DIRECTIVE_BEAT_STRIDE_RE = /^@@@beat-stride\s+(\d+)$/;

/**
 * Derive a stable id from a label string. Lowercases, replaces runs of
 * non-alphanumeric with hyphens, trims leading/trailing hyphens, truncates
 * to 40 chars. Collision-handling is left to the caller.
 */
const idFromLabel = (label: string): string => {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'unnamed';
};

interface NodeLike {
  id?: string;
  label?: string;
  [key: string]: unknown;
}

interface EdgeLike {
  id?: string;
  from?: string;
  to?: string;
  [key: string]: unknown;
}

interface BeatLike {
  id?: string;
  narration?: string;
  reveal?: ReadonlyArray<string>;
  [key: string]: unknown;
}

interface SceneLike {
  type?: string;
  directives?: ReadonlyArray<string>;
  nodes?: ReadonlyArray<NodeLike>;
  edges?: ReadonlyArray<EdgeLike>;
  beats?: ReadonlyArray<BeatLike>;
  [key: string]: unknown;
}

const applyAutoId = (scene: SceneLike): SceneLike => {
  let out: SceneLike = scene;
  if (Array.isArray(scene.nodes)) {
    const used = new Set<string>();
    for (const n of scene.nodes) if (n.id) used.add(n.id);
    const newNodes: NodeLike[] = scene.nodes.map((n) => {
      if (n.id) return n;
      if (!n.label) return n;
      const base = idFromLabel(n.label);
      let id = base;
      let suffix = 2;
      while (used.has(id)) id = `${base}-${suffix++}`;
      used.add(id);
      return {...n, id};
    });
    out = {...out, nodes: newNodes};
  }
  if (Array.isArray(out.edges)) {
    const used = new Set<string>();
    for (const e of out.edges) if (e.id) used.add(e.id);
    const newEdges: EdgeLike[] = out.edges.map((e) => {
      if (e.id) return e;
      if (!e.from || !e.to) return e;
      const base = `${e.from}-${e.to}`.slice(0, 40);
      let id = base;
      let suffix = 2;
      while (used.has(id)) id = `${base}-${suffix++}`;
      used.add(id);
      return {...e, id};
    });
    out = {...out, edges: newEdges};
  }
  return out;
};

const applyRevealAll = (scene: SceneLike): SceneLike => {
  if (!Array.isArray(scene.nodes) || scene.nodes.length === 0) return scene;
  if (!Array.isArray(scene.beats) || scene.beats.length === 0) return scene;
  const allIds = scene.nodes.map((n) => n.id).filter((id): id is string => !!id);
  if (allIds.length === 0) return scene;
  // The LAST beat without an explicit reveal gets it.
  const newBeats = [...scene.beats];
  for (let i = newBeats.length - 1; i >= 0; i--) {
    const b = newBeats[i]!;
    if (!Array.isArray(b.reveal)) {
      newBeats[i] = {...b, reveal: allIds};
      break;
    }
  }
  return {...scene, beats: newBeats};
};

const applyBeatStride = (scene: SceneLike, stride: number): SceneLike => {
  if (!Array.isArray(scene.beats) || scene.beats.length === 0) return scene;
  if (stride < 2) return scene;
  const newBeats: BeatLike[] = [];
  for (const b of scene.beats) {
    const text = typeof b.narration === 'string' ? b.narration : '';
    const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)/g);
    if (!sentences || sentences.length < stride) {
      newBeats.push(b);
      continue;
    }
    // Group into `stride` chunks, evenly.
    const chunkSize = Math.ceil(sentences.length / stride);
    for (let i = 0; i < stride; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, sentences.length);
      if (start >= sentences.length) break;
      const narration = sentences.slice(start, end).join('').trim();
      if (i === 0) {
        // Inherit the original beat's metadata.
        newBeats.push({...b, narration});
      } else {
        newBeats.push({narration});
      }
    }
  }
  return {...scene, beats: newBeats};
};

const expandScene = (scene: SceneLike): SceneLike => {
  if (!Array.isArray(scene.directives) || scene.directives.length === 0) {
    return scene;
  }
  let current = scene;
  let strideN = 0;
  for (const d of scene.directives) {
    if (d === DIRECTIVE_AUTO_ID) {
      current = applyAutoId(current);
      continue;
    }
    if (d === DIRECTIVE_REVEAL_ALL) {
      // Apply after auto-id so generated ids participate.
      current = applyRevealAll(current);
      continue;
    }
    const sm = DIRECTIVE_BEAT_STRIDE_RE.exec(d);
    if (sm) {
      strideN = Number(sm[1]);
      continue;
    }
    // Unknown directive — leave it for the validator to surface, but
    // since the validator doesn't currently know about `directives`,
    // we still strip them at the end so the spec stays clean.
  }
  if (strideN > 1) current = applyBeatStride(current, strideN);
  // Strip the directives array so the validator sees a clean spec.
  const {directives: _strip, ...rest} = current;
  void _strip;
  return rest as SceneLike;
};

export const microsyntaxFeature: FeaturePlugin = {
  kind: 'feature',
  name: '@example/docent-feature-microsyntax',
  version: '0.1.0',

  preprocessSpec(spec: FilmSpec): FilmSpec {
    const scenes = (spec.scenes ?? []) as SceneLike[];
    const newScenes = scenes.map(expandScene);
    return {...spec, scenes: newScenes} as FilmSpec;
  },
};

export default microsyntaxFeature;
