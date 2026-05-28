#!/usr/bin/env python3
"""
Re-extract every scene catalog still from its canonical source, using the
render-check check.json files as the ground-truth scene-index. Each tile
in landing/static/stills/<type>.jpg becomes a 900px frame from the t50
midpoint of a real scene of that type — no mismatched stills.

Re-run after a render-check is refreshed:
    docent render-check <film>
    python3 scripts/extract-stills.py
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'out'
STILLS = ROOT / 'landing' / 'static' / 'stills'

# Canonical source per scene type. Prefer grammar-check (a self-labeled
# tour of scene grammar) where available; for the rest, pick the film
# whose instance reads most representative of the move.
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


def find_t50(film: str, idx: int) -> tuple[float, str]:
    """
    Return (t50_scaled, scene_type). Scaled by actual_duration /
    check.json_duration so end-of-film scenes don't overflow when the
    re-render came out slightly shorter than the original check (TTS
    audio length is not deterministic).
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
            # Pull back 0.1s from the very end so ffmpeg always has a
            # frame to grab.
            if actual:
                t50 = min(t50, actual - 0.1)
            return t50, s['type']
    raise SystemExit(f'no sample at index {idx} in {check}')


def extract(film: str, t: float, out_jpg: Path, width: int, quality: int) -> None:
    mp4 = OUT / f'{film}.mp4'
    if not mp4.exists():
        raise SystemExit(f'missing mp4: {mp4}')
    # -ss after -i = accurate seek; lanczos scale keeps text crisp.
    cmd = [
        'ffmpeg', '-y', '-loglevel', 'error',
        '-i', str(mp4),
        '-ss', f'{t:.3f}',
        '-vframes', '1',
        '-vf', f'scale={width}:-1:flags=lanczos',
        '-q:v', str(quality),
        str(out_jpg),
    ]
    subprocess.run(cmd, check=True)


def main() -> int:
    bad = 0
    # Two sizes: catalog tile (480w, ~25 KB) for the grid + foreground
    # detail (1920w, ~150 KB) for the lightbox at retina res.
    STILLS.mkdir(parents=True, exist_ok=True)
    (STILLS / 'full').mkdir(exist_ok=True)
    print(f'Re-extracting {len(MAPPING)} canonical stills (tile + full)...')
    for scene, (film, idx) in sorted(MAPPING.items()):
        t, actual_type = find_t50(film, idx)
        if actual_type != scene:
            print(f'  ! {scene:14} MAPPING ERROR: {film}#{idx} is {actual_type!r}, not {scene!r}')
            bad += 1
            continue
        tile = STILLS / f'{scene}.jpg'
        full = STILLS / 'full' / f'{scene}.jpg'
        extract(film, t, tile, width=480, quality=4)
        extract(film, t, full, width=1920, quality=2)
        ts = tile.stat().st_size // 1024
        fs = full.stat().st_size // 1024
        print(f'  ✓ {scene:14} ← {film}#{idx} @ {t:6.2f}s  tile {ts:>3} KB · full {fs:>4} KB')
    if bad:
        print(f'{bad} mapping errors')
        return 1
    print('done.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
