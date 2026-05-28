// SubRip (`.srt`) writer.
//
// SRT format is well known: a numbered cue list, where each cue has an
// index, a `HH:MM:SS,mmm --> HH:MM:SS,mmm` timestamp, and one-or-more
// text lines, separated by a blank line. The writer here owns ONLY the
// formatting — the caller (feature.ts) decides which beats become cues.

import type {AfterRenderBeat} from '@bjelser/kit';

/**
 * Format a clock duration (in seconds) as the SRT timestamp shape:
 * `HH:MM:SS,mmm`. `,` is the SRT decimal separator (VTT uses `.`).
 */
export const formatSrtTime = (seconds: number): string => {
  const total = Math.max(0, seconds);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  // Guard the ms rounding: if it rounded up to 1000, carry into seconds.
  let normalizedMs = ms;
  let normalizedSs = ss;
  let normalizedMm = mm;
  let normalizedHh = hh;
  if (normalizedMs >= 1000) {
    normalizedMs -= 1000;
    normalizedSs += 1;
  }
  if (normalizedSs >= 60) {
    normalizedSs -= 60;
    normalizedMm += 1;
  }
  if (normalizedMm >= 60) {
    normalizedMm -= 60;
    normalizedHh += 1;
  }
  const pad = (n: number, w = 2): string => n.toString().padStart(w, '0');
  return `${pad(normalizedHh)}:${pad(normalizedMm)}:${pad(normalizedSs)},${pad(normalizedMs, 3)}`;
};

/**
 * Optional: split a long narration line so each SRT cue stays inside the
 * usual 42-char-per-line / 2-line limit. The implementation is conservative
 * — it word-wraps at ~42 chars and joins multi-line cues with `\n`.
 */
const wrapForSubtitle = (text: string, maxChars = 42): string => {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const candidate = current.length === 0 ? w : `${current} ${w}`;
    if (candidate.length > maxChars && current.length > 0) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.join('\n');
};

/**
 * Build a SubRip-formatted string from a sequence of beats.
 *
 * The caller's `beats` come straight from `AfterRenderContext.beats`, in
 * the order they were narrated. Beats with empty text are skipped — they
 * don't earn a cue. The cumulative `seconds` field is used to derive each
 * cue's start/end timestamp on the film clock.
 */
export const buildSrt = (beats: ReadonlyArray<AfterRenderBeat>): string => {
  const cues: string[] = [];
  let clock = 0;
  let index = 1;
  for (const b of beats) {
    const text = (b.text ?? '').trim();
    // Skip beats with no narration text — no cue earns the screen space.
    if (text.length === 0) {
      clock += b.seconds;
      continue;
    }
    const start = clock;
    const end = clock + b.seconds;
    cues.push(
      `${index}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${wrapForSubtitle(text)}\n`,
    );
    clock = end;
    index += 1;
  }
  // SRT files end with a trailing blank line; players are tolerant either
  // way but the canonical examples include it.
  return `${cues.join('\n')}\n`;
};

export default buildSrt;
