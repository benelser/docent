#!/usr/bin/env python3
"""docent TTS stage — render every beat's narration to speech with Kokoro.

This stage is deliberately decoupled from rendering (the lesson from v1, where
manim-voiceover coupled the two and deadlocked under concurrency). It writes
``public/audio/<film>/<beat>.mp3`` plus a manifest of durations; the Remotion
engine reads that manifest to time every scene.

Cached by default: a beat whose mp3 already exists is reused. Pass --force to
re-render. Independent beats render in parallel worker processes.

Per-beat rhythm metrics — wordCount, clipSeconds, wpm, leadingSilenceMs,
trailingSilenceMs, pace — are recorded into the manifest so downstream rules
can grade narration rhythm (depthcheck `narration-rhythm`). The schema is
additive: older manifests without the rhythm fields still load.

By default, leading and trailing silence are trimmed inline per beat's `pace`
knob — Kokoro routinely emits a few hundred ms of trailing silence which,
stacked on the engine's per-beat TAIL breath, produces an "awkward pause"
between beats. The trim ceiling is intentionally conservative (we KEEP a
floor of speech-shaped breath) and `pace: hold` opts out entirely. Set
``DOCENT_TTS_NO_TRIM=1`` to disable the trim — used to capture the
pre-fix metric baseline.

Usage:  uv run python pipeline/tts.py --film codex [--workers N] [--force]
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

def _repo_root() -> Path:
    """Root holding films/ and public/. The docent CLI sets DOCENT_ROOT; fall
    back to walking up to the .git dir so the script also runs standalone."""
    env = os.environ.get("DOCENT_ROOT")
    if env:
        return Path(env).resolve()
    here = Path(__file__).resolve()
    for p in [here, *here.parents]:
        if (p / ".git").exists():
            return p
    return here.parent.parent


ROOT = _repo_root()
SAMPLE_RATE = 24000

# Trim ceilings per beat `pace` knob (the in-spec values:
# hold | settle | normal | brisk). A beat marked `hold` is the held-breath
# verdict beat — we never trim its trailing silence. The lead-in is always
# trimmed because Kokoro has no reason to emit a lead-in pause.
LEADING_SILENCE_CEIL_MS = 50
TRAILING_SILENCE_CEIL_MS: dict[str | None, int | None] = {
    "brisk": 80,
    "normal": 150,
    None: 150,        # default — same as `normal`
    "settle": 250,
    "hold": None,     # opt out — keep the held silence the author asked for
}
# Amplitude threshold for "this sample is speech, not silence." Kokoro emits
# clean (~no-noise) silence below ~1e-3; 0.01 gives plenty of headroom.
SILENCE_AMP = 0.01

# One Kokoro pipeline per worker process, lazily built and reused.
_PIPELINE: dict[str, object] = {}


def _pipeline(voice: str):
    p = _PIPELINE.get(voice)
    if p is None:
        from kokoro import KPipeline  # heavy import (pulls torch) — lazy

        p = KPipeline(lang_code=voice[0])
        _PIPELINE[voice] = p
    return p


def _silence_bounds(samples) -> tuple[int, int]:
    """Index of first and (last+1) samples whose |amp| crosses SILENCE_AMP.

    Returns ``(start, end)`` such that ``samples[start:end]`` is the
    speech-bearing core. If the entire clip is below threshold (silent
    clip — shouldn't happen for real narration) returns ``(0, len)``.
    """
    import numpy as np

    mask = np.abs(samples) > SILENCE_AMP
    if not mask.any():
        return 0, len(samples)
    idx = np.where(mask)[0]
    return int(idx[0]), int(idx[-1]) + 1


def _trim_silence(samples, pace: str | None) -> tuple["object", float, float]:
    """Trim leading/trailing silence to per-pace ceilings.

    Returns ``(trimmed_samples, leading_ms_post_trim, trailing_ms_post_trim)``.
    The post-trim ms values are what gets recorded in the manifest — they are
    what the viewer actually hears between beats.
    """
    start, end = _silence_bounds(samples)
    lead_ms_pre = (start / SAMPLE_RATE) * 1000.0
    tail_ms_pre = ((len(samples) - end) / SAMPLE_RATE) * 1000.0

    lead_ceil_samples = int(LEADING_SILENCE_CEIL_MS / 1000.0 * SAMPLE_RATE)
    new_start = max(0, start - lead_ceil_samples)

    tail_ceil_ms = TRAILING_SILENCE_CEIL_MS.get(pace, TRAILING_SILENCE_CEIL_MS[None])
    if tail_ceil_ms is None:
        new_end = len(samples)
    else:
        tail_ceil_samples = int(tail_ceil_ms / 1000.0 * SAMPLE_RATE)
        new_end = min(len(samples), end + tail_ceil_samples)

    trimmed = samples[new_start:new_end]
    lead_ms_post = ((start - new_start) / SAMPLE_RATE) * 1000.0
    tail_ms_post = ((new_end - end) / SAMPLE_RATE) * 1000.0
    return trimmed, lead_ms_post, tail_ms_post, lead_ms_pre, tail_ms_pre


def synth(job: tuple[str, str, str, str, str | None]) -> tuple[str, dict]:
    """Render one beat to mp3. Returns ``(beat_id, metrics_dict)``.

    metrics_dict carries the per-beat rhythm telemetry consumed by the
    manifest. Schema is stable across runs; new fields are added rather
    than reshaping existing ones.
    """
    beat_id, text, voice, out_path, pace = job
    import numpy as np
    import soundfile as sf

    out = Path(out_path)
    chunks = [np.asarray(audio) for _, _, audio in _pipeline(voice)(text, voice=voice)]
    samples = np.concatenate(chunks)

    # Pre-trim measurements — what Kokoro actually emitted.
    pre_start, pre_end = _silence_bounds(samples)
    leading_pre_ms = (pre_start / SAMPLE_RATE) * 1000.0
    trailing_pre_ms = ((len(samples) - pre_end) / SAMPLE_RATE) * 1000.0

    no_trim = os.environ.get("DOCENT_TTS_NO_TRIM") == "1"
    if no_trim:
        trimmed = samples
        leading_post_ms = leading_pre_ms
        trailing_post_ms = trailing_pre_ms
    else:
        trimmed, leading_post_ms, trailing_post_ms, _, _ = _trim_silence(samples, pace)

    wav = out.with_suffix(".wav")
    sf.write(str(wav), trimmed, SAMPLE_RATE)
    # Normalise loudness so narration sits at a consistent, comfortable level.
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
         "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", str(out)],
        check=True,
    )
    wav.unlink(missing_ok=True)

    clip_seconds = len(trimmed) / SAMPLE_RATE
    word_count = len([w for w in text.split() if w.strip()])
    wpm = (word_count / clip_seconds * 60.0) if clip_seconds > 0 else 0.0
    return beat_id, {
        "seconds": round(clip_seconds, 3),
        "wordCount": word_count,
        "clipSeconds": round(clip_seconds, 3),
        "wpm": round(wpm, 1),
        "leadingSilenceMs": round(leading_post_ms, 1),
        "trailingSilenceMs": round(trailing_post_ms, 1),
        "leadingSilencePreTrimMs": round(leading_pre_ms, 1),
        "trailingSilencePreTrimMs": round(trailing_pre_ms, 1),
        "pace": pace,
        "trimmed": not no_trim,
    }


def duration_of(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


def collect_beats(film: str) -> tuple[str, list[tuple[str, str, str | None]]]:
    spec = json.loads((ROOT / "films" / f"{film}.json").read_text())
    voice = spec["meta"].get("voice", "af_heart")
    beats: list[tuple[str, str, str | None]] = [
        (b["id"], b["narration"], b.get("pace"))
        for scene in spec["scenes"]
        for b in scene["beats"]
    ]
    return voice, beats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--film", default="codex")
    ap.add_argument("--workers", type=int, default=0, help="0 = auto")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    voice, beats = collect_beats(args.film)
    audio_dir = ROOT / "public" / "audio" / args.film
    audio_dir.mkdir(parents=True, exist_ok=True)

    todo: list[tuple[str, str, str, str, str | None]] = []
    # `metrics` keyed by beat id; either freshly measured this run or carried
    # forward from the per-film manifest (so cached beats keep their rhythm
    # telemetry). The global manifest still gets `{file, seconds}` for the
    # engine — additive, so old films don't break.
    metrics: dict[str, dict] = {}

    # Per-film rhythm manifest. The global public/audio/manifest.json carries
    # only `{file, seconds}` for the engine; this companion manifest carries
    # the full per-beat rhythm telemetry depthcheck reads.
    film_manifest_path = audio_dir / "manifest.json"
    film_manifest: dict = {}
    if film_manifest_path.exists():
        try:
            film_manifest = json.loads(film_manifest_path.read_text())
        except json.JSONDecodeError:
            film_manifest = {}

    for beat_id, text, pace in beats:
        mp3 = audio_dir / f"{beat_id}.mp3"
        if mp3.exists() and not args.force:
            cached = film_manifest.get("beats", {}).get(beat_id) if isinstance(film_manifest, dict) else None
            if cached and "clipSeconds" in cached:
                metrics[beat_id] = dict(cached)
                # `seconds` is the engine-facing duration; trust the cached
                # clip seconds (re-probing mp3 with ffprobe drifts by frames).
                metrics[beat_id].setdefault("seconds", cached.get("clipSeconds"))
            else:
                # Pre-existing mp3 without rhythm telemetry — back-fill seconds
                # from ffprobe so the engine manifest stays consistent.
                metrics[beat_id] = {
                    "seconds": round(duration_of(mp3), 3),
                    "wordCount": len([w for w in text.split() if w.strip()]),
                    "clipSeconds": round(duration_of(mp3), 3),
                    "wpm": None,
                    "leadingSilenceMs": None,
                    "trailingSilenceMs": None,
                    "pace": pace,
                    "trimmed": None,
                }
        else:
            todo.append((beat_id, text, voice, str(mp3), pace))

    print(f"[tts] {args.film}: {len(beats)} beats — "
          f"{len(todo)} to render, {len(beats) - len(todo)} cached", flush=True)

    if todo:
        workers = args.workers or (1 if len(todo) <= 8
                                   else min(3, os.cpu_count() or 1))
        if workers <= 1:
            for job in todo:
                bid, m = synth(job)
                metrics[bid] = m
                print(
                    f"[tts]   {bid}  {m['clipSeconds']:.2f}s  "
                    f"lead={m['leadingSilenceMs']:.0f}ms  "
                    f"tail={m['trailingSilenceMs']:.0f}ms  "
                    f"wpm={m['wpm']}",
                    flush=True,
                )
        else:
            import multiprocessing as mp

            ctx = mp.get_context("spawn")
            with ProcessPoolExecutor(max_workers=workers, mp_context=ctx) as ex:
                for bid, m in ex.map(synth, todo):
                    metrics[bid] = m
                    print(
                        f"[tts]   {bid}  {m['clipSeconds']:.2f}s  "
                        f"lead={m['leadingSilenceMs']:.0f}ms  "
                        f"tail={m['trailingSilenceMs']:.0f}ms  "
                        f"wpm={m['wpm']}",
                        flush=True,
                    )

    # Global engine-facing manifest — schema unchanged (file, seconds), so
    # the Remotion engine keeps working without any change on its side.
    man_path = ROOT / "public" / "audio" / "manifest.json"
    manifest: dict = {}
    if man_path.exists():
        try:
            manifest = json.loads(man_path.read_text())
        except json.JSONDecodeError:
            manifest = {}
    for beat_id, _, _ in beats:
        manifest[f"{args.film}/{beat_id}"] = {
            "file": f"audio/{args.film}/{beat_id}.mp3",
            "seconds": round(metrics[beat_id]["seconds"], 3),
        }
    tmp = man_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(manifest, indent=2) + "\n")
    tmp.replace(man_path)

    # Per-film rhythm manifest — full telemetry depthcheck and the diagnosis
    # tooling reads. Keyed by beat id so it survives across runs even if a
    # beat is removed mid-spec.
    film_manifest_out = {
        "film": args.film,
        "sampleRate": SAMPLE_RATE,
        "trimEnabled": os.environ.get("DOCENT_TTS_NO_TRIM") != "1",
        "beats": {bid: metrics[bid] for bid, _, _ in beats},
    }
    tmp_film = film_manifest_path.with_suffix(".json.tmp")
    tmp_film.write_text(json.dumps(film_manifest_out, indent=2) + "\n")
    tmp_film.replace(film_manifest_path)

    total = sum(metrics[b]["seconds"] for b, _, _ in beats)
    print(f"[tts] manifest -> {man_path.relative_to(ROOT)}  "
          f"({len(beats)} beats, {total:.1f}s narration)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
