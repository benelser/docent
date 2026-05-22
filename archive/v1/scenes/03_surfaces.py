"""Scene 3 — The four surfaces: how callers reach the engine.

Render:  uv run manim -qm scenes/03_surfaces.py CodexSurfaces
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from manim import *  # noqa: F403, E402
from archcast import ArchScene, component, connect, caption  # noqa: E402


class CodexSurfaces(ArchScene):
    def construct(self):
        title = Text("Four ways in", weight=BOLD, font_size=36)
        title.to_edge(UP, buff=0.5)

        with self.voiceover(text=(
            "The engine never runs on its own. It is reached through surfaces -- "
            "front doors, each suited to a different kind of caller. There are four."
        )):
            self.play(Write(title))

        tui = component("tui", "interactive terminal UI", color=BLUE,
                        width=3.3, height=1.2)
        exe = component("exec", "headless, for CI", color=GREEN,
                        width=3.3, height=1.2)
        aps = component("app-server", "JSON-RPC for IDEs", color=PURPLE,
                        width=3.3, height=1.2)
        mcp = component("mcp-server", "Codex as a tool", color=TEAL,
                        width=3.3, height=1.2)
        row = VGroup(tui, exe, aps, mcp).arrange(RIGHT, buff=0.5)

        core = component("core", "the agent engine", color=YELLOW,
                         width=3.6, height=1.25)
        core.next_to(row, DOWN, buff=1.7)
        core.set_x(row.get_x())

        diagram = VGroup(row, core)
        diagram.scale_to_fit_width(13.0).move_to(DOWN * 0.35)

        with self.voiceover(text=(
            "First, the t-u-i -- a fullscreen terminal interface built with "
            "Ratatui. Run codex with no subcommand and this is what you get. "
            "It is the default, interactive experience."
        )):
            self.play(FadeIn(tui, shift=DOWN * 0.3))

        with self.voiceover(text=(
            "Second, exec -- the headless surface. Codex exec, with a prompt, "
            "runs the agent to completion and exits. No screen, no keyboard -- "
            "this is the form built for scripts and continuous integration."
        )):
            self.play(FadeIn(exe, shift=DOWN * 0.3))

        with self.voiceover(text=(
            "Third, the app-server. It exposes the engine as a JSON-R-P-C "
            "service over standard input and output. The editor extensions and "
            "the software development kits all speak to Codex through this."
        )):
            self.play(FadeIn(aps, shift=DOWN * 0.3))

        with self.voiceover(text=(
            "And fourth, the mcp-server. This one inverts the relationship: it "
            "publishes Codex itself as a tool, so another A-I agent can call "
            "Codex the way Codex calls its own tools."
        )):
            self.play(FadeIn(mcp, shift=DOWN * 0.3))

        arrows = VGroup(*(connect(s, core) for s in (tui, exe, aps, mcp)))
        with self.voiceover(text=(
            "Four different doors -- but every one of them opens onto the same "
            "engine. Whatever the surface, the agent loop underneath is identical."
        )):
            self.play(FadeIn(core, scale=1.1))
            self.play(LaggedStart(*[GrowArrow(a) for a in arrows],
                                  lag_ratio=0.3))

        note = caption("different front doors  ·  one shared engine")
        with self.voiceover(text=(
            "So the surfaces are thin. The next question is what lives inside "
            "that shared engine."
        )):
            self.play(FadeIn(note))

        self.wait(0.3)
        self.play(FadeOut(VGroup(title, diagram, arrows, note)))
