// build-prompt — walk a frame schedule, derive the `ScorePrompt` IR.
//
// The intuition: the schedule already tells us where every scene lands in
// time. The score IR is one re-projection of that timeline through a
// rhetorical lens — frame is the open, tension → big-idea is the boom,
// recap is the resolve.
//
// We DO NOT touch React, Remotion, or `node:fs` here — pure transforms
// from `(spec, schedule)` to `ScorePrompt`. The CLI owns the manifest
// read + schedule construction; this file is a stateless pure function.

import type {
  Engine,
  FilmSpec,
  Scene,
  Beat,
  FrameSchedule,
  SceneSchedule,
  BeatSchedule,
  ScoreCue,
  ScoreCueKind,
  ScorePrompt,
  ScoreTone,
} from '@bjelser/kit';

/** Round seconds to one decimal for readable prompts. */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Map a film's `style.intent.tone` (+ `register` fallback) to the
 * coarser score tone palette. We keep this here — pure derivation —
 * rather than at the engine level so a third-party adapter can compute
 * the same value from a `(spec, engine)` pair without depending on the
 * CLI.
 */
const deriveTone = (spec: FilmSpec): ScoreTone => {
  // `style.intent.tone` wins when set; otherwise `meta.register` biases.
  const intentTone = (spec.style?.intent as {tone?: string} | undefined)
    ?.tone;
  switch (intentTone) {
    case 'executive':
      return 'grave';
    case 'professional':
      return 'cinematic';
    case 'technical':
      return 'calm';
    case 'playful':
      return 'playful';
    case 'neutral':
      // fall through to register
      break;
    default:
      break;
  }
  switch (spec.meta.register) {
    case 'grave':
      return 'grave';
    case 'urgent':
      return 'urgent';
    case 'calm':
      return 'calm';
    case 'playful':
      return 'playful';
    case 'neutral':
    default:
      return 'cinematic';
  }
};

/**
 * The instrument-palette phrase for the opening clause. Keeps the
 * 250-template feel: "deep brass + timpani" for a grave film, "warm
 * strings + piano" for calm. Content-filter safe — no proper nouns, no
 * military, no ALL-CAPS.
 */
const openingClauseFor = (
  tone: ScoreTone,
  durationSeconds: number,
): string => {
  const d = Math.round(durationSeconds);
  switch (tone) {
    case 'grave':
      return (
        `A cinematic orchestral instrumental score, ${d} seconds long. ` +
        `Opens with a deep sustained string chord and a single timpani hit ` +
        `that settles into a low brass underlay.`
      );
    case 'urgent':
      return (
        `A cinematic orchestral score with driving rhythm, ${d} seconds long. ` +
        `Opens with a low pulsing string ostinato and a single timpani hit ` +
        `that establishes the forward momentum.`
      );
    case 'calm':
      return (
        `A gentle orchestral score for warm strings and piano, ${d} seconds long. ` +
        `Opens with a soft sustained string chord beneath a single delicate piano figure.`
      );
    case 'playful':
      return (
        `A light orchestral score with woodwinds and pizzicato strings, ${d} seconds long. ` +
        `Opens with a curious pizzicato motif over soft sustained strings.`
      );
    case 'cinematic':
    default:
      return (
        `A cinematic orchestral instrumental score, ${d} seconds long. ` +
        `Opens with a bold sustained string chord and a soft timpani hit ` +
        `that settles into a low brass underlay.`
      );
  }
};

/**
 * Per-scene action phrase. The verbs come from the /250 trailer-music
 * vocabulary — `layer`, `build`, `enter`, `punctuate`, `pull back`,
 * `resolve`. Every phrase is content-filter safe.
 */
const actionFor = (
  cueKind: ScoreCueKind,
  sceneType: string,
  tone: ScoreTone,
): string => {
  switch (cueKind) {
    case 'open':
      return 'low strings sustain beneath a held brass chord';
    case 'develop':
      // Scene-type aware: a `walkthrough` layers; a `structure` introduces voices.
      if (sceneType === 'structure' || sceneType === 'tree' || sceneType === 'map') {
        return 'french horns enter beneath the strings, voices layering one by one';
      }
      if (sceneType === 'progression' || sceneType === 'timeline') {
        return 'strings slowly layer and build with growing momentum';
      }
      if (sceneType === 'walkthrough' || sceneType === 'mechanism' || sceneType === 'causal-loop') {
        return 'a repeating string figure begins beneath the brass';
      }
      if (sceneType === 'diff') {
        return 'a low string pulse establishes underneath the brass';
      }
      return 'strings layer with gentle forward momentum';
    case 'quantify':
      return 'a single rising string figure marks the measured claim';
    case 'inflect':
      return 'the orchestra pulls back briefly before the next motion';
    case 'pull-back':
      return 'a brief pull-back to quiet sustained strings';
    case 'boom':
      if (tone === 'grave') {
        return (
          'one deep thundering orchestral impact — a single enormous hit ' +
          'with bass and timpani, followed by a powerful sustained chord underneath'
        );
      }
      if (tone === 'calm' || tone === 'playful') {
        return (
          'a single bright orchestral accent — a clear chord with timpani, ' +
          'followed by a sustained warm chord underneath'
        );
      }
      return (
        'one massive thundering orchestral boom — a single enormous impact ' +
        'with deep bass and timpani, followed by a powerful sustained chord underneath'
      );
    case 'resolve':
      return 'the chord resolves with finality and slowly fades to silence';
    case 'sustain':
    default:
      return 'strings sustain beneath the brass';
  }
};

/**
 * The cluster the scene plugin declares, when the scene type is
 * registered. `null` for chrome-only scenes (`frame`, `recap`) and for
 * unknown scene types (which validate has already surfaced as warnings).
 */
const clusterOf = (engine: Engine, sceneType: string): string | null => {
  const plugin = engine.scenes.get(sceneType);
  if (!plugin) return null;
  return (plugin.cluster as string | null) ?? null;
};

/**
 * Decide the boom frame: the rhetorical peak of the film. Heuristic, in
 * priority order:
 *
 *  1. The last frame of the FINAL `tension` scene that is immediately
 *     followed by a `big-idea` or `recap` scene. The boom lands at the
 *     handoff — exactly the inflection the IR is designed to surface.
 *  2. The first frame of the LAST `big-idea` scene, when (1) is absent
 *     but a `big-idea` exists.
 *  3. `null` — the film has no eligible boom moment. We don't fake one.
 *
 * Returning `null` is meaningful: a quiet primer doesn't need a boom,
 * and forcing one would lose the /250 lesson ("the boom must EARN its
 * place"). The smoke test treats `null` as a soft fail — we still emit
 * a prompt, but `--validate` warns.
 */
const findBoomSeconds = (
  scenes: ReadonlyArray<SceneSchedule>,
  fps: number,
): {atSeconds: number; rationale: string} | null => {
  // (1) tension → (big-idea | recap) handoff. Walk in reverse so the
  // LAST such handoff wins — usually right before the resolve.
  for (let i = scenes.length - 2; i >= 0; i--) {
    const a = scenes[i]!;
    const b = scenes[i + 1]!;
    if (a.scene.type === 'tension' && (b.scene.type === 'big-idea' || b.scene.type === 'recap')) {
      // Land the boom at the seam: scene a's endFrame is exclusive,
      // shift by one frame so it lines up with the start of scene b.
      const atFrame = Math.max(0, a.endFrame - 1);
      return {
        atSeconds: round1(atFrame / fps),
        rationale: `tension → ${b.scene.type} handoff — the load-bearing rhetorical seam`,
      };
    }
  }
  // (2) first frame of the LAST big-idea scene.
  for (let i = scenes.length - 1; i >= 0; i--) {
    if (scenes[i]!.scene.type === 'big-idea') {
      return {
        atSeconds: round1(scenes[i]!.startFrame / fps),
        rationale: 'big-idea entry — the commitment moment',
      };
    }
  }
  // (3) 80% of the LAST tension scene's window — the moment the trade-
  //     off is named most sharply. Reach for this when a film ends on a
  //     tension scene (a PR review that closes on "and this is what
  //     could break") and has no resolve scene to seam to.
  for (let i = scenes.length - 1; i >= 0; i--) {
    if (scenes[i]!.scene.type === 'tension') {
      const sc = scenes[i]!;
      const at = sc.startFrame + Math.floor(sc.frames * 0.8);
      return {
        atSeconds: round1(at / fps),
        rationale: 'late-tension peak — the trade-off lands hardest',
      };
    }
  }
  return null;
};

/**
 * Decide the cue kind for a scene. Boom is OVERWRITTEN by the boom
 * heuristic afterward — this function only labels the natural rhetorical
 * role of each scene.
 */
const cueKindFor = (
  scene: Scene,
  sceneIndex: number,
  totalScenes: number,
): ScoreCueKind => {
  const t = scene.type;
  void totalScenes;
  if (sceneIndex === 0 || t === 'frame') return 'open';
  // `recap` is the only true resolve — a film that ends on `tension`
  // (a PR review closing on "what could break") keeps that scene's
  // `inflect` label so the boom-prep cue can land within it.
  if (t === 'recap') return 'resolve';
  if (t === 'tension') return 'inflect';
  if (t === 'big-idea') return 'inflect';
  if (t === 'quantities' || t === 'chart') return 'quantify';
  return 'develop';
};

/**
 * Build the IR from a constructed engine + the schedule the engine
 * produced. Pure function — no fs, no logs, no provider knowledge.
 *
 * @param engine   — required so we can read each ScenePlugin's cluster.
 * @param spec     — for `meta.title`, `style.intent.tone`, `register`.
 * @param schedule — the resolved frame schedule (real timing when a TTS
 *                   manifest is present; estimator-driven when it isn't).
 */
export const buildScorePrompt = (
  engine: Engine,
  spec: FilmSpec,
  schedule: FrameSchedule,
): ScorePrompt => {
  const tone = deriveTone(spec);
  const fps = schedule.fps;
  const durationSeconds = round1(schedule.totalFrames / fps);

  // Cues — one per scene, plus a head-of-film "open" if the first scene
  // isn't already a `frame`.
  const cues: ScoreCue[] = [];
  const clusterPath: string[] = [];
  const totalScenes = schedule.scenes.length;

  schedule.scenes.forEach((sc, i) => {
    const cluster = clusterOf(engine, sc.scene.type);
    const kind = cueKindFor(sc.scene, i, totalScenes);
    const atSeconds = round1(sc.startFrame / fps);
    const action = actionFor(kind, sc.scene.type, tone);
    const rationale = rationaleFor(sc.scene, kind, cluster);
    cues.push({
      atSeconds,
      kind,
      sceneIndex: i,
      sceneType: sc.scene.type,
      cluster,
      action,
      rationale,
    });
    if (cluster && (clusterPath.length === 0 || clusterPath[clusterPath.length - 1] !== cluster)) {
      clusterPath.push(cluster);
    }
  });

  // Boom alignment. Replace whichever cue is closest to the boom moment
  // with a `boom` cue, and insert a `pull-back` cue ~4 s before it. The
  // /250 template earned its boom with a deliberate pull-back; the IR
  // honours the same pattern.
  const boom = findBoomSeconds(schedule.scenes, fps);
  if (boom) {
    // Insert a `pull-back` 4 s before the boom (or 25% of the way back
    // toward the previous cue, whichever is later — never go negative).
    const pullBackTarget = Math.max(0, boom.atSeconds - 4);
    cues.push({
      atSeconds: round1(pullBackTarget),
      kind: 'pull-back',
      sceneIndex: -1,
      sceneType: 'boom-prep',
      cluster: null,
      action: actionFor('pull-back', '', tone),
      rationale: 'set up the boom with a brief drop — the breath before the impact',
    });
    cues.push({
      atSeconds: boom.atSeconds,
      kind: 'boom',
      sceneIndex: -1,
      sceneType: 'boom',
      cluster: null,
      action: actionFor('boom', '', tone),
      rationale: boom.rationale,
    });
  }

  // Sort by atSeconds ascending so dialects can iterate in time order.
  cues.sort((a, b) => a.atSeconds - b.atSeconds);

  // The boom-prep insertion can collide with a scene cue that lands at
  // the SEAM of the same handoff (tension's `inflect` and the boom are
  // ~half-second apart when the boom heuristic chooses the seam). Drop
  // any non-boom cue within 1.5 s of the boom to keep the timeline
  // legible — the boom subsumes whichever cue it lands on.
  const dedupedCues = boom
    ? cues.filter(
        (c) =>
          c.kind === 'boom' ||
          c.kind === 'pull-back' ||
          Math.abs(c.atSeconds - boom.atSeconds) > 1.5,
      )
    : cues;

  return {
    filmId: spec.meta.id,
    title: spec.meta.title,
    durationSeconds,
    fps,
    tone,
    cues: dedupedCues,
    clusterPath,
    boomAtSeconds: boom ? boom.atSeconds : null,
  };
};

/**
 * One-line WHY for the cue — kept short so adapters can inline it as a
 * comment. Mostly for human review.
 */
const rationaleFor = (
  scene: Scene,
  kind: ScoreCueKind,
  cluster: string | null,
): string => {
  if (kind === 'open') return 'film opens; establish tone';
  if (kind === 'resolve') return 'film resolves; fade';
  if (kind === 'inflect' && scene.type === 'tension') {
    return 'tension scene — name the trade-off';
  }
  if (kind === 'inflect' && scene.type === 'big-idea') {
    return 'big-idea scene — the commitment';
  }
  if (kind === 'quantify') return 'measured claim arrives on screen';
  if (kind === 'develop' && cluster) {
    return `${scene.type} (${cluster}) — build through the move`;
  }
  return `${scene.type} — develop`;
};

/**
 * Quick utility for adapters and the CLI: total of all narration words
 * across the film. Used by Suno's `prompt` length budget.
 */
export const wordsInFilm = (spec: FilmSpec): number => {
  let n = 0;
  for (const sc of spec.scenes) {
    const beats: ReadonlyArray<Beat> = Array.isArray(sc.beats) ? sc.beats : [];
    for (const b of beats) {
      const t = (b.narration ?? '').trim();
      if (t.length > 0) n += t.split(/\s+/).length;
    }
  }
  return n;
};
