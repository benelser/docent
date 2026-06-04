// udio — plain prose + style tags + structural section markers.
//
// Udio accepts a freeform prompt (the prose), a tag array (the genre +
// instrument labels), and benefits from explicit `[intro] [verse]
// [build] [peak] [resolve]` markers inline. We honour all three: the
// prose carries the time-stamped narrative (same shape as `template`),
// the tag array carries genre + mood + instrument hints, and the
// markers are interleaved at the section boundaries.

import type {RenderedScorePrompt, ScorePrompt, ScoreTone} from '@bjelser/kit';
import {closingClause, openingClause} from './template';

const round1 = (n: number): number => Math.round(n * 10) / 10;

const tagsForTone = (tone: ScoreTone): ReadonlyArray<string> => {
  const base = ['cinematic', 'orchestral', 'instrumental', 'no vocals'];
  switch (tone) {
    case 'grave':
      return [...base, 'solemn', 'slow', 'low strings', 'timpani'];
    case 'urgent':
      return [...base, 'driving', 'tense', 'percussion'];
    case 'calm':
      return [...base, 'gentle', 'warm', 'piano', 'soft strings'];
    case 'playful':
      return [...base, 'curious', 'light', 'pizzicato', 'woodwinds'];
    case 'cinematic':
    default:
      return [...base, 'epic', 'full orchestra', 'brass', 'strings'];
  }
};

const sectionTagForCue = (kind: ScorePrompt['cues'][number]['kind']): string => {
  switch (kind) {
    case 'open':
      return '[intro]';
    case 'develop':
      return '[build]';
    case 'quantify':
      return '[accent]';
    case 'inflect':
      return '[turn]';
    case 'pull-back':
      return '[breath]';
    case 'boom':
      return '[peak]';
    case 'resolve':
      return '[resolve]';
    case 'sustain':
    default:
      return '[verse]';
  }
};

/**
 * Render the IR as Udio's prompt-plus-tags format. The body is a single
 * paragraph with structural markers interleaved; the JSON envelope carries
 * the prompt, tags, sections, and the duration.
 */
export const renderUdio = (prompt: ScorePrompt): RenderedScorePrompt => {
  // Build the prose body with Udio-style structural markers.
  const lines: string[] = [];
  lines.push(openingClause(prompt));
  for (const cue of prompt.cues) {
    if (cue.atSeconds === 0 && cue.kind === 'open') continue;
    const tag = sectionTagForCue(cue.kind);
    const at = `At ${round1(cue.atSeconds)} seconds`;
    if (cue.kind === 'boom') {
      lines.push(`${tag} ${at}, ${cue.action}.`);
      continue;
    }
    if (cue.kind === 'pull-back') {
      lines.push(`${tag} ${at}, ${cue.action} for about four seconds.`);
      continue;
    }
    if (cue.kind === 'resolve') {
      lines.push(`${tag} ${at}, ${cue.action} by ${Math.round(prompt.durationSeconds)} seconds.`);
      continue;
    }
    lines.push(`${tag} ${at}, ${cue.action}.`);
  }
  lines.push(closingClause(prompt));
  const prose = lines.join(' ');

  const payload = {
    prompt: prose,
    tags: tagsForTone(prompt.tone),
    duration: Math.round(prompt.durationSeconds),
    sections: prompt.cues.map((c) => ({
      tag: sectionTagForCue(c.kind),
      atSeconds: c.atSeconds,
      action: c.action,
    })),
  };
  const body = JSON.stringify(payload, null, 2);
  return {
    provider: 'udio',
    prompt,
    body,
    narrative: prose,
    wordCount: prose.split(/\s+/).filter((w) => w.length > 0).length,
  };
};
