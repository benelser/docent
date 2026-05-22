#!/usr/bin/env python3
"""docent TTS stage — render every beat's narration to speech with Kokoro.

This stage is deliberately decoupled from rendering (the lesson from v1, where
manim-voiceover coupled the two and deadlocked under concurrency). It writes
``public/audio/<film>/<beat>.mp3`` plus a manifest of durations; the Remotion
engine reads that manifest to time every scene.

Cached by default: a beat whose mp3 already exists is reused. Pass --force to
re-render. Independent beats render in parallel worker processes.

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

# One Kokoro pipeline per worker process, lazily built and reused.
_PIPELINE: dict[str, object] = {}


def _pipeline(voice: str):
    p = _PIPELINE.get(voice)
    if p is None:
        from kokoro import KPipeline  # heavy import (pulls torch) — lazy

        p = KPipeline(lang_code=voice[0])
        _PIPELINE[voice] = p
    return p


def synth(job: tuple[str, str, str, str]) -> tuple[str, float]:
    """Render one beat to mp3. Returns (beat_id, seconds)."""
    beat_id, text, voice, out_path = job
    import numpy as np
    import soundfile as sf

    out = Path(out_path)
    chunks = [np.asarray(audio) for _, _, audio in _pipeline(voice)(text, voice=voice)]
    samples = np.concatenate(chunks)
    wav = out.with_suffix(".wav")
    sf.write(str(wav), samples, SAMPLE_RATE)
    # Normalise loudness so narration sits at a consistent, comfortable level.
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
         "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", str(out)],
        check=True,
    )
    wav.unlink(missing_ok=True)
    return beat_id, len(samples) / SAMPLE_RATE


def duration_of(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


def collect_beats(film: str) -> tuple[str, list[tuple[str, str]]]:
    spec = json.loads((ROOT / "films" / f"{film}.json").read_text())
    voice = spec["meta"].get("voice", "af_heart")
    beats = [
        (b["id"], b["narration"])
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

    todo: list[tuple[str, str, str, str]] = []
    durations: dict[str, float] = {}
    for beat_id, text in beats:
        mp3 = audio_dir / f"{beat_id}.mp3"
        if mp3.exists() and not args.force:
            durations[beat_id] = duration_of(mp3)
        else:
            todo.append((beat_id, text, voice, str(mp3)))

    print(f"[tts] {args.film}: {len(beats)} beats — "
          f"{len(todo)} to render, {len(beats) - len(todo)} cached", flush=True)

    if todo:
        workers = args.workers or (1 if len(todo) <= 8
                                   else min(3, os.cpu_count() or 1))
        if workers <= 1:
            for job in todo:
                bid, sec = synth(job)
                durations[bid] = sec
                print(f"[tts]   {bid}  {sec:.2f}s", flush=True)
        else:
            import multiprocessing as mp

            ctx = mp.get_context("spawn")
            with ProcessPoolExecutor(max_workers=workers, mp_context=ctx) as ex:
                for bid, sec in ex.map(synth, todo):
                    durations[bid] = sec
                    print(f"[tts]   {bid}  {sec:.2f}s", flush=True)

    man_path = ROOT / "public" / "audio" / "manifest.json"
    manifest: dict = {}
    if man_path.exists():
        try:
            manifest = json.loads(man_path.read_text())
        except json.JSONDecodeError:
            manifest = {}
    for beat_id, _ in beats:
        manifest[f"{args.film}/{beat_id}"] = {
            "file": f"audio/{args.film}/{beat_id}.mp3",
            "seconds": round(durations[beat_id], 3),
        }
    # Atomic write — a concurrent render reading the manifest never sees a
    # half-written file.
    tmp = man_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(manifest, indent=2) + "\n")
    tmp.replace(man_path)
    total = sum(durations[b] for b, _ in beats)
    print(f"[tts] manifest -> {man_path.relative_to(ROOT)}  "
          f"({len(beats)} beats, {total:.1f}s narration)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
