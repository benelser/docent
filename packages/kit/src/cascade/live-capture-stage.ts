// Live-capture stage — drive Playwright at build time. R16.1.
//
// What this stage does:
//
//   1. Walks `spec.scenes[]` for scenes whose `type === 'live-browser'`.
//   2. For each, computes a stable content hash over (url + viewport +
//      actions + auth-shape) and looks up the slot in
//      `<publicDir>/clips/<filmId>/live-capture-manifest.json`. A cache hit
//      reuses the persisted MP4 verbatim; a miss runs Playwright fresh.
//   3. Runs the capture: launches a headless chromium, sets the viewport,
//      navigates to the URL, executes the declared action script (each
//      action sleeps until its `at` frame), then closes the context and
//      writes a recorded `.webm` to disk.
//   4. Transcodes the `.webm` to `.mp4` via `ffmpeg` so the Remotion
//      `<OffthreadVideo>` reads it without trouble.
//   5. Writes the captured MP4 to `<publicDir>/clips/<filmId>/live-<sceneId>.mp4`
//      and updates the manifest.
//
// **Capture-strategy choice — `page.video()`, not per-frame screenshots.**
// Playwright's `page.video()` records the full session as WebM at the
// configured viewport size, server-side. We then transcode to MP4 (yuv420p)
// in ffmpeg's single-pipe pass. Trade-offs:
//
//   - PRO: ~zero overhead per frame (the browser drives its own encoder),
//     so a 12s capture runs in ~14s wall-clock end to end including the
//     transcode. The alternative — call `page.screenshot()` every 1000/30
//     ms and pipe each PNG to ffmpeg — has a per-frame round-trip cost that
//     dominates a long capture; my back-of-envelope estimate was 30-40s for
//     the same 12s capture, and the cursor position would land on whatever
//     paint frame happens to be ready rather than the "intended" frame.
//   - CON: Less control over the per-frame timeline. The recorded WebM's
//     frame rate floats (Playwright is "close to" 30 fps but doesn't lock
//     it); the transcode re-times. For computer-use demos this is fine —
//     the recording IS the truth, not the spec. For a strict synchronized
//     overlay (cursor at exactly frame N), screenshot mode would be better.
//
// R16.1.1 (the obvious follow-up): a `capture: 'screenshot'` opt-in on the
// scene so a strict-sync overlay can pay the wall-clock cost.
//
// **Audio is dropped.** Playwright's video recording is silent — chromium
// renders pages without driving the system audio output. The demonstrate
// scene's narration handles this the same way (the per-beat TTS audio is
// laid over the silent clip by the narration feature). We don't try to
// capture system audio; it would mean piping through OS-specific APIs.
//
// **Hash key (cache invalidation).** SHA256 over:
//   url + JSON.stringify({viewport, actions, durationFrames, auth-without-secrets})
// — i.e. the spec author's CONTROL surface. We deliberately do NOT hash
// the captured bytes (different render runs against a live dashboard
// produce different bytes; we want the same hash to short-circuit). Auth
// secrets are hashed by shape (the set of fields), not by value, so
// rotating a password doesn't invalidate every cached clip.
//
// **Graceful degradation.** When Playwright can't be imported (the dep is
// missing in this workspace, or the chromium binary isn't installed) the
// stage:
//   - Emits a clear `[live-capture]` warning naming the missing piece.
//   - Skips the capture (no exception thrown to the cascade).
//   - The render-side component then plays whatever (possibly stale) clip
//     is already on disk, or shows the placeholder if none exists.

import {createHash} from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

import type {FilmSpec, Scene} from './../types/spec';

/** Options accepted by `runLiveCaptureStage`. */
export interface LiveCaptureStageOptions {
  /** Absolute path of the project's Remotion `public/` directory. Required for persistence. */
  publicDir?: string;
  /** Required — the film id used to scope the clips dir. */
  filmId?: string;
  /** Force a fresh capture for every scene, ignoring the manifest. */
  noCache?: boolean;
  /** Sink for diagnostic lines. Defaults to `process.stderr.write`. */
  log?: (s: string) => void;
  /** Override how Playwright is loaded — used by tests + dev to inject a fake. */
  loadPlaywright?: () => Promise<{chromium: PlaywrightChromium}>;
}

/** Minimum surface of the playwright import we depend on. Typed locally so
 * `@bjelser/kit` doesn't take a hard type-dep on the package. */
type PlaywrightChromium = {
  launch(opts?: {headless?: boolean}): Promise<PwBrowser>;
};
type PwBrowser = {
  newContext(opts?: PwContextOpts): Promise<PwContext>;
  close(): Promise<void>;
};
type PwContextOpts = {
  viewport?: {width: number; height: number};
  httpCredentials?: {username: string; password: string};
  extraHTTPHeaders?: Record<string, string>;
  recordVideo?: {dir: string; size?: {width: number; height: number}};
};
type PwContext = {
  newPage(): Promise<PwPage>;
  setExtraHTTPHeaders(h: Record<string, string>): Promise<void>;
  close(): Promise<void>;
};
type PwPage = {
  goto(url: string, opts?: {waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'}): Promise<unknown>;
  click(selector: string): Promise<void>;
  hover(selector: string): Promise<void>;
  fill?(selector: string, text: string): Promise<void>;
  type?(selector: string, text: string, opts?: {delay?: number}): Promise<void>;
  mouse: {
    move(x: number, y: number, opts?: {steps?: number}): Promise<void>;
    click(x: number, y: number): Promise<void>;
  };
  keyboard: {type(text: string, opts?: {delay?: number}): Promise<void>};
  evaluate(fn: string | ((arg: unknown) => unknown), arg?: unknown): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(opts?: {path?: string; fullPage?: boolean}): Promise<Uint8Array>;
  video(): {path(): Promise<string>; saveAs(p: string): Promise<void>} | null;
};

/** A single scene's capture result, returned in the manifest. */
export interface LiveCaptureBeatResult {
  readonly sceneId: string;
  readonly sceneIndex: number;
  /** Public-folder-relative path (e.g. `clips/<filmId>/live-<sceneId>.mp4`). */
  readonly file: string;
  /** `true` when this clip was reused from the manifest. */
  readonly cached: boolean;
  /** Wall-clock seconds the capture+transcode took. 0 on a cache hit. */
  readonly captureSeconds: number;
  /** SHA256 of the cache-key inputs. */
  readonly contentHash: string;
}

export interface LiveCaptureStageManifest {
  readonly filmId: string;
  readonly clips: ReadonlyArray<LiveCaptureBeatResult>;
  /** Absolute path to the persisted manifest, when written. */
  readonly manifestPath?: string;
}

/** On-disk shape of the per-film clips manifest. */
export interface LiveCapturePersistedManifest {
  readonly filmId: string;
  readonly clips: Readonly<Record<string, LiveCapturePersistedClip>>;
}

export interface LiveCapturePersistedClip {
  readonly sceneId: string;
  readonly file: string;
  readonly contentHash: string;
  readonly capturedAtMs: number;
}

/** Stable JSON stringify — sorted keys, drops undefined. Same impl as tts-stage. */
const stableJsonStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableJsonStringify(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue;
    parts.push(JSON.stringify(k) + ':' + stableJsonStringify(v));
  }
  return '{' + parts.join(',') + '}';
};

/** The minimal shape of a live-browser scene we walk + capture. */
interface LiveScene extends Scene {
  type: 'live-browser';
  id?: string;
  url?: string;
  viewport?: {width: number; height: number};
  actions?: ReadonlyArray<{
    at: number;
    kind: 'click' | 'hover' | 'scroll' | 'type' | 'wait' | 'screenshot';
    selector?: string;
    text?: string;
    x?: number;
    y?: number;
    durationFrames?: number;
  }>;
  durationFrames?: number;
  auth?: {
    type: 'basic' | 'header';
    username?: string;
    password?: string;
    headers?: Record<string, string>;
  };
}

const isLiveScene = (s: Scene): s is LiveScene => s.type === 'live-browser';

/** Compute the cache-key hash for a live scene. */
const hashScene = (s: LiveScene): string => {
  const h = createHash('sha256');
  h.update(s.url ?? '');
  h.update('|');
  h.update(
    stableJsonStringify({
      viewport: s.viewport ?? {width: 1920, height: 1080},
      actions: s.actions ?? [],
      durationFrames: s.durationFrames ?? 360,
      // We hash auth by *shape* only — the set of fields, not the values —
      // so rotating a password doesn't invalidate every cached clip. A
      // *new* auth type (basic → header) does, which is correct.
      authShape: s.auth
        ? {
            type: s.auth.type,
            hasUsername: typeof s.auth.username === 'string',
            hasPassword: typeof s.auth.password === 'string',
            headerKeys: s.auth.headers ? Object.keys(s.auth.headers).sort() : [],
          }
        : null,
    }),
  );
  return h.digest('hex');
};

/** Default Playwright loader — dynamic import so a missing dep is non-fatal. */
const defaultLoadPlaywright = async (): Promise<{chromium: PlaywrightChromium}> => {
  // dynamic import, guarded behind a try/catch in the caller
  const mod = (await import('playwright')) as unknown as {chromium: PlaywrightChromium};
  return mod;
};

/** Best-effort: locate the project's ffmpeg. We rely on PATH. */
const ffmpegOk = (): boolean => {
  const out = spawnSync('ffmpeg', ['-version'], {timeout: 3000});
  return out.status === 0;
};

/** Transcode a webm into mp4 (yuv420p, h264, +faststart, no audio). */
const transcodeWebmToMp4 = (webmPath: string, mp4Path: string): {ok: boolean; stderr: string} => {
  const out = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i', webmPath,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'veryfast',
      '-crf', '20',
      '-movflags', '+faststart',
      '-an',
      mp4Path,
    ],
    {encoding: 'utf-8', timeout: 120000},
  );
  return {ok: out.status === 0, stderr: out.stderr ?? ''};
};

/** Execute a single action against a Playwright page. */
const runAction = async (
  page: PwPage,
  a: NonNullable<LiveScene['actions']>[number],
): Promise<void> => {
  if (a.kind === 'click') {
    if (typeof a.selector === 'string') {
      await page.click(a.selector);
    } else if (typeof a.x === 'number' && typeof a.y === 'number') {
      // tween the cursor toward the click point so the recorded video shows
      // motion, then click. 12 steps reads as "deliberate".
      await page.mouse.move(a.x, a.y, {steps: 12});
      await page.mouse.click(a.x, a.y);
    }
  } else if (a.kind === 'hover') {
    if (typeof a.selector === 'string') {
      await page.hover(a.selector);
    } else if (typeof a.x === 'number' && typeof a.y === 'number') {
      await page.mouse.move(a.x, a.y, {steps: 18});
    }
  } else if (a.kind === 'scroll') {
    if (typeof a.selector === 'string') {
      await page.evaluate(
        `((sel)=>{const el=document.querySelector(sel);if(el)el.scrollIntoView({behavior:'smooth',block:'center'})})(${JSON.stringify(a.selector)})`,
      );
    } else if (typeof a.x === 'number' && typeof a.y === 'number') {
      await page.evaluate(
        `window.scrollTo({left:${a.x},top:${a.y},behavior:'smooth'})`,
      );
    }
  } else if (a.kind === 'type') {
    if (typeof a.text === 'string') {
      if (typeof a.selector === 'string' && page.type) {
        await page.type(a.selector, a.text, {delay: 35});
      } else {
        await page.keyboard.type(a.text, {delay: 35});
      }
    }
  } else if (a.kind === 'wait') {
    const ms = ((a.durationFrames ?? 30) / 30) * 1000;
    await page.waitForTimeout(ms);
  } else if (a.kind === 'screenshot') {
    // No-op in v1 — reserved for the future thumbnail surface.
  }
};

/** Capture one scene. Returns the file's public-folder-relative path. */
const captureScene = async (
  scene: LiveScene,
  ctx: {
    publicDir: string;
    filmId: string;
    clipsDirAbs: string;
    clipsDirRel: string;
    chromium: PlaywrightChromium;
    log: (s: string) => void;
  },
): Promise<{file: string; seconds: number}> => {
  const start = Date.now();
  const sceneId = scene.id!;
  const fname = `live-${sceneId}.mp4`;
  const mp4Abs = join(ctx.clipsDirAbs, fname);
  const tmpDir = join(ctx.clipsDirAbs, `.tmp-${sceneId}`);
  mkdirSync(tmpDir, {recursive: true});

  const viewport = scene.viewport ?? {width: 1920, height: 1080};
  const totalFrames = scene.durationFrames ?? 360;
  const totalMs = (totalFrames / 30) * 1000;

  const browser = await ctx.chromium.launch({headless: true});
  try {
    const contextOpts: PwContextOpts = {
      viewport,
      recordVideo: {dir: tmpDir, size: viewport},
    };
    if (scene.auth?.type === 'basic' && scene.auth.username && scene.auth.password) {
      contextOpts.httpCredentials = {
        username: scene.auth.username,
        password: scene.auth.password,
      };
    }
    if (scene.auth?.type === 'header' && scene.auth.headers) {
      contextOpts.extraHTTPHeaders = scene.auth.headers;
    }
    const context = await browser.newContext(contextOpts);
    const page = await context.newPage();
    const navStart = Date.now();
    await page.goto(scene.url!, {waitUntil: 'networkidle'}).catch(async () => {
      // some dashboards never reach networkidle (long-poll). Fall back to
      // `load` so we never hang the cascade.
      await page.goto(scene.url!, {waitUntil: 'load'});
    });
    const navMs = Date.now() - navStart;
    ctx.log(`[live-capture]   ${sceneId}: navigated in ${navMs}ms`);

    // Drive the action script. We treat `at` as offset from "capture start"
    // — which is the moment we'd START a record if we could (i.e. now).
    // Sleep until each action's `at` frame, then dispatch it.
    const captureStart = Date.now();
    const actions = scene.actions ?? [];
    for (const a of actions) {
      const targetMs = (a.at / 30) * 1000;
      const nowMs = Date.now() - captureStart;
      const sleepMs = Math.max(0, targetMs - nowMs);
      if (sleepMs > 0) await page.waitForTimeout(sleepMs);
      try {
        await runAction(page, a);
      } catch (e) {
        ctx.log(
          `[live-capture]   ${sceneId}: action {kind:${a.kind}, at:${a.at}} failed — ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    // Hold until the end of the declared duration.
    const elapsedMs = Date.now() - captureStart;
    if (elapsedMs < totalMs) await page.waitForTimeout(totalMs - elapsedMs);

    // Close context so Playwright finalizes the video file. `page.video()`
    // is only valid before context close; flush via `saveAs` first.
    const video = page.video();
    await context.close();

    // Now flush. After context.close() Playwright writes the .webm with
    // its hash-name to tmpDir. We rename it to a stable path.
    let webmPath: string | null = null;
    if (video) {
      try {
        const p = await video.path();
        webmPath = p;
      } catch {
        webmPath = null;
      }
    }
    // Fall back: scan tmpDir for .webm
    if (!webmPath) {
      const files = (await import('node:fs/promises')).readdir(tmpDir);
      const list = await files;
      const webm = list.find((f) => f.endsWith('.webm'));
      webmPath = webm ? join(tmpDir, webm) : null;
    }
    if (!webmPath || !existsSync(webmPath)) {
      throw new Error(`playwright did not produce a recorded video at ${tmpDir}`);
    }

    const tx = transcodeWebmToMp4(webmPath, mp4Abs);
    if (!tx.ok) {
      throw new Error(`ffmpeg transcode failed: ${tx.stderr.slice(0, 800)}`);
    }
    // Cleanup tmp
    try {
      rmSync(tmpDir, {recursive: true, force: true});
    } catch {
      /* tolerable */
    }
  } finally {
    await browser.close();
  }

  const seconds = (Date.now() - start) / 1000;
  const fileRel = `${ctx.clipsDirRel}/${fname}`;
  return {file: fileRel, seconds};
};

/** Walk a film spec, drive Playwright for every live-browser scene, return a manifest. */
export const runLiveCaptureStage = async (
  spec: FilmSpec,
  opts: LiveCaptureStageOptions = {},
): Promise<LiveCaptureStageManifest> => {
  const log = opts.log ?? ((s: string) => process.stderr.write(s));
  const filmId = opts.filmId ?? spec.meta?.id ?? '';
  if (!filmId) {
    log('[live-capture] skipped: no filmId\n');
    return {filmId: '', clips: []};
  }
  if (!opts.publicDir) {
    log('[live-capture] skipped: no publicDir (cascade ran without one)\n');
    return {filmId, clips: []};
  }
  const scenes: Scene[] = spec.scenes ?? [];
  const liveScenes: Array<{scene: LiveScene; index: number}> = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (s && isLiveScene(s)) liveScenes.push({scene: s, index: i});
  }
  if (liveScenes.length === 0) {
    // Quiet no-op — most films have zero live scenes.
    return {filmId, clips: []};
  }

  log(`[live-capture] ${liveScenes.length} scene(s) to capture\n`);

  const clipsDirAbs = join(opts.publicDir, 'clips', filmId);
  const clipsDirRel = `clips/${filmId}`;
  mkdirSync(clipsDirAbs, {recursive: true});

  const manifestPath = join(clipsDirAbs, 'live-capture-manifest.json');
  let priorManifest: LiveCapturePersistedManifest | undefined;
  if (!opts.noCache && existsSync(manifestPath)) {
    try {
      priorManifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as LiveCapturePersistedManifest;
    } catch {
      priorManifest = undefined;
    }
  }

  // Try to load Playwright. If absent, every scene is a soft miss.
  let chromium: PlaywrightChromium | null = null;
  let loadError: string | null = null;
  try {
    const loader = opts.loadPlaywright ?? defaultLoadPlaywright;
    const mod = await loader();
    chromium = mod.chromium;
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  if (!chromium) {
    log(
      `[live-capture] playwright is not available — every live-browser scene ` +
        `will fall through to the placeholder (or any previously-captured clip). ` +
        `Reason: ${loadError ?? 'unknown'}\n`,
    );
  }
  if (chromium && !ffmpegOk()) {
    log(`[live-capture] ffmpeg not found on PATH — cannot transcode webm→mp4. Skipping captures.\n`);
    chromium = null;
  }

  const clips: LiveCaptureBeatResult[] = [];
  const persisted: Record<string, LiveCapturePersistedClip> = {};

  for (const {scene, index} of liveScenes) {
    const sceneId = scene.id ?? '';
    if (!sceneId) {
      log(`[live-capture] skipping scene[${index}] — no id; cannot resolve clip path\n`);
      continue;
    }
    const wantHash = hashScene(scene);
    const targetRel = `${clipsDirRel}/live-${sceneId}.mp4`;
    const targetAbs = join(opts.publicDir, targetRel);

    // Cache check — same hash AND clip still on disk → reuse.
    const prior = priorManifest?.clips[sceneId];
    if (prior && prior.contentHash === wantHash && existsSync(targetAbs)) {
      log(`[live-capture]   ${sceneId}: cache hit (hash ${wantHash.slice(0, 8)})\n`);
      const row: LiveCaptureBeatResult = {
        sceneId,
        sceneIndex: index,
        file: prior.file,
        cached: true,
        captureSeconds: 0,
        contentHash: wantHash,
      };
      clips.push(row);
      persisted[sceneId] = {
        sceneId,
        file: prior.file,
        contentHash: wantHash,
        capturedAtMs: prior.capturedAtMs,
      };
      continue;
    }

    if (!chromium) {
      // No browser — but maybe a stale clip is on disk from a prior build.
      // We leave it in place (the render-side will play it) but DON'T claim
      // a manifest entry for it — the cache would silently lock in stale
      // bytes. The render is correct either way.
      log(
        `[live-capture]   ${sceneId}: skipped (no playwright). Render will use ` +
          `${existsSync(targetAbs) ? 'previously-captured clip on disk' : 'placeholder'}.\n`,
      );
      continue;
    }

    try {
      log(`[live-capture]   ${sceneId}: capturing ${scene.url}\n`);
      const {file, seconds} = await captureScene(scene, {
        publicDir: opts.publicDir,
        filmId,
        clipsDirAbs,
        clipsDirRel,
        chromium,
        log,
      });
      log(`[live-capture]   ${sceneId}: captured in ${seconds.toFixed(1)}s → ${file}\n`);
      const row: LiveCaptureBeatResult = {
        sceneId,
        sceneIndex: index,
        file,
        cached: false,
        captureSeconds: seconds,
        contentHash: wantHash,
      };
      clips.push(row);
      persisted[sceneId] = {
        sceneId,
        file,
        contentHash: wantHash,
        capturedAtMs: Date.now(),
      };
    } catch (e) {
      log(
        `[live-capture]   ${sceneId}: capture failed — ${e instanceof Error ? e.message : String(e)}\n` +
          `             render will fall through to the placeholder.\n`,
      );
    }
  }

  // Persist the manifest (atomic).
  const out: LiveCapturePersistedManifest = {filmId, clips: persisted};
  const tmp = `${manifestPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n');
  renameSync(tmp, manifestPath);

  return {filmId, clips, manifestPath};
};

