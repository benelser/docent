"""Reusable Manim building blocks for architecture diagrams.

Three primitives cover most architecture films:
    component(...) — a labelled box for a module / service / layer
    connect(...)   — an arrow between two components
    caption(...)   — a caption pinned to the bottom of the frame
"""

import numpy as np
from manim import (
    BLUE,
    BOLD,
    DOWN,
    GREY_B,
    YELLOW,
    Arrow,
    RoundedRectangle,
    Text,
    VGroup,
)


def _unit(vec):
    """Return the unit vector in the direction of `vec` (or `vec` if it is zero)."""
    norm = np.linalg.norm(vec)
    return vec / norm if norm else vec


def _edge_point(mob, toward):
    """Point where the ray from `mob`'s centre toward `toward` exits its box.

    Unlike `get_boundary_point`, which snaps to a corner vertex, this returns
    the true intersection with the bounding-box edge — so an arrow between two
    stacked boxes leaves and enters at the edge midpoints, not the corners.
    """
    center = mob.get_center()
    d = np.asarray(toward, dtype=float) - center
    half_w, half_h = mob.width / 2, mob.height / 2
    tx = half_w / abs(d[0]) if abs(d[0]) > 1e-6 else np.inf
    ty = half_h / abs(d[1]) if abs(d[1]) > 1e-6 else np.inf
    t = min(tx, ty)
    return center if t == np.inf else center + d * t


def component(label, subtitle="", color=BLUE, width=2.8, height=1.2):
    """A labelled rounded box representing a code component.

    Returns a VGroup of (box, text). Position it like any Mobject, and pass it
    to `connect()` to draw arrows to and from it.
    """
    box = RoundedRectangle(
        corner_radius=0.12, width=width, height=height,
        color=color, fill_color=color, fill_opacity=0.15, stroke_width=2.5,
    )
    name = Text(label, font_size=24, weight=BOLD)
    if subtitle:
        sub = Text(subtitle, font_size=15, color=GREY_B)
        inner = VGroup(name, sub).arrange(DOWN, buff=0.12)
    else:
        inner = name
    inner.move_to(box)
    return VGroup(box, inner)


def connect(src, dst, color=GREY_B):
    """An edge-to-edge arrow from one component to another. Returns an Arrow."""
    start = _edge_point(src, dst.get_center())
    end = _edge_point(dst, src.get_center())
    return Arrow(
        start, end, buff=0.08, color=color, stroke_width=3,
        max_tip_length_to_length_ratio=0.12,
    )


def caption(text, color=YELLOW):
    """A caption line pinned to the bottom of the frame."""
    return Text(text, font_size=26, color=color).to_edge(DOWN, buff=0.6)
