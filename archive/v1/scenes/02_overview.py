"""Scene 2 — Codex architecture at a glance: the spine of the system.

Render:  uv run manim -qm scenes/02_overview.py CodexOverview
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from manim import *  # noqa: F403, E402
from archcast import ArchScene, component, connect, caption  # noqa: E402


class CodexOverview(ArchScene):
    def construct(self):
        title = Text("Codex — at a glance", weight=BOLD, font_size=36)
        title.to_edge(UP, buff=0.5)

        with self.voiceover(text=(
            "Before the details, the shape of the whole thing. Codex is five "
            "pieces arranged along a single spine."
        )):
            self.play(Write(title))

        npm = component("@openai/codex", "npm package", color=GREEN,
                        width=3.6, height=1.2)
        cli = component("cli", "the Rust multitool", color=BLUE,
                        width=3.6, height=1.2)
        core = component("core", "the agent engine", color=YELLOW,
                         width=3.6, height=1.2)
        spine = VGroup(npm, cli, core).arrange(DOWN, buff=1.2)

        model = component("Model provider", "OpenAI Responses API", color=ORANGE,
                          width=3.3, height=1.2)
        sandbox = component("Sandbox", "isolates commands", color=RED,
                            width=3.3, height=1.2)
        model.next_to(core, RIGHT, buff=1.3)
        sandbox.next_to(core, LEFT, buff=1.3)

        diagram = VGroup(spine, model, sandbox)
        diagram.scale_to_fit_height(5.0).move_to(DOWN * 0.35)

        with self.voiceover(text=(
            "What you install is an npm package. But it holds no agent logic -- "
            "it is a thin launcher that simply picks the right native binary for "
            "your platform and runs it."
        )):
            self.play(FadeIn(npm, shift=DOWN * 0.3))

        a_npm_cli = connect(npm, cli)
        with self.voiceover(text=(
            "That binary is the cli -- a Rust multitool. One executable, many "
            "subcommands: the interactive session, headless runs, login, and more."
        )):
            self.play(GrowArrow(a_npm_cli))
            self.play(FadeIn(cli, shift=DOWN * 0.3))

        a_cli_core = connect(cli, core)
        with self.voiceover(text=(
            "Whichever subcommand you choose, the path leads to core -- the "
            "engine that holds the agent loop and all of the business logic. "
            "Every other crate exists to serve it."
        )):
            self.play(GrowArrow(a_cli_core))
            self.play(FadeIn(core, shift=DOWN * 0.3, scale=1.1))

        a_core_model = connect(core, model)
        a_core_sandbox = connect(core, sandbox)
        with self.voiceover(text=(
            "And core reaches in two directions. Outward, to a model provider -- "
            "the large language model that does the reasoning. And to a sandbox, "
            "which isolates every command the agent runs on your machine."
        )):
            self.play(GrowArrow(a_core_model), FadeIn(model, shift=LEFT * 0.3))
            self.play(GrowArrow(a_core_sandbox), FadeIn(sandbox, shift=RIGHT * 0.3))

        note = caption("npm  →  cli  →  core  ·  model out, sandbox down")
        with self.voiceover(text=(
            "Install, launch, engine -- then model and sandbox. Hold onto that "
            "spine; everything that follows hangs off of it."
        )):
            self.play(FadeIn(note))

        self.wait(0.3)
        self.play(FadeOut(VGroup(
            title, diagram, a_npm_cli, a_cli_core, a_core_model, a_core_sandbox, note,
        )))
