// The film spec — a declarative, subject-agnostic description of an
// architecture film. Any repository, surveyed against any prompt, is expressed
// as one of these JSON files under films/. The engine renders it; it knows
// nothing about Codex (or any particular codebase) specifically.

import {interpolate, spring} from 'remotion';
import manifestJson from '../../../../public/audio/manifest.json';

export type Message = {
  from: string;
  to: string;
  label: string;
  kind?: 'forward' | 'reply' | 'aside';
};

// A tween — a beat that *changes* a named value rather than just revealing it.
// `to` is the target the beat drives toward; the engine eases from whatever the
// previous set-beat held (or `from`, or 0) across the beat boundary. `ease`
// picks the easing curve. This mirrors how `resolveCamera` eases the camera
// from the prior beat's shot to the current one.
export type Tween = {
  to: number;
  from?: number;
  ease?: 'linear' | 'spring' | 'accelerate' | 'settle';
};

// A morph directive — re-binds an existing node to a new definition. The
// engine eases old→new across the beat that carries the transform: the
// bounding box tweens continuously, the representations cross-fade. This is
// cross-beat object identity — a node can *become* something else, the same
// `id` carrying a redefined geometry and content. `into` is a partial Node:
// only the fields it names change; everything else is inherited from the
// node's prior definition.
export type Transform = {
  node: string; // the id of an existing node, redefined by this beat
  into: Partial<Node>;
};

export type Beat = {
  id: string;
  narration: string;
  // structure directives
  reveal?: string[] | number;
  focus?: string[];
  pulse?: [string, string][];
  // morph directive — re-bind named nodes to new definitions; the engine
  // morphs old→new across this beat. The deepest primitive: object identity.
  transform?: Transform[];
  // frame directive
  show?: string;
  // closeup directive — [firstLine, lastLine], 1-indexed
  highlight?: [number, number];
  note?: string;
  // walkthrough directive
  message?: Message;
  // intent knobs — how the beat should feel; the engine interprets these.
  pace?: 'hold' | 'settle' | 'normal' | 'brisk'; // breath held after the narration
  cadence?: 'cascade' | 'together' | 'snap'; // rhythm of revealed items entering
  shot?: 'wide' | 'follow' | 'push' | 'hold'; // the camera verb for this beat
  // tween directive — the named values this beat drives. A bare number is a
  // jump-to-target; a Tween eases from the value the prior set-beat held.
  set?: Record<string, number | Tween>;
};

export type Actor = {id: string; label: string; sub?: string};

// A node's *representation* — how its content is drawn inside its box. The
// default, `box`, is today's Card (a labelled component card). `matrix` /
// `vector` / `grid` draw `cells` as a grid of mono cells; `code` draws a
// small code window; `equation` typesets a mathematical expression. A node
// keeps the same `id` and box geometry across representations — a morph swaps
// the representation, not the identity. Because morph eases one definition
// into the next, an `equation` node morphing to another *is* a derivation
// step: the algebra rewrites itself on screen.
export type NodeRepr = 'box' | 'matrix' | 'vector' | 'grid' | 'code' | 'equation';

export type Node = {
  id: string;
  label: string;
  sub?: string;
  tag?: string;
  col: number;
  row: number;
  accent?: string;
  emphasis?: boolean; // legacy — superseded by `weight: 'hero'`
  weight?: 'hero' | 'primary' | 'normal' | 'recede'; // the emphasis gradient
  wide?: boolean;
  // tension scenes: a node can be a flagged risk or a rejected alternative
  kind?: 'risk' | 'rejected';
  // morph — the node's representation. `box` (default) is the Card; the
  // others draw `code` / `cells` / `expr` instead. A `transform` beat can
  // swap this.
  as?: NodeRepr;
  cells?: (string | number)[][]; // matrix/vector/grid contents, row-major
  // `as: 'equation'` content — the mathematical markup the engine typesets.
  // Intent-level and closed: the author writes the expression, the engine
  // owns the layout. This is NOT an expression evaluator — `expr` is never
  // computed, only set. Morphing one equation node into another (different
  // `expr`) yields a derivation step: the algebra rewrites on screen.
  expr?: string;
};

// An edge between two nodes. `kind` types the *relationship the line asserts*:
//  - `relation` (default) — a plain association: A is connected to B.
//  - `feedback` — a returning loop: B's output flows back to A.
//  - `entails`  — a logical step: A *therefore* B. A proof / derivation edge.
//  - `causes`   — a causal claim: A *brought about* B. With `strength`, the
//                 engine draws the *weight* of the cause, not just succession.
// `strength` qualifies a `causes` edge: a `necessary` cause is drawn visibly
// heavier than a `contributing` one — necessity reads off the line itself.
export type Edge = {
  id: string;
  from: string;
  to: string;
  kind?: 'relation' | 'feedback' | 'entails' | 'causes';
  strength?: 'necessary' | 'contributing';
  label?: string;
};

// progression scenes — an ordered track of stages along a path or over time.
// In a `braided` flow a stage's `track` (0 or 1) picks which of the two
// parallel lanes it sits on — e.g. lane 0 = plot-order, lane 1 = story-order.
// `track` is ignored by `linear`/`cycle`/`iterate`, so it is purely additive.
export type Stage = {
  id: string;
  label: string;
  sub?: string;
  duration?: string; // e.g. "4 years" — shown on the stage's segment
  gate?: boolean; // a milestone / exam sitting between this stage and the next
  track?: 0 | 1; // braided flow — which of the two parallel lanes
};

// compare scenes — options (columns) judged against criteria (rows).
export type CompareColumn = {id: string; label: string; sub?: string};
export type CompareCell = {text: string; verdict?: 'win' | 'lose' | 'neutral'};
export type CompareRow = {id: string; label: string; cells: CompareCell[]};

// quantities scenes — magnitudes as figures, or a worked numeric grid.
export type Figure = {id: string; label: string; value: string; unit?: string; note?: string};
export type Matrix = {rowLabels: string[]; colLabels: string[]; cells: string[][]};

// A metric — a node-like figure card whose displayed number IS a tweened
// value. `bind` names a value driven by beats' `set` directives; the engine
// projects it at the current frame. `col`/`row` place it on a grid.
export type Metric = {
  id: string;
  label: string;
  col: number;
  row: number;
  bind: string; // the `set` key this metric's number reads from
  format?: 'int' | 'float1' | 'percent';
  unit?: string;
  accent?: string;
};

// probe scenes — vary one input from a baseline, follow the consequence.
export type Variation = {
  id: string;
  label: string;
  change: string; // the input that is perturbed
  outcome: string; // the resulting outcome
  flips?: boolean; // whether the outcome flipped from the baseline
};

// passage scenes — annotate a plain-text artifact (a poem, prose, a primary
// source). The annotation unit is a *span*: a `quote` is the exact substring
// to locate in the text; the engine underlines/highlights it and pins `note`
// beside it. A beat activates marks through the existing reveal/focus model —
// `reveal` brings a mark in, `focus` narrows attention to a subset. Several
// marks can be live at once. The author writes *what to mark*, never pixels.
export type Mark = {
  id: string;
  quote: string; // exact substring of Scene.text to highlight
  note: string; // the short annotation pinned to the span
};

// figure scenes — annotate a still image (a painting, a map, a photograph, an
// experimental stimulus). A callout pins a labelled marker to a region of the
// image. `at` is a normalized 0..1 (x, y) position over the image. A beat
// reveals/focuses callout ids — same model as passage `marks` and structure
// `nodes`. The author pins regions; the engine owns the pixels.
export type Callout = {
  id: string;
  at: [number, number]; // normalized [x, y], each in 0..1
  label: string;
  note?: string;
};

// chart scenes — a plotted coordinate graph. An axis is a labelled domain:
// the engine maps [min, max] onto STAGE pixels (the analogue of `cellCenter`).
export type Axis = {
  label: string;
  min: number;
  max: number;
  ticks?: number; // how many tick marks to draw along the axis
};

// The closed allowlist of named functions a `line` series may plot. This is
// intent-level, not an expression evaluator: an author names a shape, the
// engine owns the math. Anything outside this list is rejected by validate.ts.
export type ChartFn =
  | 'linear'
  | 'x^2'
  | 'sqrt'
  | 'sin'
  | 'exp'
  | 'log'
  | 'reciprocal';

// One plotted series on a chart. `kind` picks the geometry:
//  - `line`  — a curve, either a named `fn` from the allowlist or explicit
//              `points`; drawn on with evolvePath across its reveal beat.
//  - `bars`  — a bar per datum; each bar's height is a tweened value that
//              grows 0 → datum on the bar's reveal beat.
//  - `point` — a marker that rides a curve: its x is a `set` key named by
//              `bind`, its y is read off the series named by `along`.
export type Series = {
  id: string;
  kind: 'line' | 'bars' | 'point';
  accent?: string;
  // line
  fn?: ChartFn;
  points?: [number, number][];
  // bars
  data?: {label: string; value: number}[];
  // point
  bind?: string; // a `set` key giving the marker's x
  along?: string; // the line series id whose curve gives the marker's y
};

export type Scene = {
  id: string;
  type:
    | 'frame'
    | 'structure'
    | 'progression'
    | 'walkthrough'
    | 'compare'
    | 'quantities'
    | 'probe'
    | 'tension'
    | 'closeup'
    | 'passage'
    | 'figure'
    | 'demonstrate'
    | 'recap'
    | 'diff'
    | 'chart';
  accent: string;
  kicker: string;
  heading?: string;
  // intent knobs — scene-level; the engine interprets these.
  cut?: 'dissolve' | 'hold' | 'continue'; // transition feeling into the next scene
  palette?: 'cool' | 'warm' | 'signal' | 'mono'; // accent family / mood
  treatment?: 'crisp' | 'sketch' | 'whiteboard'; // visual skin, decoupled from scene type
  // frame
  title?: string;
  tagline?: string;
  footnote?: string;
  // structure
  grid?: {cols: number; rows: number};
  nodes?: Node[];
  edges?: Edge[];
  // progression — `flow` picks the track topology:
  //  - `linear`  (default) — stages laid left-to-right along one path.
  //  - `cycle`   — the track curves back to its start; a loop.
  //  - `braided` — two parallel tracks running together (e.g. story-order
  //                vs plot-order, for non-linear narrative).
  //  - `iterate` — a cycle drawn so it visibly *repeats and converges*: a
  //                feedback process settling toward equilibrium.
  stages?: Stage[];
  flow?: 'linear' | 'cycle' | 'braided' | 'iterate';
  // walkthrough
  actors?: Actor[];
  // compare
  columns?: CompareColumn[];
  rows?: CompareRow[];
  // quantities
  figures?: Figure[];
  matrix?: Matrix;
  metrics?: Metric[];
  // probe
  baseline?: {label: string; outcome: string};
  variations?: Variation[];
  // chart
  xAxis?: Axis;
  yAxis?: Axis;
  series?: Series[];
  // closeup
  file?: string;
  lang?: string;
  code?: string;
  // passage — a plain-text artifact and the spans to mark on it. `text` is
  // typeset as prose/verse in a serif face (line breaks preserved); `marks`
  // are the annotatable spans, activated by beats' reveal/focus.
  text?: string;
  marks?: Mark[];
  // figure — a still image and the regions to call out. `image` is resolved
  // via Remotion staticFile (e.g. under public/figures/); `callouts` pin
  // labelled markers, activated by beats' reveal/focus.
  image?: string;
  callouts?: Callout[];
  // demonstrate
  clip?: string;
  // recap
  points?: string[];
  beats: Beat[];
};

export type FilmSpec = {
  meta: {
    id: string;
    title: string;
    subject: string;
    repo: string;
    prompt: string;
    fps: number;
    width: number;
    height: number;
    voice: string;
    register?: 'grave' | 'neutral' | 'calm' | 'urgent' | 'playful'; // film mood
  };
  scenes: Scene[];
};

// Film registry. Auto-discovered: a new film is just one JSON file under
// films/ — re-run `bun cli/gen-registry.ts` and films.generated.ts catches up.
// Re-exported here so other modules keep importing FILMS from './spec'.
export {FILMS} from './films.generated';

const manifest = manifestJson as Record<string, {file: string; seconds: number}>;

export const LEAD = 0.15; // seconds of quiet before a scene's first beat
export const TAIL = 0.55; // seconds of breath after each beat
export const TRANSITION = 16; // frames of cross-fade between scenes

// `pace` (a beat intent knob) scales the breath held after the narration —
// `hold` lets a verdict land, `brisk` rushes an enumeration. The default,
// `normal`, reproduces the original fixed TAIL exactly.
const PACE: Record<NonNullable<Beat['pace']>, number> = {
  hold: 3,
  settle: 1.8,
  normal: 1,
  brisk: 0.35,
};

// `cut` (a scene knob) sets how a scene boundary feels — the transition into
// the next scene. `hold` is a longer settle, `continue` a quick fade.
export const cutFrames = (cut?: Scene['cut']): number =>
  cut === 'hold' ? 28 : cut === 'continue' ? 8 : TRANSITION;

// `register` (a film knob) sets the overall mood — and with it the *default*
// pace and cut. Any per-beat or per-scene knob still overrides these.
type RegisterDefaults = {pace: NonNullable<Beat['pace']>; cut: NonNullable<Scene['cut']>};
export const registerDefaults = (
  register?: FilmSpec['meta']['register'],
): RegisterDefaults => {
  switch (register) {
    case 'grave':
    case 'calm':
      return {pace: 'settle', cut: 'hold'};
    case 'urgent':
      return {pace: 'brisk', cut: 'continue'};
    case 'playful':
      return {pace: 'normal', cut: 'continue'};
    default:
      return {pace: 'normal', cut: 'dissolve'};
  }
};

// Words-per-second fallback so the film has sane timing before TTS has run
// (keeps `remotion studio` usable on a fresh checkout).
const estimateSeconds = (text: string): number =>
  Math.max(2.6, text.trim().split(/\s+/).length / 2.6);

export type TimedBeat = Beat & {
  index: number;
  audio: string | null;
  seconds: number;
  durationInFrames: number;
  from: number; // frames, relative to the scene
};

export type TimedScene = {
  scene: Scene;
  index: number;
  beats: TimedBeat[];
  durationInFrames: number;
};

export type Timeline = {
  film: FilmSpec;
  scenes: TimedScene[];
  total: number;
  fps: number;
  width: number;
  height: number;
};

export const buildTimeline = (film: FilmSpec): Timeline => {
  const fps = film.meta.fps;
  const lead = Math.round(LEAD * fps);
  const reg = registerDefaults(film.meta.register);

  const scenes: TimedScene[] = film.scenes.map((scene, index) => {
    let cursor = lead;
    const beats: TimedBeat[] = scene.beats.map((b, i) => {
      const m = manifest[`${film.meta.id}/${b.id}`];
      const seconds = m ? m.seconds : estimateSeconds(b.narration);
      const durationInFrames = Math.round((seconds + TAIL * PACE[b.pace ?? reg.pace]) * fps);
      const tb: TimedBeat = {
        ...b,
        index: i,
        audio: m ? m.file : null,
        seconds,
        durationInFrames,
        from: cursor,
      };
      cursor += durationInFrames;
      return tb;
    });
    return {scene, index, beats, durationInFrames: cursor};
  });

  // Each scene's `cut` sets the transition into the next; subtract each real
  // transition's overlap (not a flat TRANSITION) so the film length is exact.
  const transitionTotal = scenes
    .slice(0, -1)
    .reduce((a, s) => a + cutFrames(s.scene.cut ?? reg.cut), 0);
  const total =
    scenes.reduce((a, s) => a + s.durationInFrames, 0) - transitionTotal;

  return {film, scenes, total, fps, width: film.meta.width, height: film.meta.height};
};

// Which beat is on screen at a given (scene-relative) frame.
export const activeBeatIndex = (beats: TimedBeat[], frame: number): number => {
  for (let i = beats.length - 1; i >= 0; i--) {
    if (frame >= beats[i].from) return i;
  }
  return 0;
};

// Normalise a `set` entry — a bare number is a jump (it eases from the prior
// held value with the default spring; a number alone has no `from`/`ease`).
const asTween = (v: number | Tween): Tween =>
  typeof v === 'number' ? {to: v} : v;

// The eased progress 0..1 for a tween, given local frame within the beat.
// Mirrors `resolveCamera`: `spring` is the default settle; `linear` is flat;
// `accelerate` eases in (slow-then-fast); `settle` eases out hard. A tween
// completes within the beat's own duration, so the value rests before the
// next beat begins.
const easeProgress = (
  ease: NonNullable<Tween['ease']>,
  local: number,
  duration: number,
  fps: number,
): number => {
  if (local <= 0) return 0;
  if (local >= duration) return 1;
  switch (ease) {
    case 'linear':
      return local / duration;
    case 'accelerate':
      return interpolate(local / duration, [0, 1], [0, 1], {
        easing: (t) => t * t,
      });
    case 'settle':
      return spring({frame: local, fps, config: {damping: 200, mass: 1.4}});
    case 'spring':
    default:
      return spring({frame: local, fps, config: {damping: 200, mass: 1.1}});
  }
};

// The resolved value of a named tweened key at a given (scene-relative) frame.
// A pure read over TimedBeat[] — like `activeBeatIndex`, deterministic, with no
// state. Finds the most recent beat at or before `frame` whose `set` includes
// `key`, then eases from the value the prior set-beat held (or this tween's
// `from`, or 0) toward the target. If `frame` precedes the first set-beat the
// value is its `from`/0; if no beat ever sets the key the value is 0.
export const tweenValue = (
  beats: TimedBeat[],
  key: string,
  frame: number,
  fps: number,
): number => {
  // The beats that drive this key, in timeline order.
  const setBeats = beats.filter(
    (b): b is TimedBeat & {set: Record<string, number | Tween>} =>
      Boolean(b.set) && key in (b.set as object),
  );
  if (setBeats.length === 0) return 0;

  // The most recent set-beat at or before `frame`.
  let active = -1;
  for (let i = setBeats.length - 1; i >= 0; i--) {
    if (frame >= setBeats[i].from) {
      active = i;
      break;
    }
  }
  // Before the first set-beat — rest at that beat's start value.
  if (active < 0) {
    const first = asTween(setBeats[0].set[key]);
    return first.from ?? 0;
  }

  const tw = asTween(setBeats[active].set[key]);
  // The value the timeline held entering this beat: the previous set-beat's
  // target, else this tween's explicit `from`, else 0.
  const start =
    active > 0
      ? asTween(setBeats[active - 1].set[key]).to
      : tw.from ?? 0;

  const local = frame - setBeats[active].from;
  const p = easeProgress(
    tw.ease ?? 'spring',
    local,
    setBeats[active].durationInFrames,
    fps,
  );
  return interpolate(p, [0, 1], [start, tw.to]);
};

// ----- morph — cross-beat object identity -------------------------------
// A node's definition can be *redefined* by a later beat's `transform`. This
// resolves, at a given frame, which definition a node is in and how far it
// has eased between the bracketing pair — the morph analogue of `tweenValue`.
// It is a pure read over TimedBeat[]: deterministic, no state.

// One state on a node's definition timeline — the (frame, definition) pair
// the node holds from `fromFrame` until the next state begins.
export type MorphState = {fromFrame: number; node: Node};

// The ordered definition timeline for one node: its base definition (from
// frame 0), then each `transform.into` merged onto the prior definition, in
// timeline order. A node with no transform has a single-state timeline.
export const morphTimeline = (
  base: Node,
  beats: TimedBeat[],
): MorphState[] => {
  const states: MorphState[] = [{fromFrame: 0, node: base}];
  for (const b of beats) {
    const t = b.transform?.find((tr) => tr.node === base.id);
    if (!t) continue;
    const prev = states[states.length - 1].node;
    // `into` is a partial Node — only named fields change; the id is fixed.
    states.push({fromFrame: b.from, node: {...prev, ...t.into, id: base.id}});
  }
  return states;
};

// At `frame`, the bracketing (from, to) definitions and the eased progress
// `p` between them. Before/at the last transition's start `p` climbs 0→1
// across that transition beat's own duration, then rests. A node with a
// single-state timeline is always {from: base, to: base, p: 1} — no morph.
export const resolveMorph = (
  states: MorphState[],
  beats: TimedBeat[],
  frame: number,
  fps: number,
): {from: Node; to: Node; p: number} => {
  if (states.length === 1) {
    return {from: states[0].node, to: states[0].node, p: 1};
  }
  // The most recent state at or before `frame`.
  let active = 0;
  for (let i = states.length - 1; i >= 0; i--) {
    if (frame >= states[i].fromFrame) {
      active = i;
      break;
    }
  }
  if (active === 0) {
    return {from: states[0].node, to: states[0].node, p: 1};
  }
  const fromDef = states[active - 1].node;
  const toDef = states[active].node;
  // The transition beat owns the morph — `p` eases across its duration, then
  // rests at 1 (the same ease-across-beat shape as `resolveCamera`).
  const tBeat = beats.find((b) => b.from === states[active].fromFrame);
  const dur = tBeat?.durationInFrames ?? 1;
  const local = frame - states[active].fromFrame;
  const p =
    local <= 0
      ? 0
      : local >= dur
        ? 1
        : spring({frame: local, fps, config: {damping: 200, mass: 1.1}});
  return {from: fromDef, to: toDef, p};
};

// Whether any beat in this scene transforms any node — the fast-path guard.
// When false, StructureScene takes the existing unchanged code path.
export const hasTransform = (beats: TimedBeat[]): boolean =>
  beats.some((b) => Array.isArray(b.transform) && b.transform.length > 0);

export type FilmMeta = FilmSpec['meta'];

// Every scene template receives exactly this — including the film's meta, so a
// scene can reference the subject without anything being hard-coded.
export type SceneProps = {
  ts: TimedScene;
  sceneIndex: number;
  sceneCount: number;
  meta: FilmMeta;
};
