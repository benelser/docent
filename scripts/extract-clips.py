#!/usr/bin/env python3
"""
Extract short per-scene MP4 clips for the catalog lightbox.

For each canonical scene type, find the t10s and t90s timestamps in its
source film (from out/.render-check-<film>/check.json), cut a [t10, t90]
segment, re-encode to a low-bitrate H.264 with no audio + faststart so
the browser can stream-play it inline. The lightbox plays this loop on
tile click — viewers see the actual scene MOVE, not a frozen still.

Run after render-checks (low-scale) or full builds. Re-extract whenever
source mp4s are refreshed.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'out'
CLIPS = ROOT / 'landing' / 'static' / 'clips'

# Same canonical mapping as extract-stills.py — the SAME scene of the
# SAME film, so the clip and still always agree.
MAPPING = {
    'frame':       ('arxiv-2512-14806',          0),
    'structure':   ('grammar-check',             1),
    'progression': ('grammar-check',             2),
    'walkthrough': ('grammar-check',             3),
    'compare':     ('grammar-check',             4),
    'quantities':  ('grammar-check',             5),
    'probe':       ('grammar-check',             6),
    'tension':     ('grammar-check',             7),
    'closeup':     ('grammar-check',             8),
    'demonstrate': ('grammar-check',             9),
    'recap':       ('grammar-check',            10),
    'diff':        ('grammar-check',            11),
    'chart':       ('grammar-check',            12),
    'passage':     ('grammar-check',            13),
    'figure':      ('grammar-check',            14),
    'prior-art':   ('docent-self',               1),
    'big-idea':    ('arxiv-2512-14806',          6),
    'causal-loop': ('causal-loop-primer',        1),
    'map':         ('multi-region-db',           1),
    'venn':        ('auth-overlap',              2),
    'mechanism':   ('thermostat',                1),
    'epigraph':    ('rhetorical-primer',         1),
    'concession':  ('rhetorical-primer',         2),
    'objection':   ('rhetorical-primer',         5),
    'provocation': ('rhetorical-primer',         6),
    'landscape':   ('sprint-b-composition-demo', 1),
    'timeline':    ('sprint-b-composition-demo', 2),
    'journey-map': ('sprint-b-composition-demo', 3),
    'tree':        ('sprint-b-composition-demo', 4),
}


def actual_duration(film: str) -> float | None:
    mp4 = OUT / f'{film}.mp4'
    if not mp4.exists():
        return None
    res = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
         '-of', 'csv=p=0', str(mp4)],
        capture_output=True, text=True,
    )
    try:
        return float(res.stdout.strip())
    except ValueError:
        return None


def scene_window(film: str, idx: int) -> tuple[float, float, str]:
    """
    Return (clip_start, clip_end, scene_type) in seconds.

    The check.json was recorded against the render-check at the time it
    ran; if the film has been re-rendered (TTS audio durations vary), the
    absolute timestamps drift. We scale each timestamp by the ratio of
    actual_duration / check_duration so the same FRACTION of the film
    maps to the same scene window — robust to re-renders.

    We use a tight 6-second window centered on t50 instead of [t10, t90]
    so the clip is always punchy and never overruns the file.
    """
    check = OUT / f'.render-check-{film}' / 'check.json'
    with check.open() as f:
        data = json.load(f)
    check_duration = data.get('durationSeconds') or 0.0
    actual = actual_duration(film) or check_duration
    scale = actual / check_duration if check_duration > 0 else 1.0
    for s in data['samples']:
        if s['sceneIndex'] == idx:
            t50 = s['t50s'] * scale
            half = 3.0  # 6-second clip centered on the midpoint
            start = max(0.0, t50 - half)
            end = min(actual - 0.1, t50 + half) if actual else t50 + half
            return start, end, s['type']
    raise SystemExit(f'no sample at index {idx} in {check}')


def extract(film: str, t_start: float, t_end: float, out_mp4: Path) -> None:
    mp4 = OUT / f'{film}.mp4'
    if not mp4.exists():
        raise SystemExit(f'missing mp4: {mp4}')
    # CRF 28 is a comfortable streaming sweet spot for low-motion scene
    # content; -an strips audio (~50% size reduction, lightbox is silent);
    # +faststart moves the moov atom to the head so playback begins
    # before the whole file downloads. fps capped at 30; scale ensures
    # output width is a multiple of 2 (libx264 requirement).
    cmd = [
        'ffmpeg', '-y', '-loglevel', 'error',
        '-i', str(mp4),
        '-ss', f'{t_start:.3f}',
        '-to', f'{t_end:.3f}',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '28',
        '-pix_fmt', 'yuv420p',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30',
        '-an',
        '-movflags', '+faststart',
        str(out_mp4),
    ]
    subprocess.run(cmd, check=True)


def main() -> int:
    CLIPS.mkdir(parents=True, exist_ok=True)
    bad = 0
    skipped = 0
    total_kb = 0
    print(f'Extracting {len(MAPPING)} scene clips...')
    for scene, (film, idx) in sorted(MAPPING.items()):
        try:
            t10, t90, actual_type = scene_window(film, idx)
        except SystemExit as e:
            print(f'  ⚠ {scene:14} skipped: {e}')
            skipped += 1
            continue
        if actual_type != scene:
            print(f'  ! {scene:14} MAPPING ERROR: {film}#{idx} is {actual_type!r}')
            bad += 1
            continue
        out_mp4 = CLIPS / f'{scene}.mp4'
        try:
            extract(film, t10, t90, out_mp4)
        except subprocess.CalledProcessError:
            # Source mp4 mid-write (rendering) or corrupted — skip and
            # let a re-run pick it up when stable.
            print(f'  ⚠ {scene:14} skipped: {film}.mp4 not readable (mid-render?)')
            skipped += 1
            continue
        size = out_mp4.stat().st_size // 1024
        total_kb += size
        dur = t90 - t10
        print(f'  ✓ {scene:14} ← {film}#{idx} [{t10:6.2f}s → {t90:6.2f}s = {dur:4.1f}s]  {size:>4} KB')
    if bad:
        print(f'{bad} mapping errors')
        return 1
    print(f'done. total {total_kb // 1024} MB across {len(MAPPING) - skipped} clips ({skipped} skipped).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
