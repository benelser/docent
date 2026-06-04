// `docent captions <id>` — emit subtitle sidecars (SRT / VTT / SCC) from a
// film's persisted TTS manifest, with optional `--burn-in` post-process.
//
// R10 #1 — captions are table-stakes for any modern post pipeline:
// accessibility (WCAG 2.1 / ADA), autoplay on social platforms (TikTok,
// Instagram, Twitter all auto-mute), broadcast delivery (EBU R128, FCC),
// SEO + searchability.
//
// The cascade:
//   1. Load spec from films/<id>.json.
//   2. Build the frame schedule so each beat has an absolute (film-relative)
//      startFrame — word frames on the manifest are CLIP-relative, so we add
//      the beat's startFrame to recover film-relative frames.
//   3. Load the persisted TTS manifest (R5 IR — `beats[].words[]`). When the
//      manifest is missing OR a beat carries no `words[]`, gracefully degrade
//      to a per-beat cue spanning the beat's full duration.
//   4. Aggregate words into cues. Strategy:
//        - target ~2.5s per cue
//        - max 42 chars per LINE (broadcast convention)
//        - max 2 lines per cue
//        - break on punctuation `.`, `!`, `?`, `,` when within 0.5s of target
//        - break on word boundary when cumulative line width would exceed 42
//   5. Emit the requested format(s):
//        srt  -> out/<id>.srt   (HH:MM:SS,mmm)
//        vtt  -> out/<id>.vtt   (HH:MM:SS.mmm + WEBVTT header)
//        scc  -> out/<id>.scc   (Scenarist Closed Caption, drop-frame at 29.97)
//        all  -> all three
//   6. `--burn-in` runs ffmpeg's `subtitles=` filter over out/<id>.mp4 and
//      writes out/<id>-burned.mp4. Post-process (not in-render) — simpler,
//      decoupled, and works on any MP4 you already rendered. Trade-off: needs
//      a second encode pass.
//
// The CLI is the thin shell — cue aggregation and format emission live in
// this module rather than `@bjelser/kit` because (a) they are CLI-shaped
// (file output, ffmpeg shell-out) and (b) they are not part of the render
// engine's surface. The schedule + manifest reads are kit-public though.

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {spawn} from 'node:child_process';

import {createEngine} from '../engine-factory';
import {buildFrameSchedule, type FilmSpec, type TtsAudioMap} from '@bjelser/kit';

// ---- public surface --------------------------------------------------------

export type CaptionFormat = 'srt' | 'vtt' | 'scc' | 'all';

export interface CaptionsArgs {
  readonly filmId: string;
  /** One of srt|vtt|scc|all. Default: srt. */
  readonly format?: CaptionFormat;
  /** Burn captions onto out/<id>.mp4 via ffmpeg → out/<id>-burned.mp4. */
  readonly burnIn?: boolean;
  /** Override films/. */
  readonly filmsDir?: string;
  /** Override out/. */
  readonly outputDir?: string;
  /** Override project root (where public/audio/<id>/manifest.json lives). */
  readonly projectRoot?: string;
}

// ---- color helpers (status lines on stderr) --------------------------------

const reset = '\x1b[0m';
const red = (s: string) => `\x1b[31m${s}${reset}`;
const yellow = (s: string) => `\x1b[33m${s}${reset}`;
const green = (s: string) => `\x1b[32m${s}${reset}`;
const cyan = (s: string) => `\x1b[36m${s}${reset}`;
const dim = (s: string) => `\x1b[2m${s}${reset}`;
const log = (s: string) => process.stderr.write(`${s}\n`);

// ---- cue model -------------------------------------------------------------

/**
 * A single caption cue. Frames are film-relative (0 == film start) so the
 * timecode formatters can express them in whatever convention the format
 * requires.
 */
export interface CaptionCue {
  readonly index: number;
  readonly startFrame: number;
  readonly endFrame: number;
  /** 1 or 2 lines. The format writers join with `\n`. */
  readonly lines: ReadonlyArray<string>;
}

/** A film-relative word — its frame range is absolute in the film. */
interface FilmWord {
  readonly text: string;
  readonly startFrame: number;
  readonly endFrame: number;
  /** Did this word end with terminal punctuation (`. ! ?`)? */
  readonly terminator: boolean;
  /** Did this word end with a soft break (`,`)? */
  readonly softBreak: boolean;
}

// ---- aggregation constants -------------------------------------------------

const TARGET_SECONDS = 2.5;
const PUNCT_WINDOW_SECONDS = 0.5;
const MAX_LINE_CHARS = 42;
const MAX_LINES_PER_CUE = 2;
/**
 * Minimum cue length in seconds. Below this and the next word is folded
 * into the current cue regardless of soft-break heuristics — a 0.4s flash
 * is illegible.
 */
const MIN_CUE_SECONDS = 0.8;

// ---- entry point -----------------------------------------------------------

export const runCaptions = async (args: CaptionsArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const filmsDir = args.filmsDir ?? join(projectRoot, 'films');
  const outputDir = args.outputDir ?? join(projectRoot, 'out');
  const specPath = resolve(filmsDir, `${args.filmId}.json`);

  if (!existsSync(specPath)) {
    log(red(`✗ films/${args.filmId}.json not found at ${specPath}`));
    return 1;
  }

  const format: CaptionFormat = args.format ?? 'srt';
  if (!['srt', 'vtt', 'scc', 'all'].includes(format)) {
    log(red(`✗ unknown --format "${format}" — expected srt | vtt | scc | all`));
    return 64;
  }

  const spec: FilmSpec = JSON.parse(readFileSync(specPath, 'utf-8'));
  const {engine} = await createEngine(projectRoot);

  log(cyan(`▶ docent captions ${args.filmId} --format ${format}`));

  // Load the TTS manifest the same way `score` does. publicDir convention
  // mirrors the build cascade — projectRoot/public/audio/<id>/manifest.json.
  const manifestPath = join(projectRoot, 'public', 'audio', args.filmId, 'manifest.json');
  let ttsAudio: TtsAudioMap | undefined;
  let manifestPresent = false;
  let manifestFps: number | undefined;
  if (existsSync(manifestPath)) {
    try {
      const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
        readonly fps?: number;
        readonly beats?: Readonly<Record<string, {
          readonly sceneIndex: number;
          readonly beatIndex: number;
          readonly file: string;
          readonly seconds: number;
          readonly words?: ReadonlyArray<{readonly text: string; readonly startFrame: number; readonly endFrame: number}>;
        }>>;
      };
      if (raw.beats) {
        manifestPresent = true;
        manifestFps = raw.fps;
        const map: Record<`${number}-${number}`, {file: string; seconds: number; words?: ReadonlyArray<{text: string; startFrame: number; endFrame: number}>}> = {};
        for (const beat of Object.values(raw.beats)) {
          const key = `${beat.sceneIndex}-${beat.beatIndex}` as `${number}-${number}`;
          map[key] = {
            file: beat.file,
            seconds: beat.seconds,
            ...(beat.words ? {words: beat.words} : {}),
          };
        }
        ttsAudio = map as TtsAudioMap;
      }
    } catch {
      // fall through; we'll degrade to per-beat cues.
    }
  }

  // Schedule is the same shape the renderer sees — beat startFrames are
  // film-relative; manifest word frames are clip-relative. We add them.
  const schedule = buildFrameSchedule(spec, engine, ttsAudio);
  const fps = schedule.fps;

  if (manifestFps !== undefined && manifestFps !== fps) {
    log(yellow(`⚠ manifest fps (${manifestFps}) ≠ schedule fps (${fps}) — frames may be off`));
  }

  // Walk the schedule, materialise FilmWord[] in film-relative frames. When
  // a beat has no words[] we synthesise a single "word" spanning the beat
  // window so the cue stream still covers the audio.
  const filmWords: FilmWord[] = [];
  let wordedBeats = 0;
  let degradedBeats = 0;
  for (const sceneSchedule of schedule.scenes) {
    for (const beatSchedule of sceneSchedule.beats) {
      const audioEntry =
        ttsAudio?.[`${sceneSchedule.sceneIndex}-${beatSchedule.beatIndex}`];
      const beatStartFrame = beatSchedule.startFrame;
      const words = audioEntry?.words ?? [];
      if (words.length > 0) {
        wordedBeats += 1;
        for (const w of words) {
          filmWords.push({
            text: w.text,
            startFrame: beatStartFrame + w.startFrame,
            endFrame: beatStartFrame + w.endFrame,
            terminator: endsWithTerminator(w.text),
            softBreak: endsWithSoftBreak(w.text),
          });
        }
      } else {
        degradedBeats += 1;
        // No word timings — synthesise linearly-interpolated frames per
        // narration word so the aggregator's 42-char wrap still triggers.
        // We skip the trailing TAIL silence so captions don't linger over
        // black. When manifest seconds is known, use that; otherwise the
        // beat's full frame count is the window.
        const seconds = audioEntry?.seconds;
        const windowFrames =
          seconds !== undefined
            ? Math.round(seconds * fps)
            : beatSchedule.frames;
        const narration = (beatSchedule.beat.narration ?? '').trim();
        if (narration.length === 0) continue;
        const tokens = narration.split(/\s+/);
        const framesPerWord = Math.max(1, Math.floor(windowFrames / tokens.length));
        for (let t = 0; t < tokens.length; t++) {
          const tok = tokens[t]!;
          const startFrame = beatStartFrame + t * framesPerWord;
          const endFrame =
            t === tokens.length - 1
              ? beatStartFrame + windowFrames
              : beatStartFrame + (t + 1) * framesPerWord;
          filmWords.push({
            text: tok,
            startFrame,
            endFrame,
            terminator: endsWithTerminator(tok),
            softBreak: endsWithSoftBreak(tok),
          });
        }
      }
    }
  }

  if (manifestPresent) {
    log(
      dim(
        `  manifest: ${wordedBeats} beats with word timings · ${degradedBeats} degraded to per-beat`,
      ),
    );
  } else {
    log(yellow(`  manifest: absent — degrading to per-beat cues from narration text`));
  }

  if (filmWords.length === 0) {
    log(red(`✗ no narration found — film has no beats with text or audio`));
    return 1;
  }

  const cues = aggregateCues(filmWords, fps);

  // Compose write set.
  const formats: ReadonlyArray<'srt' | 'vtt' | 'scc'> =
    format === 'all' ? ['srt', 'vtt', 'scc'] : [format];

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, {recursive: true});
  }

  const totalSeconds = cues[cues.length - 1]
    ? cues[cues.length - 1]!.endFrame / fps
    : 0;

  const writtenPaths: string[] = [];
  for (const fmt of formats) {
    const ext = fmt;
    const path = join(outputDir, `${args.filmId}.${ext}`);
    let body: string;
    if (fmt === 'srt') body = emitSrt(cues, fps);
    else if (fmt === 'vtt') body = emitVtt(cues, fps);
    else body = emitScc(cues, fps);
    writeFileSync(path, body);
    writtenPaths.push(path);
    log(
      green(
        `✓ wrote ${cues.length} cues spanning ${totalSeconds.toFixed(1)} seconds to ${path}`,
      ),
    );
  }

  if (args.burnIn) {
    const inputMp4 = join(outputDir, `${args.filmId}.mp4`);
    if (!existsSync(inputMp4)) {
      log(red(`✗ --burn-in: ${inputMp4} not found. Run \`docent build ${args.filmId}\` first.`));
      return 1;
    }
    // Burn the SRT (always available — write it if not already in the set)
    const burnSrt = writtenPaths.find((p) => p.endsWith('.srt'));
    let burnSource = burnSrt;
    if (!burnSource) {
      const srtPath = join(outputDir, `${args.filmId}.srt`);
      writeFileSync(srtPath, emitSrt(cues, fps));
      log(dim(`  (wrote intermediate ${srtPath} for burn-in)`));
      burnSource = srtPath;
    }
    const outBurned = join(outputDir, `${args.filmId}-burned.mp4`);
    const code = await burnIn(inputMp4, burnSource, outBurned);
    if (code !== 0) return code;
    log(green(`✓ burned captions onto ${outBurned}`));
  }

  return 0;
};

// ---- helpers: punctuation classification -----------------------------------

const endsWithTerminator = (text: string): boolean => /[.!?]['")\]]?\s*$/.test(text);
const endsWithSoftBreak = (text: string): boolean => /[,;:]['")\]]?\s*$/.test(text);

// ---- helpers: cue aggregation ----------------------------------------------

/**
 * Walk the film-word stream and bucket words into cues. The rule:
 *
 *   - Open an empty cue. Append words one at a time.
 *   - At each step, compute:
 *       elapsed = (currentWord.endFrame - cueStartFrame) / fps
 *       lineWidth = current line's char count + word.length + 1
 *   - If `lineWidth > MAX_LINE_CHARS`:
 *        wrap to a new line. If we are already on line 2, close the cue
 *        BEFORE this word (it starts the next cue).
 *   - Else if `elapsed >= TARGET - PUNCT_WINDOW` AND the just-added word
 *      is a terminator/soft-break: close the cue AFTER this word.
 *   - Else if `elapsed >= TARGET + 1s`: hard-close (no punctuation arrived).
 *
 * The min-cue rule overrides: a cue under MIN_CUE_SECONDS never closes,
 * regardless of punctuation — a 0.4s flash is illegible.
 */
export const aggregateCues = (
  words: ReadonlyArray<FilmWord>,
  fps: number,
): ReadonlyArray<CaptionCue> => {
  const cues: CaptionCue[] = [];
  if (words.length === 0) return cues;

  const TARGET_FRAMES = Math.round(TARGET_SECONDS * fps);
  const PUNCT_WINDOW_FRAMES = Math.round(PUNCT_WINDOW_SECONDS * fps);
  const HARD_CLOSE_FRAMES = TARGET_FRAMES + Math.round(1.0 * fps);
  const MIN_CUE_FRAMES = Math.round(MIN_CUE_SECONDS * fps);

  let bufferLines: string[] = [''];
  let cueStart = words[0]!.startFrame;
  let cueEnd = words[0]!.endFrame;
  let cueIndex = 0;

  const closeCue = (atIndex: number, words: ReadonlyArray<FilmWord>) => {
    void words;
    void atIndex;
    const lines = bufferLines.map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return;
    cues.push({
      index: ++cueIndex,
      startFrame: cueStart,
      endFrame: cueEnd,
      lines,
    });
    bufferLines = [''];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;

    const isFirstWordOfCue = bufferLines.length === 1 && bufferLines[0]!.length === 0;
    if (isFirstWordOfCue) {
      cueStart = w.startFrame;
    }
    cueEnd = w.endFrame;

    // 1) Will this word fit on the current line?
    const currentLineIdx = bufferLines.length - 1;
    const currentLine = bufferLines[currentLineIdx]!;
    const trialLine =
      currentLine.length === 0 ? w.text : currentLine + ' ' + w.text;

    if (trialLine.length > MAX_LINE_CHARS && currentLine.length > 0) {
      // Wrap.
      if (bufferLines.length >= MAX_LINES_PER_CUE) {
        // Close THIS cue without the new word; the word starts the next cue.
        // We need to roll cueEnd back to the previous word's end.
        const prev = words[i - 1];
        if (prev) cueEnd = prev.endFrame;
        closeCue(i, words);
        // Re-process this word as the start of a new cue. Reset cueStart on
        // the next iteration (`isFirstWordOfCue` will fire).
        i -= 1;
        continue;
      }
      // Otherwise start a second line.
      bufferLines.push(w.text);
    } else {
      bufferLines[currentLineIdx] = trialLine;
    }

    // 2) Close-on-punctuation when within the target window.
    const elapsed = cueEnd - cueStart;
    const canClose = elapsed >= MIN_CUE_FRAMES;
    const inPunctWindow = elapsed >= TARGET_FRAMES - PUNCT_WINDOW_FRAMES;
    const hardClose = elapsed >= HARD_CLOSE_FRAMES;

    if (canClose && hardClose) {
      closeCue(i, words);
      continue;
    }
    if (canClose && inPunctWindow && (w.terminator || w.softBreak)) {
      closeCue(i, words);
      continue;
    }
  }

  // Flush the tail.
  if (bufferLines.some((l) => l.trim().length > 0)) {
    closeCue(words.length, words);
  }

  return cues;
};

// ---- helpers: timecode formatters ------------------------------------------

/** SRT — `HH:MM:SS,mmm`. */
export const framesToSrtTime = (frames: number, fps: number): string => {
  const totalMs = Math.round((frames / fps) * 1000);
  return formatHmsm(totalMs, ',');
};

/** VTT — `HH:MM:SS.mmm`. */
export const framesToVttTime = (frames: number, fps: number): string => {
  const totalMs = Math.round((frames / fps) * 1000);
  return formatHmsm(totalMs, '.');
};

const formatHmsm = (totalMs: number, sep: ',' | '.'): string => {
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return (
    String(h).padStart(2, '0') +
    ':' +
    String(m).padStart(2, '0') +
    ':' +
    String(s).padStart(2, '0') +
    sep +
    String(ms).padStart(3, '0')
  );
};

/**
 * SCC — Scenarist Closed Caption. Drop-frame timecode `HH:MM:SS;FF` at the
 * 29.97 broadcast convention.
 *
 * Drop-frame math (NTSC): every minute, the FF count skips 0 and 1 except
 * every tenth minute. This keeps wall-clock and timecode aligned to ~30s/hr.
 *
 * Conversion algorithm (Andrew Duncan / "drop frame timecode revisited"):
 *   dropFrames     = round(fps * 60 * 0.001) ≈ 2 at 29.97
 *   framesPer10Min = round(fps * 60 * 10)    ≈ 17982
 *   framesPerMin   = round(fps * 60) - dropFrames ≈ 1798
 *
 *   d = floor(frameNumber / framesPer10Min)
 *   m = frameNumber % framesPer10Min
 *   if m > dropFrames:
 *      frameNumber += dropFrames*9*d + dropFrames*floor((m - dropFrames)/framesPerMin)
 *   else:
 *      frameNumber += dropFrames*9*d
 *
 * NOTE: we accept a film-fps (commonly 30, sometimes 24/25) but always
 * encode the SCC at 29.97 drop-frame — that is the broadcast convention SCC
 * is defined against. The wall-clock seconds are the source of truth; we
 * round to the nearest 29.97 frame for the timecode column.
 */
export const framesToSccTime = (frames: number, sourceFps: number): string => {
  // 1) Frames at source fps → wall-clock seconds.
  const seconds = frames / sourceFps;
  // 2) Wall-clock seconds → 29.97 frame index.
  const SCC_FPS = 30000 / 1001; // 29.97
  const ntscFrame = Math.round(seconds * SCC_FPS);
  return framesToDropFrame(ntscFrame);
};

const framesToDropFrame = (frameNumber: number): string => {
  const dropFrames = 2;
  const framesPerHour = 107892; // 29.97 × 3600
  const framesPer24h = framesPerHour * 24;
  const framesPer10Min = 17982;
  const framesPerMin = 1798;

  let fn = ((frameNumber % framesPer24h) + framesPer24h) % framesPer24h;

  const d = Math.floor(fn / framesPer10Min);
  const m = fn % framesPer10Min;
  if (m > dropFrames) {
    fn = fn + dropFrames * 9 * d + dropFrames * Math.floor((m - dropFrames) / framesPerMin);
  } else {
    fn = fn + dropFrames * 9 * d;
  }

  const frRound = 30;
  const frames = fn % frRound;
  const seconds = Math.floor(fn / frRound) % 60;
  const minutes = Math.floor(fn / (frRound * 60)) % 60;
  const hours = Math.floor(fn / (frRound * 3600)) % 24;

  return (
    String(hours).padStart(2, '0') +
    ':' +
    String(minutes).padStart(2, '0') +
    ':' +
    String(seconds).padStart(2, '0') +
    ';' +
    String(frames).padStart(2, '0')
  );
};

// ---- format emitters -------------------------------------------------------

export const emitSrt = (cues: ReadonlyArray<CaptionCue>, fps: number): string => {
  const parts: string[] = [];
  for (const c of cues) {
    parts.push(String(c.index));
    parts.push(
      framesToSrtTime(c.startFrame, fps) + ' --> ' + framesToSrtTime(c.endFrame, fps),
    );
    for (const line of c.lines) parts.push(line);
    parts.push('');
  }
  return parts.join('\n');
};

export const emitVtt = (cues: ReadonlyArray<CaptionCue>, fps: number): string => {
  const parts: string[] = ['WEBVTT', ''];
  for (const c of cues) {
    parts.push(
      framesToVttTime(c.startFrame, fps) + ' --> ' + framesToVttTime(c.endFrame, fps),
    );
    for (const line of c.lines) parts.push(line);
    parts.push('');
  }
  return parts.join('\n');
};

/**
 * SCC — Scenarist Closed Caption format. The file header is the magic
 * `Scenarist_SCC V1.0` string; each line is a TIMECODE followed by a
 * tab and a stream of hex pairs (EIA-608 control codes + character cells).
 *
 * We emit a minimal subset that real decoders accept:
 *   - Resume Caption Loading (RCL, `9420`)
 *   - Erase Non-Displayed Memory (ENM, `942c`)
 *   - Preamble Address Code (PAC) for row 15 (bottom-of-screen)
 *   - Character pairs for the cue's text (one byte per char + odd parity;
 *     we cheat and use the table indexes — most decoders accept the wide
 *     ASCII range without strict parity).
 *   - End Of Caption (EOC, `942f`)
 *   - Erase Displayed Memory (EDM, `942c`) on the cue's END timecode.
 *
 * SCC is finicky — frame-accurate at 29.97 drop-frame is the convention.
 * For an authored explainer the start timecode dictates legibility; the EDM
 * on cue end clears the screen so cues don't pile up. We do NOT attempt
 * mid-row colour, italics, or roll-up — the contract here is "deliverable
 * to a broadcast tool that expects SCC + a separate burn-in copy for
 * accessibility tests". This bar is met by the cue set we emit.
 */
export const emitScc = (cues: ReadonlyArray<CaptionCue>, fps: number): string => {
  const out: string[] = ['Scenarist_SCC V1.0', ''];
  for (const c of cues) {
    // Resume Caption Loading + clear non-displayed + load + end of caption.
    const lineText = c.lines.join(' ').toUpperCase();
    const hex = textToScc(lineText);
    const startTc = framesToSccTime(c.startFrame, fps);
    const endTc = framesToSccTime(c.endFrame, fps);
    // 9420 = RCL ; 942c = ENM ; 9470 = PAC row 15 col 0 ; 942f = EOC
    const startLine = startTc + '\t9420 942c 9470 ' + hex + ' 942f';
    out.push(startLine);
    out.push('');
    // Clear at the end. 942c = ENM/EDM (both share opcode on field 1).
    out.push(endTc + '\t942c');
    out.push('');
  }
  return out.join('\n');
};

/**
 * ASCII text → SCC hex-pair stream. EIA-608 packs TWO 7-bit characters
 * per 16-bit code word with odd parity. We pack pairs and emit them as
 * 4-hex words; an odd-trailing char gets paired with the null filler `80`
 * (the convention).
 */
const textToScc = (text: string): string => {
  const filler = 0x80;
  const buf: string[] = [];
  const safeChars: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code > 0x7e) {
      // Replace anything outside printable ASCII with a space.
      safeChars.push(0x20);
    } else {
      safeChars.push(applyOddParity(code));
    }
  }
  // If odd length, pad with one space (then filler will not be needed).
  if (safeChars.length % 2 !== 0) {
    safeChars.push(applyOddParity(0x20));
  }
  for (let i = 0; i < safeChars.length; i += 2) {
    const hi = safeChars[i]!;
    const lo = safeChars[i + 1] ?? filler;
    buf.push(((hi << 8) | lo).toString(16).padStart(4, '0'));
  }
  return buf.join(' ');
};

const applyOddParity = (b: number): number => {
  let v = b & 0x7f;
  let parity = 1;
  for (let i = 0; i < 7; i++) parity ^= (v >> i) & 1;
  return (parity << 7) | v;
};

// ---- burn-in ---------------------------------------------------------------

/**
 * Post-process burn-in via ffmpeg. We pick post-process (not a Remotion
 * `<Captions>` overlay) for two reasons:
 *
 *   1. **Decoupling.** The burn step works on any MP4 the user already has —
 *      no need to re-render the whole film just to test caption styling.
 *      `bunx docent build <id> && bunx docent captions <id> --burn-in` is
 *      the documented flow; either half can run alone.
 *
 *   2. **Simplicity.** ffmpeg's subtitle renderer is the broadcast
 *      reference. Re-implementing the same wrap / kerning / drop-shadow
 *      story inside Remotion would add ~200 lines of UI code that already
 *      exists in libass.
 *
 * Trade-off: this requires a second encode pass. For a 30s film that's
 * ~6s of wall-clock. The alternative (in-render overlay) would add cost
 * to every build whether or not captions were wanted.
 *
 * Hard burn-in (pixels rasterised onto the frame) requires ffmpeg built with
 * `--enable-libass`. The Homebrew default on macOS at the time of writing
 * is libass-less. We detect this at start, and when libass is unavailable
 * we degrade to a **soft-mux** path (`mov_text` subtitle stream embedded in
 * the MP4 container). Soft-mux preserves accessibility (any modern player
 * with subs-on shows them) and round-trips through ffprobe identically — it
 * just isn't pixel-burned, so a CDN that strips subtitle tracks would erase
 * the captions. We log which path we took so a downstream pipeline can
 * decide whether to require a libass build for true broadcast burn.
 */
const burnIn = async (
  inputMp4: string,
  srtPath: string,
  outputMp4: string,
): Promise<number> => {
  const hasLibass = await ffmpegSupportsSubtitles();
  if (hasLibass) {
    return runFfmpeg([
      '-y',
      '-i',
      inputMp4,
      '-vf',
      // ffmpeg filter-arg syntax: `:` delimits options, `'` quotes strings,
      // `\` escapes. We escape `\`, `'`, `:` inside the filename. We do NOT
      // wrap the path in `'...'` — libavfilter's outer parser sees that as
      // an unrelated quoted-string opener and errors out.
      `subtitles=${srtPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:')}`,
      '-c:a',
      'copy',
      outputMp4,
    ]);
  }
  log(
    yellow(
      `  libass unavailable — degrading to soft-mux (mov_text). Hard burn-in needs ffmpeg built with --enable-libass.`,
    ),
  );
  return runFfmpeg([
    '-y',
    '-i',
    inputMp4,
    '-i',
    srtPath,
    '-c:v',
    'copy',
    '-c:a',
    'copy',
    '-c:s',
    'mov_text',
    outputMp4,
  ]);
};

/**
 * Probe ffmpeg's filter list for the `subtitles` filter (libass-backed).
 * Cached for the life of the process.
 */
let libassCache: boolean | undefined;
const ffmpegSupportsSubtitles = async (): Promise<boolean> => {
  if (libassCache !== undefined) return libassCache;
  return new Promise((resolveExec) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-filters'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const buf: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => buf.push(c));
    child.on('error', () => {
      libassCache = false;
      resolveExec(false);
    });
    child.on('close', () => {
      const txt = Buffer.concat(buf).toString('utf-8');
      libassCache = /\bsubtitles\s+V->V\b/.test(txt) || /\bsubtitles\b.*V->V/.test(txt);
      resolveExec(libassCache);
    });
  });
};

const runFfmpeg = async (args: ReadonlyArray<string>): Promise<number> =>
  new Promise((resolveExec) => {
    log(
      dim(
        `  ffmpeg ${args
          .map((a) => (a.includes(' ') ? `"${a}"` : a))
          .join(' ')}`,
      ),
    );
    const child = spawn('ffmpeg', args.slice(), {stdio: ['ignore', 'ignore', 'pipe']});
    const errBuf: Buffer[] = [];
    child.stderr.on('data', (chunk: Buffer) => errBuf.push(chunk));
    child.on('error', (e) => {
      log(red(`✗ ffmpeg spawn failed: ${e.message}`));
      resolveExec(1);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        const tail = Buffer.concat(errBuf)
          .toString('utf-8')
          .split('\n')
          .slice(-10)
          .join('\n');
        log(red(`✗ ffmpeg exited ${code}\n${tail}`));
        resolveExec(code ?? 1);
      } else {
        resolveExec(0);
      }
    });
  });
