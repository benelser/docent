// template — the generic /250 prompt shape.
//
// Plain prose, time-stamped. The lowest common denominator every
// music-gen API accepts (Suno's web UI, AIVA's freeform field, any
// future provider that takes a text blob). The IR walks beat-by-beat
// and emits "At Ns, {action} — {rationale}" lines.

import type {RenderedScorePrompt, ScorePrompt} from '@bjelser/kit';

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Render the IR as plain prose. Mirrors the /250 trailer-music POC
 * template — opening clause, time-stamped beats, boom, resolve.
 */
export const renderTemplate = (prompt: ScorePrompt): RenderedScorePrompt => {
  const lines: string[] = [];

  // Opening clause — the one fixed-shape line every prompt starts with.
  // Computed here rather than in build-prompt so adapters can override
  // (Suno wraps in JSON, Udio adds tags).
  lines.push(openingClause(prompt));

  // Time-stamped cues. Iterate in time order; emit short imperative
  // phrases — "At 12 s, strings layer …". Skip the synthetic head-of-
  // film `open` cue at atSeconds = 0 (already covered by the opening).
  for (const cue of prompt.cues) {
    if (cue.atSeconds === 0 && cue.kind === 'open') continue;
    if (cue.kind === 'boom') {
      lines.push(
        `At ${round1(cue.atSeconds)} seconds, ${cue.action}.`,
      );
      continue;
    }
    if (cue.kind === 'pull-back') {
      lines.push(
        `At ${round1(cue.atSeconds)} seconds, ${cue.action} for about four seconds.`,
      );
      continue;
    }
    if (cue.kind === 'resolve') {
      lines.push(
        `At ${round1(cue.atSeconds)} seconds, ${cue.action} by ${Math.round(prompt.durationSeconds)} seconds.`,
      );
      continue;
    }
    lines.push(`At ${round1(cue.atSeconds)} seconds, ${cue.action}.`);
  }

  // Closing clause. Names the genre + the forbids ("no vocals, no
  // electronic elements") so the trained-on metadata doesn't substitute
  // a vocal stem.
  lines.push(closingClause(prompt));

  const body = lines.join(' ');
  return {
    provider: 'template',
    prompt,
    body,
    narrative: body,
    wordCount: body.split(/\s+/).filter((w) => w.length > 0).length,
  };
};

export const openingClause = (prompt: ScorePrompt): string => {
  // The first cue's action carries the opening; pair with the explicit
  // duration so the trained-on model honours the length budget.
  const open = prompt.cues.find((c) => c.kind === 'open');
  const d = Math.round(prompt.durationSeconds);
  const lead = openingForTone(prompt.tone, d);
  if (open && open.action) {
    return `${lead} ${capitalize(open.action)}.`;
  }
  return lead;
};

const openingForTone = (
  tone: ScorePrompt['tone'],
  durationSeconds: number,
): string => {
  switch (tone) {
    case 'grave':
      return `A cinematic orchestral instrumental score, ${durationSeconds} seconds long. Opens with a deep sustained string chord and a single timpani hit that settles into a low brass underlay.`;
    case 'urgent':
      return `A cinematic orchestral score with driving rhythm, ${durationSeconds} seconds long. Opens with a low pulsing string ostinato and a single timpani hit.`;
    case 'calm':
      return `A gentle orchestral score for warm strings and piano, ${durationSeconds} seconds long. Opens with a soft sustained string chord beneath a delicate piano figure.`;
    case 'playful':
      return `A light orchestral score with woodwinds and pizzicato strings, ${durationSeconds} seconds long. Opens with a curious pizzicato motif over soft sustained strings.`;
    case 'cinematic':
    default:
      return `A cinematic orchestral instrumental score, ${durationSeconds} seconds long. Opens with a bold sustained string chord and a soft timpani hit.`;
  }
};

const capitalize = (s: string): string =>
  s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);

export const closingClause = (prompt: ScorePrompt): string => {
  switch (prompt.tone) {
    case 'grave':
      return 'Style: grave cinematic orchestra, no vocals, no electronic elements, restrained and weighty.';
    case 'urgent':
      return 'Style: urgent cinematic orchestra with percussive forward motion, no vocals, no electronic elements.';
    case 'calm':
      return 'Style: gentle orchestral score for strings and piano, no vocals, no electronic elements, restrained and contemplative.';
    case 'playful':
      return 'Style: light orchestral score with woodwinds and pizzicato strings, no vocals, no electronic elements, curious and bright.';
    case 'cinematic':
    default:
      return 'Style: grand cinematic orchestra, no vocals, no electronic elements, powerful and emotional.';
  }
};
