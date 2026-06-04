// aiva — JSON envelope with mood / key / tempo / genre.
//
// AIVA's REST surface accepts a `tracks` POST with a small typed bag:
// { genre, moods[], duration, key, tempo, timeSignature }. We translate
// the IR's `tone` + `cluster` walk into that bag; the prose prompt is
// preserved as a free-form `description` so a future iteration can A/B
// it.
//
// Reference (public AIVA docs): the REST endpoint takes the bag as JSON.
// We're not calling it — just emitting a body the user can curl.

import type {RenderedScorePrompt, ScorePrompt, ScoreTone} from '@bjelser/kit';
import {renderTemplate} from './template';

interface AivaPayload {
  readonly genre: string;
  readonly moods: ReadonlyArray<string>;
  readonly key: string;
  readonly tempo: number;
  readonly timeSignature: string;
  readonly duration: number;
  readonly instruments: ReadonlyArray<string>;
  readonly forbid: ReadonlyArray<string>;
  readonly description: string;
  readonly sections: ReadonlyArray<{
    readonly atSeconds: number;
    readonly label: string;
    readonly action: string;
  }>;
}

const moodsForTone = (tone: ScoreTone): ReadonlyArray<string> => {
  switch (tone) {
    case 'grave':
      return ['solemn', 'reflective', 'weighty'];
    case 'urgent':
      return ['tense', 'driving', 'building'];
    case 'calm':
      return ['contemplative', 'gentle', 'warm'];
    case 'playful':
      return ['curious', 'light', 'bright'];
    case 'cinematic':
    default:
      return ['epic', 'inspiring', 'cinematic'];
  }
};

const keyForTone = (tone: ScoreTone): string => {
  // AIVA exposes a key field; pair tone to a defensible default. The
  // music-gen API treats this as a strong hint, not a constraint.
  switch (tone) {
    case 'grave':
      return 'D minor';
    case 'urgent':
      return 'C minor';
    case 'calm':
      return 'F major';
    case 'playful':
      return 'G major';
    case 'cinematic':
    default:
      return 'A minor';
  }
};

const tempoForTone = (tone: ScoreTone): number => {
  switch (tone) {
    case 'grave':
      return 64;
    case 'urgent':
      return 124;
    case 'calm':
      return 72;
    case 'playful':
      return 110;
    case 'cinematic':
    default:
      return 90;
  }
};

const instrumentsForTone = (tone: ScoreTone): ReadonlyArray<string> => {
  switch (tone) {
    case 'grave':
      return ['low strings', 'french horns', 'timpani', 'piano'];
    case 'urgent':
      return ['strings', 'brass', 'timpani', 'percussion'];
    case 'calm':
      return ['piano', 'warm strings', 'woodwinds'];
    case 'playful':
      return ['pizzicato strings', 'woodwinds', 'marimba'];
    case 'cinematic':
    default:
      return ['full strings', 'brass', 'timpani', 'piano'];
  }
};

const labelForCue = (kind: ScorePrompt['cues'][number]['kind']): string => {
  switch (kind) {
    case 'open':
      return 'intro';
    case 'develop':
      return 'develop';
    case 'quantify':
      return 'accent';
    case 'inflect':
      return 'turn';
    case 'pull-back':
      return 'pull-back';
    case 'boom':
      return 'peak';
    case 'resolve':
      return 'resolve';
    case 'sustain':
    default:
      return 'sustain';
  }
};

/**
 * Render the IR as an AIVA-shaped JSON envelope. The prose description
 * is left readable so a human reviewer can sanity-check before posting.
 */
export const renderAiva = (prompt: ScorePrompt): RenderedScorePrompt => {
  const description = renderTemplate(prompt).body;
  const payload: AivaPayload = {
    genre: 'cinematic',
    moods: moodsForTone(prompt.tone),
    key: keyForTone(prompt.tone),
    tempo: tempoForTone(prompt.tone),
    timeSignature: '4/4',
    duration: Math.round(prompt.durationSeconds),
    instruments: instrumentsForTone(prompt.tone),
    forbid: ['vocals', 'lyrics', 'electronic drums'],
    description,
    sections: prompt.cues.map((c) => ({
      atSeconds: c.atSeconds,
      label: labelForCue(c.kind),
      action: c.action,
    })),
  };
  const body = JSON.stringify(payload, null, 2);
  return {
    provider: 'aiva',
    prompt,
    body,
    narrative: description,
    wordCount: description.split(/\s+/).filter((w) => w.length > 0).length,
  };
};
