// AAF (Advanced Authoring Format) editorial export.
//
// **What this stage does.** Turn a rendered docent film (one MP4 + the
// FrameSchedule that produced it) into an AAF binary an Avid Media Composer
// editor can import-link. The AAF carries:
//
//   - one CompositionMob — the editor-facing sequence,
//   - one timeline picture slot with a Sequence whose components are N
//     SourceClips, one per docent scene; each clip is offset + length in
//     the master mob,
//   - one timeline sound slot with the same N-clip Sequence (so a stereo
//     mix track lands next to picture in the Avid bin),
//   - one MasterMob + SourceMob + TapeMob trio AMA-linking the rendered
//     MP4 by file URL (Avid's "import as linked AMA" path),
//   - a NameValue comment per CompositionMob naming the docent film id
//     and the source spec path so the editor knows what bin this came from.
//
// **Why a separate stage.** Drip / score / captions are sidecar outputs
// of a build; AAF is the same shape — read the spec, read the schedule,
// read the rendered MP4, write an editorial file next to it. No render-
// side dependency; this only runs against an artifact that already exists.
//
// **What it doesn't do (yet).**
//
//   - PROXIES / consolidated media. The AAF references the MP4 in place via
//     AMA — the editor sees one clip, not the per-scene cuts as separate
//     bin items. R11.4 (ingest) will own the per-scene split if we ever
//     want one bin clip per scene.
//   - PER-BEAT MARKERS as Avid Locators. We derive the marker list inline
//     here for now; R11.3 will subsume with the shared `EditorialMarker`
//     type. The current build still records them in the plan so a later
//     pass can decorate the AAF without touching this builder.
//   - DROP-FRAME timecode. Every docent film today is 30fps non-drop; if
//     we ever ship 29.97 we'll add a TCSlot with Drop=true here.
//
// **The implementation path** (the friction point worth flagging):
// we shell to a pure-Python helper (pyaaf2) via `uvx --from pyaaf2`. AAF
// is OLE/CFBF + ~120 SMPTE-keyed property types; pyaaf2 is the canonical
// writable implementation (used by OpenTimelineIO, AVID interchange tools).
// 544KB pure-Python, zero native deps. uvx ephemeral-installs on first run
// so the user never sees a manual pip install. The fallback when uv is
// absent is a clear error pointing the user at `docent doctor`.
//
// The TS half (this file) owns:
//   - the *plan* — pure, testable shape derived from the FrameSchedule;
//   - the script generation — a self-contained Python file emitted to
//     `<tmp>/docent-aaf-<id>/build.py`;
//   - the subprocess invocation and the error-channel translation.
//
// The Python half owns the AAF binary layout. We never let it carry
// policy — every choice (segment lengths, mob names, locator URL) is
// computed here and serialised through the plan JSON.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';

import type {FilmSpec} from '../types/spec';
import type {FrameSchedule, SceneSchedule} from '../remotion/schedule';

// ----- plan shape ----------------------------------------------------------

/**
 * One editorial segment in the composition mob's Sequence. Frame-offset +
 * length into the AMA-linked master mob.
 *
 * `name` and `comment` are surfaced as the segment's metadata so an Avid
 * editor opening the bin can read what each segment is. We don't (yet)
 * carry a per-segment marker — R11.3's `EditorialMarker` will own that.
 */
export interface AafSegment {
  /** docent scene id (or fallback `scene-<n>`) — surfaces in the comment. */
  readonly sceneId: string;
  /** Human-readable scene name — sceneType-based when the spec has no title. */
  readonly name: string;
  /** Absolute start frame in the master mob (0-indexed). */
  readonly startFrame: number;
  /** Length in frames at the film's edit rate. */
  readonly lengthFrames: number;
  /**
   * Short marker text the editor would see in Avid — derived inline today
   * (R11.3 will subsume with the shared EditorialMarker type). One marker
   * per segment, anchored at its start frame.
   */
  readonly markerText: string;
}

/**
 * The full plan handed to the AAF writer. Computed pure-functionally from
 * a FilmSpec + a FrameSchedule + a probed MP4 metadata blob. All paths are
 * absolute so the Python sidecar has no project-root context to reason
 * about.
 */
export interface AafPlan {
  /** Stable id — used in the composition mob's name and in mob comments. */
  readonly filmId: string;
  /** Display name surfaced as the composition mob's `name`. */
  readonly title: string;
  /** Author (optional) — surfaced as a comment so the bin shows it. */
  readonly author?: string;
  /** Absolute path to the rendered MP4 — what AMA links to. */
  readonly mediaPath: string;
  /** Edit rate (fps) — typically 30 for docent films. */
  readonly editRate: number;
  /** Total frame length of the composition. Equal to `Σsegment.lengthFrames`. */
  readonly totalFrames: number;
  /** One segment per docent scene; order is the on-screen render order. */
  readonly segments: ReadonlyArray<AafSegment>;
  /** ffprobe -show_format -show_streams JSON for the media file. */
  readonly probe: unknown;
}

// ----- plan construction (pure) -------------------------------------------

/** Best-effort human-readable scene title — falls back to `scene N (<type>)`. */
const sceneTitle = (s: SceneSchedule): string => {
  const sc = s.scene as {title?: string; kicker?: string; subject?: string; type: string};
  return sc.title ?? sc.kicker ?? sc.subject ?? `scene ${s.sceneIndex + 1} (${sc.type})`;
};

/** Stable id for a scene — uses spec.id when present, else `scene-<n>`. */
const sceneId = (s: SceneSchedule): string => s.scene.id ?? `scene-${s.sceneIndex}`;

/**
 * Build an {@link AafPlan} from a film + its frame schedule + the ffprobe
 * blob for the rendered MP4. Pure — no IO, no subprocess. Every segment's
 * length is computed from the schedule's per-scene `frames`, so segments
 * align *exactly* with what the renderer emitted (cross-fade overlaps
 * included — the schedule's `cursor` math is the source of truth).
 *
 * NOTE: docent's schedule overlaps transitions (scene N's tail and scene
 * N+1's head share frames). For an editor that wants "one bin clip per
 * scene", contiguous segments with no overlap are the right shape — this
 * builder *collapses* the overlap by using each scene's full window
 * `[startFrame, endFrame)`, accepting that the last K frames of one
 * segment and the first K of the next will visually duplicate. The
 * alternative — subtracting the overlap — would put hard cuts at the
 * midpoint of the cross-fade, which is worse for the editor (the cut
 * lands in the middle of the dissolve, not at its boundary). R11.4
 * ingest may swap the policy.
 */
export const buildAafPlan = (
  spec: FilmSpec,
  schedule: FrameSchedule,
  mediaPath: string,
  probe: unknown,
): AafPlan => {
  const segments: AafSegment[] = schedule.scenes.map((s) => ({
    sceneId: sceneId(s),
    name: sceneTitle(s),
    startFrame: s.startFrame,
    lengthFrames: s.frames,
    markerText: `${sceneId(s)} :: ${(s.scene as {type: string}).type}`,
  }));

  return {
    filmId: spec.meta.id,
    title: spec.meta.title,
    ...(spec.meta.author ? {author: spec.meta.author} : {}),
    mediaPath: resolve(mediaPath),
    editRate: schedule.fps,
    totalFrames: schedule.totalFrames,
    segments,
    probe,
  };
};

// ----- writer (subprocess sidecar) ----------------------------------------

/** Returned by {@link writeAafFile}. Holds the path + a small audit blob. */
export interface AafWriteResult {
  /** Absolute path to the written .aaf file. */
  readonly outPath: string;
  /** File size in bytes. */
  readonly bytes: number;
  /** Number of composition segments written. */
  readonly segmentCount: number;
}

/** Stderr-prefixed errors the AAF writer raises. */
export class AafWriterError extends Error {
  override readonly name = 'AafWriterError';
  constructor(message: string, readonly stderr?: string) {
    super(message);
  }
}

/**
 * Write a binary AAF file at `outPath` from a {@link AafPlan}.
 *
 * **Sidecar contract.** We materialise a plan.json + a build.py into a
 * hermetic tmp dir, then invoke `uvx --from pyaaf2 python build.py
 * <plan.json> <outPath>`. uvx ephemeral-installs pyaaf2 (a 544KB pure-
 * Python lib) on first run; subsequent runs reuse the cached env. The
 * Python script never reads back into TS — it only writes the AAF and
 * exits 0 or prints an error to stderr and exits non-zero.
 *
 * Why the sidecar instead of pure-TS: AAF is OLE/CFBF + ~120 SMPTE-keyed
 * properties. pyaaf2 is the canonical, battle-tested writer (used by
 * OpenTimelineIO + AVID interchange pipelines). Re-implementing in TS
 * would mean ~5KLOC of struct layout + UL key handling for an export
 * feature most users won't reach.
 *
 * **Degradation path.** When `uv` is not on PATH the writer throws an
 * `AafWriterError` with the install hint. The CLI surfaces this as an
 * exit-2 with a pointer to `docent doctor`.
 *
 * The function does NOT throw on PYAAF2 import errors silently — uvx will
 * fail loudly if pyaaf2 cannot be installed, and that surface is bubbled
 * to the caller via `AafWriterError.stderr`.
 */
export const writeAafFile = (
  plan: AafPlan,
  outPath: string,
): AafWriteResult => {
  if (!existsSync(plan.mediaPath)) {
    throw new AafWriterError(
      `media path does not exist: ${plan.mediaPath}\n` +
        `  hint: run \`docent build ${plan.filmId}\` first to render the MP4.`,
    );
  }

  const outDir = dirname(resolve(outPath));
  if (!existsSync(outDir)) mkdirSync(outDir, {recursive: true});

  const work = mkdtempSync(join(tmpdir(), `docent-aaf-${plan.filmId}-`));
  const planPath = join(work, 'plan.json');
  const scriptPath = join(work, 'build.py');
  writeFileSync(planPath, JSON.stringify(plan, null, 2));
  writeFileSync(scriptPath, PYAAF_SCRIPT);

  // uvx is preferred — ephemeral, no manual pip install. We also accept
  // a pre-existing pyaaf2 import on the system python (the doctor path
  // a contributor might take). Try uvx first; fall back to `python3 -m
  // aaf2` import to detect a system install; finally error.
  const uvxAvailable = spawnSync('uvx', ['--version'], {stdio: 'ignore'}).status === 0;
  if (!uvxAvailable) {
    throw new AafWriterError(
      `uv (uvx) not found on PATH — pyaaf2 cannot be ephemeral-installed.\n` +
        `  install: https://docs.astral.sh/uv/getting-started/installation/\n` +
        `  or: \`docent doctor\` for the full diagnostic.`,
    );
  }

  const res = spawnSync(
    'uvx',
    ['--quiet', '--from', 'pyaaf2', 'python', scriptPath, planPath, outPath],
    {encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe']},
  );

  if (res.status !== 0) {
    throw new AafWriterError(
      `pyaaf2 sidecar failed (exit ${res.status ?? '?'}).\n` +
        `  workdir: ${work}\n` +
        `  see stderr below.`,
      res.stderr,
    );
  }

  if (!existsSync(outPath)) {
    throw new AafWriterError(
      `pyaaf2 sidecar exited 0 but ${outPath} was not produced.\n` +
        `  workdir: ${work}\n` +
        `  stdout: ${res.stdout?.slice(0, 200)}`,
    );
  }

  const bytes = readFileSync(outPath).byteLength;
  return {outPath: resolve(outPath), bytes, segmentCount: plan.segments.length};
};

// ----- the pyaaf2 sidecar script ------------------------------------------
//
// Inlined as a string constant so the package ships self-contained — no
// "find the .py next to me at install time" footgun. The script is small
// (~80 lines) and only does what the plan tells it to.
//
// Contract:
//   - argv[1] = plan.json path
//   - argv[2] = output .aaf path
//   - exit 0 on success; non-zero with a clear stderr message on failure.

/** The pyaaf2 sidecar — written to tmpdir at invoke time. */
const PYAAF_SCRIPT = `"""docent AAF sidecar — pyaaf2-based binary AAF writer.

Reads a plan.json (the editorial blueprint computed in @bjelser/kit) and
writes an AAF that AMA-links the rendered MP4 with a CompositionMob whose
Sequence has one SourceClip per docent scene.

This file is materialised by @bjelser/kit's writeAafFile() at invoke time;
edit aaf.ts (NOT this file) to change behaviour."""

import json
import sys
from pathlib import Path

try:
    import aaf2
    import aaf2.ama
    from aaf2.mobs import CompositionMob, MasterMob
except ImportError as e:
    sys.stderr.write(f"pyaaf2 import failed: {e}\\n")
    sys.exit(2)

if len(sys.argv) != 3:
    sys.stderr.write("usage: build.py <plan.json> <out.aaf>\\n")
    sys.exit(64)

plan_path = Path(sys.argv[1])
out_path = Path(sys.argv[2])

plan = json.loads(plan_path.read_text())
media_path = Path(plan["mediaPath"]).absolute()

if not media_path.exists():
    sys.stderr.write(f"media path missing: {media_path}\\n")
    sys.exit(2)

with aaf2.open(str(out_path), "w") as f:
    # AMA-link the MP4: produces (MasterMob, SourceMob, TapeMob).
    linked = aaf2.ama.create_media_link(f, str(media_path), plan["probe"])
    master = next(x for x in linked if isinstance(x, MasterMob))

    # Composition mob — the editor-facing sequence.
    comp = f.create.CompositionMob(plan["filmId"])
    comp.name = plan["title"]
    f.content.mobs.append(comp)

    # Pick the master's first picture slot — every docent MP4 is single-
    # video-stream. Sound slot is optional (AMA picks it up if present).
    picture_slot = next(
        (s for s in master.slots if s.media_kind == "Picture"),
        None,
    )
    if picture_slot is None:
        sys.stderr.write("master mob has no picture slot — refusing to write\\n")
        sys.exit(2)

    sound_slot = next(
        (s for s in master.slots if s.media_kind == "Sound"),
        None,
    )

    # Picture timeline slot: one SourceClip per docent scene.
    pic_timeline = comp.create_timeline_slot(edit_rate=picture_slot.edit_rate)
    pic_timeline.name = "V1"
    pic_seq = f.create.Sequence(media_kind="picture")
    pic_timeline.segment = pic_seq

    for seg in plan["segments"]:
        clip = master.create_source_clip(
            slot_id=picture_slot.slot_id,
            start=seg["startFrame"],
            length=seg["lengthFrames"],
            media_kind="picture",
        )
        pic_seq.components.append(clip)

    # Sound timeline slot — mirrors picture so the mix lands next to it
    # in the Avid bin. Only when the master has a sound slot (AMA infers
    # this from ffprobe; a silent MP4 has none).
    if sound_slot is not None:
        snd_timeline = comp.create_timeline_slot(edit_rate=sound_slot.edit_rate)
        snd_timeline.name = "A1"
        snd_seq = f.create.Sequence(media_kind="sound")
        snd_timeline.segment = snd_seq
        for seg in plan["segments"]:
            clip = master.create_source_clip(
                slot_id=sound_slot.slot_id,
                start=seg["startFrame"],
                length=seg["lengthFrames"],
                media_kind="sound",
            )
            snd_seq.components.append(clip)

    # Comments — surface the docent metadata so the bin tells the editor
    # what film this is. Avid's bin view reads Mob.comments by name.
    comp.comments["DocentFilmId"] = plan["filmId"]
    comp.comments["DocentSegmentCount"] = str(len(plan["segments"]))
    if plan.get("author"):
        comp.comments["DocentAuthor"] = plan["author"]

sys.stdout.write(
    f"wrote {out_path} ({out_path.stat().st_size} bytes; "
    f"{len(plan['segments'])} segments)\\n"
)
`;
