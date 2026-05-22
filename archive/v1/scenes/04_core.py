"""Scene 4 — Inside core: the agent loop.

Render:  uv run manim -qm scenes/04_core.py CodexCore
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from manim import *  # noqa: F403, E402
from archcast import ArchScene, component, connect, caption  # noqa: E402


class CodexCore(ArchScene):
    def construct(self):
        title = Text("Inside core — the agent loop", weight=BOLD, font_size=34)
        title.to_edge(UP, buff=0.4)

        with self.voiceover(text=(
            "Now open up core. Inside, it runs a loop -- the agent loop -- and "
            "four moving parts take turns around it."
        )):
            self.play(Write(title))

        center = component("Session · Turn", "one prompt, one response",
                           color=GREY_B, width=3.4, height=1.2)
        center.move_to(DOWN * 0.25)

        with self.voiceover(text=(
            "A session holds the conversation. Within it, a turn is one unit of "
            "work: one prompt going out, one streamed response coming back. The "
            "loop lives inside a single turn."
        )):
            self.play(FadeIn(center, scale=1.1))

        mc = component("ModelClient", "streams to the model", color=ORANGE,
                       width=3.8, height=1.2)
        router = component("Tool router", "dispatches each call", color=BLUE,
                           width=3.3, height=1.2)
        orch = component("Orchestrator", "approval · sandbox · retry", color=RED,
                         width=3.8, height=1.2)
        handlers = component("Tool handlers", "shell, apply_patch, MCP", color=GREEN,
                             width=3.3, height=1.2)

        mc.move_to(center.get_center() + UP * 2.15)
        orch.move_to(center.get_center() + DOWN * 2.15)
        router.move_to(center.get_center() + RIGHT * 3.9)
        handlers.move_to(center.get_center() + LEFT * 3.9)

        with self.voiceover(text=(
            "It begins with the ModelClient. It streams the prompt to the model "
            "provider and reads back the reply -- not just text, but the model's "
            "requests to call tools."
        )):
            self.play(FadeIn(mc, shift=DOWN * 0.3))

        with self.voiceover(text=(
            "Each of those requests reaches the tool router. Its job is dispatch: "
            "match the call to the one handler that knows how to carry it out."
        )):
            self.play(FadeIn(router, shift=LEFT * 0.3))

        with self.voiceover(text=(
            "But nothing runs yet. The orchestrator sits in the way -- the central "
            "place for approvals, for choosing a sandbox, and for retrying if a "
            "sandbox is too tight. Every tool call is gated here."
        )):
            self.play(FadeIn(orch, shift=UP * 0.3))

        with self.voiceover(text=(
            "Cleared, the call reaches a handler -- the code that actually does "
            "things: run a shell command, apply a patch to a file, call out to a "
            "connected M-C-P server."
        )):
            self.play(FadeIn(handlers, shift=RIGHT * 0.3))

        ring = VGroup(
            connect(mc, router),
            connect(router, orch),
            connect(orch, handlers),
            connect(handlers, mc),
        )
        with self.voiceover(text=(
            "Then the result of that handler flows back to the ModelClient, which "
            "hands it to the model -- and the loop turns again. Reason, call a "
            "tool, observe, reason again."
        )):
            self.play(LaggedStart(*[GrowArrow(a) for a in ring],
                                  lag_ratio=0.45))
            self.play(Indicate(ring, color=YELLOW, scale_factor=1.05))

        note = caption("the loop spins until the model stops calling tools")
        with self.voiceover(text=(
            "The loop spins until the model has no more tools to call. That is "
            "the moment the turn is finished."
        )):
            self.play(FadeIn(note))

        self.wait(0.3)
        self.play(FadeOut(VGroup(
            title, center, mc, router, orch, handlers, ring, note,
        )))
