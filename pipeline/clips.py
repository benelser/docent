#!/usr/bin/env python3
"""docent clips stage — render Manim inserts for a film.

Optional. A film uses Manim only where continuous, physics-eased motion beats
CSS; most architecture films need none. Any ``manim/<film>/*.py`` scene files
are rendered (in parallel) to ``public/clips/<film>/<Scene>.mp4`` for the
Remotion engine to embed.

These Manim scenes carry no narration — narration is the TTS stage's job. That
decoupling is what makes the clips safe to render concurrently.

Usage:  uv run python pipeline/clips.py --film codex [--workers N]
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def render_file(scene_file: Path, out_dir: Path) -> list[str]:
    """Render every Scene in one Manim file; return the clip filenames."""
    media = ROOT / ".manim-cache" / scene_file.stem
    subprocess.run(
        ["uv", "run", "manim", "render", "-qh", "--format=mp4",
         "--media_dir", str(media), "-a", str(scene_file)],
        check=True, cwd=ROOT,
    )
    produced: list[str] = []
    for mp4 in (media / "videos").rglob("*.mp4"):
        if "partial_movie_files" in mp4.parts:
            continue
        dest = out_dir / f"{mp4.stem}.mp4"
        shutil.copy2(mp4, dest)
        produced.append(dest.name)
    return produced


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--film", default="codex")
    ap.add_argument("--workers", type=int, default=0, help="0 = auto")
    args = ap.parse_args()

    scene_dir = ROOT / "manim" / args.film
    files = sorted(scene_dir.glob("*.py")) if scene_dir.is_dir() else []
    if not files:
        print(f"[clips] {args.film}: no Manim scenes — skipping", flush=True)
        return 0

    out_dir = ROOT / "public" / "clips" / args.film
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"[clips] {args.film}: {len(files)} Manim file(s)", flush=True)

    workers = args.workers or min(4, len(files))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for scene_file, names in zip(files, ex.map(lambda f: render_file(f, out_dir), files)):
            for n in names:
                print(f"[clips]   {scene_file.name} -> {n}", flush=True)

    print(f"[clips] clips -> public/clips/{args.film}/", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
