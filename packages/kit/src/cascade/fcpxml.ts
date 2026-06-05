// FCPXML emitter — turn a rendered docent film into a Final Cut Pro X XML
// sidecar an editor can drop into DaVinci Resolve, Final Cut Pro, or (via
// Premiere's FCPXML importer) Adobe Premiere.
//
// R11 #1. FCPXML is the lingua franca of editorial interop — Resolve,
// Premiere, and Avid (via MC Transfer) all import some flavour of it. The
// emitter here targets v1.11 of the schema (current as of 2024), which is
// the highest version Resolve 18+ accepts and the lowest version Final Cut
// Pro 11 emits. Older versions of either tool are tolerant of unknown
// elements (they degrade gracefully), so 1.11 is the sweet spot.
//
// **What this file is.** A pure XML-string emitter. Given a `FilmSpec`, a
// `FrameSchedule`, and (optionally) a TTS manifest map, it returns the XML
// body as a string. No file I/O — the CLI shell handles persistence. This
// shape means a third-party tool can `import {buildFcpxml} from
// '@bjelser/kit'` and weave it into a custom pipeline.
//
// **Design choices documented in this file:**
//
//   1. Per-scene asset-clips on V1 (not one big clip). The editor sees
//      cuts at scene boundaries, which is how a human reviewing the film
//      would scrub it. Pair with markers so the editor can navigate by
//      title. Trade-off: more `<asset-clip>` elements — but they all
//      reference the same master MP4, so it round-trips clean.
//
//   2. Per-beat audio elements on A1 (one `<asset-clip>` per beat). Each
//      beat's TTS clip becomes its own clip — the editor can mute, slip,
//      or replace one line without touching the rest. Mirrors how a
//      narrator's "alternate take" is handled in any audio post tool.
//
//   3. Absolute file URLs for asset src (`file:///abs/path`). FCPXML
//      accepts relative paths only when the library file lives next to
//      the media; since we emit a sidecar the editor moves into their
//      own library, absolute paths survive that move. Editors who want
//      portability can re-link inside their tool.
//
//   4. `<chapter-marker>` over `<marker>` for scene boundaries — Resolve
//      shows chapter markers in the Edit timeline AND the Color page
//      timeline (regular markers only show in Edit). Big-idea markers
//      use the standard `<marker>` with `completed="0"` so they appear
//      as orange "to-do" pips.
//
// **Inline marker derivation.** R11.3 (in flight) will define a shared
// `EditorialMarker` type + `enumerateMarkers(spec, schedule)` at
// `packages/kit/src/types/editorial.ts`. When that lands, this file's
// `deriveMarkers` should delegate to it. For now we derive inline so the
// two work-streams don't block each other.

import type {FilmSpec, Scene, Beat} from '../types/spec';
import type {FrameSchedule, SceneSchedule, BeatSchedule, TtsAudioMap} from '../remotion/schedule';

// ---------- public surface ---------------------------------------------------

export interface BuildFcpxmlOptions {
  /**
   * Absolute path to the rendered MP4 (e.g. `/abs/out/<id>.mp4`). Required —
   * the editor needs a media reference. The emitter does NOT probe the file
   * to verify it exists (that's the caller's job); it just wraps the path in
   * a `file://` URL.
   */
  readonly videoPath: string;
  /**
   * Map of `<sceneIndex>-<beatIndex>` -> absolute path of that beat's
   * TTS audio clip. When omitted, no per-beat audio clips are emitted (the
   * timeline still gets the master video clip + markers, just no separate
   * narration A1). This is the same shape `TtsAudioMap` uses; the CLI shell
   * resolves the manifest entries' relative `audio/<id>/beat-N-M.wav` paths
   * against the project's `public/` dir to make them absolute.
   */
  readonly audioPaths?: Readonly<Record<`${number}-${number}`, string>>;
  /**
   * Optional event title shown in the FCP library browser. Defaults to the
   * film's title. Visible only inside the editor; no effect on the
   * timeline.
   */
  readonly eventName?: string;
  /**
   * Optional library URL recorded as `<library location="…">`. Most editors
   * ignore it on import (the file IS the library reference); we set it to
   * the sidecar's own absolute path when the CLI provides one, so re-saves
   * round-trip.
   */
  readonly libraryLocation?: string;
}

// ---------- marker model -----------------------------------------------------

/**
 * Internal marker shape — what gets rendered into the spine. Reach for this
 * via `deriveMarkers(spec, schedule)`. R11.3 will replace the inline
 * derivation with a shared enumerator.
 */
interface InlineMarker {
  readonly startFrame: number;
  /** Always 1 frame — markers are points, not regions. */
  readonly frames: number;
  readonly label: string;
  /** `chapter` = scene boundary (blue, full-timeline nav). `marker` = beat or big-idea. */
  readonly kind: 'chapter' | 'marker';
  /** Highlight a big-idea marker (tension/recap/closeup) in orange "to-do" state. */
  readonly bigIdea: boolean;
  /**
   * Which scene owns this marker. The spine emits one `<asset-clip>` per
   * scene; FCPXML attaches each marker to a clip, and since adjacent
   * scenes overlap during a cross-fade transition we can't disambiguate
   * by frame-window alone. The owner index is the truth.
   */
  readonly ownerSceneIndex: number;
}

// ---------- the builder ------------------------------------------------------

/**
 * Build an FCPXML 1.11 document body for a rendered film.
 *
 * The shape:
 *   - One `<format>` resource (declares fps + width + height).
 *   - One `<asset>` per media file (video master + each beat's audio).
 *   - A single `<library>` -> `<event>` -> `<project>` -> `<sequence>` ->
 *     `<spine>`.
 *   - Inside the spine: per-scene `<asset-clip>` elements on V1 (lane 0),
 *     with per-beat audio `<asset-clip>` elements connected to the V1
 *     clip on lane -1 (FCP convention: negative lanes = audio under
 *     the primary video).
 *   - Scene markers (`<chapter-marker>`) attached to the V1 clip at each
 *     scene boundary; beat markers + big-idea markers (`<marker>`)
 *     attached at their respective frames.
 *
 * Returns the complete XML string with the `<?xml … ?>` declaration and
 * the DOCTYPE.
 */
export const buildFcpxml = (
  spec: FilmSpec,
  schedule: FrameSchedule,
  opts: BuildFcpxmlOptions,
): string => {
  const fps = schedule.fps;
  const fpsRational = toRational(fps);
  const totalSeconds = schedule.totalFrames / fps;

  // ---------- resources ----------
  const formatId = 'r1';
  const format = `    <format id="${formatId}" name="FFVideoFormat${schedule.width}x${schedule.height}p${formatRateName(fps)}" frameDuration="${fpsRational.flipDuration}" width="${schedule.width}" height="${schedule.height}" colorSpace="1-1-1 (Rec. 709)"/>`;

  const videoAssetId = 'r2';
  const videoAsset = renderVideoAsset(videoAssetId, formatId, opts.videoPath, schedule);

  const audioAssets: string[] = [];
  // Map per-beat to assetId so the spine references them by id.
  const beatAssetIds: Record<string, string> = {};
  let nextResourceId = 3; // r1, r2 already taken
  if (opts.audioPaths) {
    for (const sceneSched of schedule.scenes) {
      for (const beat of sceneSched.beats) {
        const key = `${sceneSched.sceneIndex}-${beat.beatIndex}` as const;
        const absPath = opts.audioPaths[key];
        if (!absPath) continue;
        const assetId = `r${nextResourceId++}`;
        beatAssetIds[key] = assetId;
        audioAssets.push(renderAudioAsset(assetId, absPath, beat.frames, fps));
      }
    }
  }

  const resources =
    `  <resources>\n` +
    `${format}\n` +
    `${videoAsset}\n` +
    (audioAssets.length > 0 ? audioAssets.join('\n') + '\n' : '') +
    `  </resources>`;

  // ---------- spine ----------
  const markers = deriveMarkers(spec, schedule);

  const sceneClips: string[] = [];
  for (const sceneSched of schedule.scenes) {
    sceneClips.push(
      renderSceneClip(
        sceneSched,
        videoAssetId,
        formatId,
        fps,
        opts.audioPaths,
        beatAssetIds,
        markers,
        schedule.scenes.length,
      ),
    );
  }

  const projectName = escapeXml(spec.meta.title || spec.meta.id);
  const eventName = escapeXml(opts.eventName ?? spec.meta.title ?? spec.meta.id);
  const libAttr = opts.libraryLocation
    ? ` location="${escapeXmlAttr(pathToFileUrl(opts.libraryLocation))}"`
    : '';

  // sequence duration: total in fps-rational form
  const seqDuration = framesToRational(schedule.totalFrames, fps);

  // The body:
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE fcpxml>\n` +
    `<fcpxml version="1.11">\n` +
    `${resources}\n` +
    `  <library${libAttr}>\n` +
    `    <event name="${eventName}">\n` +
    `      <project name="${projectName}">\n` +
    `        <sequence format="${formatId}" duration="${seqDuration}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">\n` +
    `          <spine>\n` +
    sceneClips.join('\n') +
    `\n          </spine>\n` +
    `        </sequence>\n` +
    `      </project>\n` +
    `    </event>\n` +
    `  </library>\n` +
    `</fcpxml>\n`;

  // Sanity: total seconds in a comment at the head so a human eyeballing
  // the file can spot a unit-error immediately. XML comments live OUTSIDE
  // the prolog; we put it AFTER the DOCTYPE and before the root.
  // (Some validators reject comments before the root in strict mode; we
  // skip the header comment to stay clean.)
  void totalSeconds;
  return body;
};

// ---------- resources --------------------------------------------------------

const renderVideoAsset = (
  id: string,
  formatId: string,
  absPath: string,
  schedule: FrameSchedule,
): string => {
  const duration = framesToRational(schedule.totalFrames, schedule.fps);
  const url = pathToFileUrl(absPath);
  return (
    `    <asset id="${id}" name="${escapeXmlAttr(basename(absPath))}" uid="${stableUid(absPath)}" ` +
    `start="0s" duration="${duration}" ` +
    `hasVideo="1" hasAudio="1" videoSources="1" audioSources="1" audioChannels="2" audioRate="48000" ` +
    `format="${formatId}">\n` +
    `      <media-rep kind="original-media" src="${escapeXmlAttr(url)}"/>\n` +
    `    </asset>`
  );
};

const renderAudioAsset = (
  id: string,
  absPath: string,
  beatFrames: number,
  fps: number,
): string => {
  // Beat's video-frame window is the upper bound on the audio length we
  // attribute to the asset; the actual file may be shorter (TAIL silence
  // is added by the schedule, not the audio file). FCP doesn't mind an
  // asset duration that's longer than the on-disk audio; the clip's
  // `duration` attribute on the spine clip is what bounds playback.
  const duration = framesToRational(beatFrames, fps);
  const url = pathToFileUrl(absPath);
  return (
    `    <asset id="${id}" name="${escapeXmlAttr(basename(absPath))}" uid="${stableUid(absPath)}" ` +
    `start="0s" duration="${duration}" ` +
    `hasVideo="0" hasAudio="1" audioSources="1" audioChannels="1" audioRate="48000">\n` +
    `      <media-rep kind="original-media" src="${escapeXmlAttr(url)}"/>\n` +
    `    </asset>`
  );
};

// ---------- spine: per-scene clips -------------------------------------------

const renderSceneClip = (
  sceneSched: SceneSchedule,
  videoAssetId: string,
  formatId: string,
  fps: number,
  audioPaths: BuildFcpxmlOptions['audioPaths'],
  beatAssetIds: Record<string, string>,
  markers: ReadonlyArray<InlineMarker>,
  totalScenes: number,
): string => {
  void formatId;
  void totalScenes;
  const offsetInSpine = framesToRational(sceneSched.startFrame, fps);
  const duration = framesToRational(sceneSched.frames, fps);
  // The asset-clip's `start` is the SOURCE-side offset into the master MP4 —
  // it should mirror the scene's spine offset so each scene clip plays the
  // matching slice of the master.
  const startInSource = framesToRational(sceneSched.startFrame, fps);

  const sceneTitle = escapeXmlAttr(
    sceneTitleFor(sceneSched.scene, sceneSched.sceneIndex),
  );

  // Markers attached to this scene's clip — keyed by ownership, not by
  // frame range. Adjacent scenes overlap during cross-fade transitions,
  // so a frame-range filter would double-attribute boundary markers.
  const inThisScene = markers.filter((m) => m.ownerSceneIndex === sceneSched.sceneIndex);
  const markerXml = inThisScene
    .map((m) => renderMarker(m, sceneSched.startFrame, fps))
    .join('\n');

  // Per-beat audio asset-clips, attached as connected clips on negative
  // lanes (lane="-1" places them on A1 in FCP). Each beat's `offset` is
  // its own spine-time; FCP expects connected clips' offsets to be
  // spine-time relative to the PARENT clip's source start.
  const audioClips: string[] = [];
  if (audioPaths) {
    for (const beat of sceneSched.beats) {
      const key = `${sceneSched.sceneIndex}-${beat.beatIndex}` as const;
      const assetId = beatAssetIds[key];
      if (!assetId) continue;
      const beatOffset = framesToRational(beat.startFrame, fps);
      const beatDuration = framesToRational(beat.frames, fps);
      const beatName = escapeXmlAttr(
        beatNameFor(beat.beat, sceneSched.sceneIndex, beat.beatIndex),
      );
      audioClips.push(
        `              <asset-clip ref="${assetId}" lane="-1" offset="${beatOffset}" name="${beatName}" duration="${beatDuration}" audioRole="dialogue"/>`,
      );
    }
  }

  const inner = [markerXml, audioClips.join('\n')].filter((s) => s.length > 0).join('\n');

  return (
    `            <asset-clip ref="${videoAssetId}" offset="${offsetInSpine}" name="${sceneTitle}" ` +
    `start="${startInSource}" duration="${duration}" tcFormat="NDF" audioRole="dialogue">\n` +
    (inner.length > 0 ? inner + '\n' : '') +
    `            </asset-clip>`
  );
};

const renderMarker = (m: InlineMarker, sceneStartFrame: number, fps: number): string => {
  // FCP markers' `start` attribute is RELATIVE to the parent clip's
  // source-side start. Our clips use `start == sceneStartFrame`, so the
  // marker's source-time = its absolute frame.
  void sceneStartFrame;
  const startTime = framesToRational(m.startFrame, fps);
  const duration = framesToRational(Math.max(1, m.frames), fps);
  const label = escapeXmlAttr(m.label);
  if (m.kind === 'chapter') {
    return `              <chapter-marker start="${startTime}" duration="${duration}" value="${label}"/>`;
  }
  // Big-idea markers ride the standard `<marker>` with completed="0" so
  // FCP/Resolve show them as orange "to-do" pips. Beat markers ride a
  // completed-state marker (gray pip).
  const completedAttr = m.bigIdea ? ' completed="0"' : '';
  return `              <marker start="${startTime}" duration="${duration}" value="${label}"${completedAttr}/>`;
};

// ---------- marker derivation (inline; R11.3 will subsume) -------------------

/**
 * Inline marker derivation. R11.3 (in flight) will provide a shared
 * `enumerateMarkers(spec, schedule)` at `packages/kit/src/types/editorial.ts`
 * that yields a closed `EditorialMarker[]`; this function should delegate
 * to it once both land.
 *
 * Rules (per the R11.1 spec):
 *   - Scene marker at each scene's start frame (chapter, label = title|kind).
 *   - Beat marker at each beat's start frame (marker, label = first ~30
 *     chars of narration).
 *   - Big-idea marker at the start of any scene whose kind ∈ {tension,
 *     recap, closeup} (marker, orange/completed=0).
 */
export const deriveMarkers = (
  spec: FilmSpec,
  schedule: FrameSchedule,
): ReadonlyArray<InlineMarker> => {
  const markers: InlineMarker[] = [];
  const BIG_IDEA_KINDS = new Set(['tension', 'recap', 'closeup']);

  for (const sceneSched of schedule.scenes) {
    const scene = sceneSched.scene;
    const isBigIdea = BIG_IDEA_KINDS.has(scene.type);

    // Scene chapter marker.
    markers.push({
      startFrame: sceneSched.startFrame,
      frames: 1,
      label: sceneTitleFor(scene, sceneSched.sceneIndex),
      kind: 'chapter',
      bigIdea: false,
      ownerSceneIndex: sceneSched.sceneIndex,
    });

    // Big-idea marker — overlays the chapter so FCP shows both pips.
    if (isBigIdea) {
      markers.push({
        startFrame: sceneSched.startFrame,
        frames: 1,
        label: `★ ${scene.type.toUpperCase()}`,
        kind: 'marker',
        bigIdea: true,
        ownerSceneIndex: sceneSched.sceneIndex,
      });
    }

    // Beat markers — gray pips on each beat boundary.
    for (const beatSched of sceneSched.beats) {
      const narration = (beatSched.beat.narration ?? '').trim();
      const labelBase = narration.length > 0
        ? truncate(narration, 30)
        : `beat-${sceneSched.sceneIndex}-${beatSched.beatIndex}`;
      markers.push({
        startFrame: beatSched.startFrame,
        frames: 1,
        label: labelBase,
        kind: 'marker',
        bigIdea: false,
        ownerSceneIndex: sceneSched.sceneIndex,
      });
    }
  }

  void spec; // reserved for richer R11.3 derivation
  return markers;
};

// ---------- naming helpers ---------------------------------------------------

const sceneTitleFor = (scene: Scene, index: number): string => {
  // Try canonical fields by order of authority: scene.id > scene.title >
  // scene.type. The kit's `Scene` is intentionally open, so we sniff
  // optional fields off the index-signature without strong typing.
  const open = scene as Scene & {title?: unknown};
  if (typeof open.title === 'string' && open.title.length > 0) return open.title;
  if (typeof scene.id === 'string' && scene.id.length > 0) return scene.id;
  return `${index + 1}. ${scene.type}`;
};

const beatNameFor = (beat: Beat, sceneIndex: number, beatIndex: number): string => {
  if (typeof beat.id === 'string' && beat.id.length > 0) return beat.id;
  const narration = (beat.narration ?? '').trim();
  if (narration.length > 0) return truncate(narration, 30);
  return `beat-${sceneIndex}-${beatIndex}`;
};

const truncate = (s: string, max: number): string => {
  const clean = s.replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + '…';
};

// ---------- timing helpers ---------------------------------------------------

interface FpsRational {
  /** `frameDuration` attribute — one frame as `<n>/<d>s` (e.g. `1001/30000s`). */
  readonly flipDuration: string;
  readonly num: number;
  readonly den: number;
}

/**
 * Convert an fps value to its frame-duration rational. The FCPXML
 * specification uses RATIONAL `<n>/<d>s` time everywhere — this is what
 * keeps NTSC drop-frame and 24p film honestly representable.
 *
 * Common fps map:
 *   29.97 -> 1001/30000  (NTSC)
 *   23.976 -> 1001/24000 (film over NTSC)
 *   30    -> 100/3000  (integer; we use 100/3000 to match FCP's preferred form)
 *   24    -> 100/2400
 *   25    -> 100/2500  (PAL)
 *   60    -> 100/6000
 */
const toRational = (fps: number): FpsRational => {
  // The 29.97 / 23.976 NTSC family — represent via the 1001-numerator form
  // so FCP's drop-frame math reads cleanly.
  if (Math.abs(fps - 29.97) < 0.01) return {flipDuration: '1001/30000s', num: 1001, den: 30000};
  if (Math.abs(fps - 23.976) < 0.01) return {flipDuration: '1001/24000s', num: 1001, den: 24000};
  if (Math.abs(fps - 59.94) < 0.01) return {flipDuration: '1001/60000s', num: 1001, den: 60000};
  // Integer-fps families: use a 100x denominator so consistent with FCP.
  const den = Math.round(fps) * 100;
  return {flipDuration: `100/${den}s`, num: 100, den};
};

/**
 * Format the FCPXML `format` resource's `name` attribute — FCP recognises
 * `FFVideoFormat1920x1080p30` etc. as preset names (so the import dialog
 * doesn't pop a "no format match" warning).
 */
const formatRateName = (fps: number): string => {
  if (Math.abs(fps - 29.97) < 0.01) return '2997';
  if (Math.abs(fps - 23.976) < 0.01) return '2398';
  if (Math.abs(fps - 59.94) < 0.01) return '5994';
  return String(Math.round(fps));
};

/**
 * Convert a frame count to FCPXML rational time at the given fps. Output
 * is `(frames * num) / den` simplified, in the canonical `<n>/<d>s`
 * format. A 0-frame value is the literal `0s` (FCP shorthand).
 */
export const framesToRational = (frames: number, fps: number): string => {
  if (frames === 0) return '0s';
  const r = toRational(fps);
  const num = frames * r.num;
  const den = r.den;
  // Reduce the fraction so FCP doesn't choke on a 6-digit num/den it
  // could simplify itself. GCD via the Euclidean algorithm.
  const g = gcd(num, den);
  return `${num / g}/${den / g}s`;
};

const gcd = (a: number, b: number): number => {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x || 1;
};

// ---------- path / url / xml helpers -----------------------------------------

/**
 * Convert an absolute filesystem path to a `file://` URL. FCPXML's
 * `media-rep src` attribute accepts file URLs; absolute paths without a
 * scheme are rejected by some importers (Resolve in particular).
 *
 * On Windows, the form is `file:///C:/path/to/file`; we don't try to be
 * Windows-correct here (the engine is dev-on-macOS), but the algorithm
 * tolerates the slashes.
 */
export const pathToFileUrl = (absPath: string): string => {
  if (absPath.startsWith('file://')) return absPath;
  // Normalize backslashes to forward (Windows defensive).
  const norm = absPath.replace(/\\/g, '/');
  // Encode each segment to handle spaces / unicode.
  const encoded = norm
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  // On a POSIX absolute path the leading `/` becomes an empty first
  // segment, so encodedPath starts with `/` already; prefix `file://`.
  return `file://${encoded}`;
};

const basename = (p: string): string => {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? p;
};

/**
 * Stable per-asset UID. FCPXML's `asset uid` field is opaque — Final Cut
 * Pro generates a UUID v4 there, but any stable string is accepted. We
 * derive a deterministic hex digest from the path so re-emits of the same
 * file produce the same UID (cleaner version-control round-trip if the
 * sidecar is checked in).
 */
const stableUid = (s: string): string => {
  // Tiny non-cryptographic hash (FNV-1a 32-bit) — formatted as 8 hex chars.
  // The UID doesn't need to be unique across the universe, just inside
  // this FCPXML document.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hex = (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
  // Format as a faux-UUID so editors that pattern-match on dashes are
  // happy: `XXXXXXXX-0000-0000-0000-000000000000`.
  return `${hex}-0000-0000-0000-000000000000`;
};

/**
 * XML attribute value escape. The five XML-mandated entities. We DO NOT
 * leave bare ampersands, less-than, or quotes — any of which would break
 * an importer's parser.
 */
const escapeXmlAttr = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Re-export the FrameSchedule + TtsAudioMap types for downstream third-party
// callers — keeps the kit-public surface self-contained.
export type {FrameSchedule, TtsAudioMap, SceneSchedule, BeatSchedule} from '../remotion/schedule';
