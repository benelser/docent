"""Scene 6 — A turn, end to end — the flow walkthrough, then the recap.

Render:  uv run manim -qm scenes/06_turn.py CodexTurn
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from manim import *  # noqa: F403, E402
from archcast import ArchScene, component, connect, caption  # noqa: E402


class CodexTurn(ArchScene):
    def pulse(self, arrow, color=YELLOW, run_time=1.4):
        """Send a glowing dot along an arrow to show flow direction."""
        dot = Dot(color=color, radius=0.13).move_to(arrow.get_start())
        self.play(MoveAlongPath(dot, arrow), run_time=run_time)
        self.play(FadeOut(dot, run_time=0.25))

    def construct(self):
        title = Text("A turn, end to end", weight=BOLD, font_size=36)
        title.to_edge(UP, buff=0.45)

        with self.voiceover(text=(
            "One last pass -- this time following a single turn all the way "
            "through, watching the pieces work together."
        )):
            self.play(Write(title))

        you = component("You", "a prompt", color=WHITE, width=2.6, height=1.15)
        core = component("core", "the engine", color=YELLOW, width=3.0, height=1.15)
        model = component("Model", "reasons", color=ORANGE, width=2.8, height=1.15)
        tools = component("Tools + Sandbox", "act, safely", color=GREEN,
                          width=3.8, height=1.15)
        rollout = component("Rollout file", "the saved thread", color=PURPLE,
                            width=3.2, height=1.15)

        you.move_to([-5.0, 1.55, 0])
        core.move_to([0.0, 1.55, 0])
        model.move_to([5.0, 1.55, 0])
        tools.move_to([0.0, -1.7, 0])
        rollout.move_to([5.0, -1.7, 0])

        boxes = VGroup(you, core, model, tools, rollout)
        with self.voiceover(text=(
            "These are the players: you, the engine, the model, the tools with "
            "their sandbox, and the rollout file that remembers it all."
        )):
            self.play(LaggedStart(*[FadeIn(m, scale=1.05) for m in boxes],
                                  lag_ratio=0.25))

        a_yc = connect(you, core).shift(UP * 0.16)
        a_cm = connect(core, model).shift(UP * 0.16)
        a_mc = connect(model, core).shift(DOWN * 0.16)
        a_ct = connect(core, tools).shift(LEFT * 0.16)
        a_tc = connect(tools, core).shift(RIGHT * 0.16)
        a_cr = connect(core, rollout)
        a_cy = connect(core, you).shift(DOWN * 0.16)
        edges = VGroup(a_yc, a_cm, a_mc, a_ct, a_tc, a_cr, a_cy)
        self.play(FadeIn(edges, run_time=0.6))

        with self.voiceover(text=(
            "It starts with you. You type a prompt, and a surface hands it to "
            "the engine."
        )):
            self.play(Indicate(you, color=BLUE))
            self.pulse(a_yc)

        with self.voiceover(text=(
            "The engine's ModelClient streams that prompt out to the model."
        )):
            self.pulse(a_cm, color=ORANGE)

        with self.voiceover(text=(
            "The model reasons -- and answers not with prose, but with a request: "
            "call a tool."
        )):
            self.play(Indicate(model, color=ORANGE))
            self.pulse(a_mc, color=ORANGE)

        with self.voiceover(text=(
            "The router and orchestrator clear that request, and a handler runs "
            "it -- a shell command, an edit -- inside the sandbox."
        )):
            self.pulse(a_ct, color=GREEN)
            self.play(Indicate(tools, color=GREEN))

        with self.voiceover(text=(
            "The result of that work travels back to the engine."
        )):
            self.pulse(a_tc, color=GREEN)

        with self.voiceover(text=(
            "Which feeds it to the model again. And so the loop turns -- reason, "
            "act, observe -- as many times as the task demands."
        )):
            self.pulse(a_cm, color=ORANGE)
            self.play(Indicate(VGroup(a_cm, a_mc, a_ct, a_tc), color=YELLOW))

        with self.voiceover(text=(
            "When the model finally stops asking for tools, the turn closes. "
            "Every event is written to the rollout file, so the whole thread "
            "can be replayed later -- and the surface renders the answer back "
            "to you."
        )):
            self.pulse(a_cr, color=PURPLE)
            self.pulse(a_cy, color=BLUE)
            self.play(Indicate(you, color=BLUE))

        self.wait(0.3)
        self.play(FadeOut(VGroup(boxes, edges)))

        recap_title = Text("Codex CLI, in five ideas", weight=BOLD, font_size=32)
        lines = VGroup(
            Text("one engine — core — reached through four surfaces",
                 font_size=24),
            Text("an agent loop: reason  →  call a tool  →  observe",
                 font_size=24),
            Text("every command isolated by an OS-native sandbox",
                 font_size=24),
            Text("escalate past the sandbox only with your consent",
                 font_size=24),
            Text("every turn persisted to a replayable rollout",
                 font_size=24),
        ).arrange(DOWN, buff=0.32, aligned_edge=LEFT)
        recap = VGroup(recap_title, lines).arrange(DOWN, buff=0.55)
        recap.move_to(ORIGIN)

        with self.voiceover(text=(
            "That is Codex, end to end. One engine, reached through four "
            "surfaces. An agent loop that reasons, calls a tool, and observes "
            "the result."
        )):
            self.play(FadeIn(recap_title, shift=UP * 0.2))
            self.play(LaggedStart(*[FadeIn(m, shift=RIGHT * 0.2)
                                    for m in lines[:2]], lag_ratio=0.4))

        with self.voiceover(text=(
            "Every command it runs isolated by a sandbox, escalated past only "
            "with your consent. And every turn saved to a rollout you can "
            "replay. A coding agent -- and the discipline that makes it safe to "
            "run."
        )):
            self.play(LaggedStart(*[FadeIn(m, shift=RIGHT * 0.2)
                                    for m in lines[2:]], lag_ratio=0.4))

        self.wait(0.4)
        self.play(FadeOut(recap))
