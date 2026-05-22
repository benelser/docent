"""archcast — turn a codebase into an animated, voiced-over architecture review.

Public API:
    ArchScene   — a Manim scene that narrates itself with a local neural voice
    component   — a labelled box for a module / service / layer
    connect     — an arrow between two components
    caption     — a caption pinned to the bottom of the frame
"""

from archcast.diagram import caption, component, connect
from archcast.scene import ArchScene

__all__ = ["ArchScene", "component", "connect", "caption"]
