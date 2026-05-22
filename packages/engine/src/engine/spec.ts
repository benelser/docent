// The film spec — a declarative, subject-agnostic description of an
// architecture film. Any repository, surveyed against any prompt, is expressed
// as one of these JSON files under films/. The engine renders it; it knows
// nothing about Codex (or any particular codebase) specifically.

import manifestJson from '../../../../public/audio/manifest.json';

export type Message = {
  from: string;
  to: string;
  label: string;
  kind?: 'forward' | 'reply' | 'aside';
};

export type Beat = {
  id: string;
  narration: string;
  // structure directives
  reveal?: string[] | number;
  focus?: string[];
  pulse?: [string, string][];
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
};

export type Actor = {id: string; label: string; sub?: string};

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
};

export type Edge = {
  id: string;
  from: string;
  to: string;
  kind?: 'relation' | 'feedback';
  label?: string;
};

// progression scenes — an ordered track of stages along a path or over time.
export type Stage = {
  id: string;
  label: string;
  sub?: string;
  duration?: string; // e.g. "4 years" — shown on the stage's segment
  gate?: boolean; // a milestone / exam sitting between this stage and the next
};

// compare scenes — options (columns) judged against criteria (rows).
export type CompareColumn = {id: string; label: string; sub?: string};
export type CompareCell = {text: string; verdict?: 'win' | 'lose' | 'neutral'};
export type CompareRow = {id: string; label: string; cells: CompareCell[]};

// quantities scenes — magnitudes as figures, or a worked numeric grid.
export type Figure = {id: string; label: string; value: string; unit?: string; note?: string};
export type Matrix = {rowLabels: string[]; colLabels: string[]; cells: string[][]};

// probe scenes — vary one input from a baseline, follow the consequence.
export type Variation = {
  id: string;
  label: string;
  change: string; // the input that is perturbed
  outcome: string; // the resulting outcome
  flips?: boolean; // whether the outcome flipped from the baseline
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
    | 'demonstrate'
    | 'recap'
    | 'diff';
  accent: string;
  kicker: string;
  heading?: string;
  // intent knobs — scene-level; the engine interprets these.
  cut?: 'dissolve' | 'hold' | 'continue'; // transition feeling into the next scene
  palette?: 'cool' | 'warm' | 'signal' | 'mono'; // accent family / mood
  treatment?: 'crisp' | 'sketch'; // visual skin, decoupled from scene type
  // frame
  title?: string;
  tagline?: string;
  footnote?: string;
  // structure
  grid?: {cols: number; rows: number};
  nodes?: Node[];
  edges?: Edge[];
  // progression
  stages?: Stage[];
  flow?: 'linear' | 'cycle';
  // walkthrough
  actors?: Actor[];
  // compare
  columns?: CompareColumn[];
  rows?: CompareRow[];
  // quantities
  figures?: Figure[];
  matrix?: Matrix;
  // probe
  baseline?: {label: string; outcome: string};
  variations?: Variation[];
  // closeup
  file?: string;
  lang?: string;
  code?: string;
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

  const scenes: TimedScene[] = film.scenes.map((scene, index) => {
    let cursor = lead;
    const beats: TimedBeat[] = scene.beats.map((b, i) => {
      const m = manifest[`${film.meta.id}/${b.id}`];
      const seconds = m ? m.seconds : estimateSeconds(b.narration);
      const durationInFrames = Math.round((seconds + TAIL * PACE[b.pace ?? 'normal']) * fps);
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

  const total =
    scenes.reduce((a, s) => a + s.durationInFrames, 0) -
    TRANSITION * Math.max(0, scenes.length - 1);

  return {film, scenes, total, fps, width: film.meta.width, height: film.meta.height};
};

// Which beat is on screen at a given (scene-relative) frame.
export const activeBeatIndex = (beats: TimedBeat[], frame: number): number => {
  for (let i = beats.length - 1; i >= 0; i--) {
    if (frame >= beats[i].from) return i;
  }
  return 0;
};

export type FilmMeta = FilmSpec['meta'];

// Every scene template receives exactly this — including the film's meta, so a
// scene can reference the subject without anything being hard-coded.
export type SceneProps = {
  ts: TimedScene;
  sceneIndex: number;
  sceneCount: number;
  meta: FilmMeta;
};
