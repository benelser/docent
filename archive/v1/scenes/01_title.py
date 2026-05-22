"""Scene 1 — Title card for the Codex CLI architecture review.

Render:  uv run manim -qm scenes/01_title.py CodexTitle
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from manim import *  # noqa: F403, E402
from archcast import ArchScene, component, caption  # noqa: E402


class CodexTitle(ArchScene):
    def construct(self):
        title = Text("Codex CLI", weight=BOLD, font_size=60, color=BLUE)
        subtitle = Text("an architecture review", font_size=30, color=GREY_B)
        header = VGroup(title, subtitle).arrange(DOWN, buff=0.3)
        header.move_to(UP * 1.3)

        with self.voiceover(text=(
            "This is Codex C-L-I -- OpenAI's coding agent. Let's take it apart "
            "and see how it is built."
        )):
            self.play(Write(title))
            self.play(FadeIn(subtitle, shift=UP * 0.2))

        one_liner = Text(
            "an AI coding agent that runs locally on your machine",
            font_size=26, color=WHITE,
        )
        one_liner.next_to(header, DOWN, buff=0.9)

        with self.voiceover(text=(
            "At heart, Codex is a coding agent that runs entirely on your own "
            "machine -- it reads your code, runs commands, and edits files for you."
        )):
            self.play(FadeIn(one_liner, shift=UP * 0.2))

        stack = Text(
            "a large Rust workspace  +  a thin npm wrapper  +  SDKs",
            font_size=22, color=GREY_B,
        )
        stack.next_to(one_liner, DOWN, buff=0.6)

        with self.voiceover(text=(
            "Underneath, it is a large Rust workspace, shipped through a thin "
            "npm wrapper, with software development kits for driving it from code."
        )):
            self.play(FadeIn(stack))

        note = caption("surveyed from the real source — every box maps to real code")
        with self.voiceover(text=(
            "Everything you are about to see was surveyed from the real source. "
            "Every box maps to something that actually exists in the repository."
        )):
            self.play(FadeIn(note))

        self.wait(0.3)
        self.play(FadeOut(VGroup(header, one_liner, stack, note)))
