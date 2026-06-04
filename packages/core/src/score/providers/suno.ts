// suno — `{prompt, tags, makeInstrumental: true}`.
//
// Suno's API takes a short prose prompt and a comma-separated tag list
// (or array). We emit the JSON shape its `/api/custom_generate` accepts;
// `makeInstrumental: true` is the load-bearing field — without it Suno
// adds a vocal track ~70% of the time (the /250 lesson).
//
// Suno's prompt budget is tighter (~200 words) than AIVA's. We keep the
// body terse: opening clause, the time-stamped cues, the closing
// forbids. Boom cue is replicated in the `tags` array as `boom@{N}s` so
// the trained-on metadata locks the impact moment.

import type {RenderedScorePrompt, ScorePrompt, ScoreTone} from '@bjelser/kit';
import {closingClause, openingClause} from './template';

const round1 = (n: number): number => Math.round(n * 10) / 10;

const tagsForTone = (tone: ScoreTone): ReadonlyArray<string> => {
  const base = ['cinematic', 'orchestral', 'instrumental'];
  switch (tone) {
    case 'grave':
      return [...base, 'solemn', 'slow', 'low strings', 'timpani', 'dark'];
    case 'urgent':
      return [...base, 'driving', 'tense', 'building', 'percussion'];
    case 'calm':
      return [...base, 'gentle', 'warm', 'piano', 'soft'];
    case 'playful':
      return [...base, 'curious', 'bright', 'pizzicato', 'woodwinds'];
    case 'cinematic':
    default:
      return [...base, 'epic', 'powerful', 'brass', 'strings', 'timpani'];
  }
};

/**
 * Render the IR as Suno's JSON envelope. The prose stays short so the
 * trained-on metadata isn't washed out by adjectives.
 */
export const renderSuno = (prompt: ScorePrompt): RenderedScorePrompt => {
  const lines: string[] = [];
  lines.push(openingClause(prompt));
  // For Suno, drop the per-scene sustain/develop cues — they bloat the
  // prompt without changing the output much. Keep boom, pull-back,
  // inflect, quantify, and resolve.
  const keep = new Set(['boom', 'pull-back', 'inflect', 'quantify', 'resolve']);
  for (const cue of prompt.cues) {
    if (!keep.has(cue.kind)) continue;
    if (cue.kind === 'boom') {
      lines.push(`At ${round1(cue.atSeconds)} seconds, ${cue.action}.`);
      continue;
    }
    if (cue.kind === 'pull-back') {
      lines.push(`At ${round1(cue.atSeconds)} seconds, ${cue.action} for four seconds.`);
      continue;
    }
    if (cue.kind === 'resolve') {
      lines.push(`At ${round1(cue.atSeconds)} seconds, ${cue.action} by ${Math.round(prompt.durationSeconds)} seconds.`);
      continue;
    }
    lines.push(`At ${round1(cue.atSeconds)} seconds, ${cue.action}.`);
  }
  lines.push(closingClause(prompt));
  const prose = lines.join(' ');

  const tags = [...tagsForTone(prompt.tone)];
  if (prompt.boomAtSeconds !== null) {
    tags.push(`peak-at-${Math.round(prompt.boomAtSeconds)}s`);
  }

  const payload = {
    prompt: prose,
    tags,
    makeInstrumental: true,
    duration: Math.round(prompt.durationSeconds),
  };
  const body = JSON.stringify(payload, null, 2);
  return {
    provider: 'suno',
    prompt,
    body,
    narrative: prose,
    wordCount: prose.split(/\s+/).filter((w) => w.length > 0).length,
  };
};
