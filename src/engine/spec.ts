// The film spec — a declarative, subject-agnostic description of an
// architecture film. Any repository, surveyed against any prompt, is expressed
// as one of these JSON files under films/. The engine renders it; it knows
// nothing about Codex (or any particular codebase) specifically.

import codex from '../../films/codex.json';
import rig from '../../films/rig.json';
import nono from '../../films/nono.json';
import vector from '../../films/vector.json';
import bun from '../../films/bun.json';
import kubernetes from '../../films/kubernetes.json';
import rigPr from '../../films/rig-pr.json';
import nonoPr from '../../films/nono-pr.json';
import vectorPr from '../../films/vector-pr.json';
import bunPr from '../../films/bun-pr.json';
import kubernetesPr from '../../films/kubernetes-pr.json';
import manifestJson from '../../public/audio/manifest.json';

export type Message = {
  from: string;
  to: string;
  label: string;
  kind?: 'call' | 'return' | 'async' | 'error';
};

export type Beat = {
  id: string;
  narration: string;
  // diagram directives
  reveal?: string[] | number;
  focus?: string[];
  pulse?: [string, string][];
  // title directive
  show?: string;
  // code directive — [firstLine, lastLine], 1-indexed
  highlight?: [number, number];
  note?: string;
  // sequence directive
  message?: Message;
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
  emphasis?: boolean;
  wide?: boolean;
  // sketch scenes: a node can be a flagged risk or a rejected alternative
  kind?: 'risk' | 'rejected';
};

export type Edge = {
  id: string;
  from: string;
  to: string;
  kind?: 'flow' | 'escalate';
  label?: string;
};

export type Scene = {
  id: string;
  type: 'title' | 'diagram' | 'sequence' | 'code' | 'diff' | 'sketch' | 'recap';
  accent: string;
  kicker: string;
  heading?: string;
  // title
  title?: string;
  tagline?: string;
  footnote?: string;
  // diagram
  grid?: {cols: number; rows: number};
  nodes?: Node[];
  edges?: Edge[];
  // sequence
  actors?: Actor[];
  // code
  file?: string;
  lang?: string;
  code?: string;
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
  };
  scenes: Scene[];
};

// Film registry. A new film is one JSON file plus one line here.
export const FILMS: Record<string, FilmSpec> = {
  codex: codex as FilmSpec,
  rig: rig as FilmSpec,
  nono: nono as FilmSpec,
  vector: vector as FilmSpec,
  bun: bun as FilmSpec,
  kubernetes: kubernetes as FilmSpec,
  'rig-pr': rigPr as FilmSpec,
  'nono-pr': nonoPr as FilmSpec,
  'vector-pr': vectorPr as FilmSpec,
  'bun-pr': bunPr as FilmSpec,
  'kubernetes-pr': kubernetesPr as FilmSpec,
};

const manifest = manifestJson as Record<string, {file: string; seconds: number}>;

export const LEAD = 0.15; // seconds of quiet before a scene's first beat
export const TAIL = 0.55; // seconds of breath after each beat
export const TRANSITION = 16; // frames of cross-fade between scenes

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
      const durationInFrames = Math.round((seconds + TAIL) * fps);
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
