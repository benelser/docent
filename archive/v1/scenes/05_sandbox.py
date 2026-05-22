"""Scene 5 — The sandbox: isolating every command.

Render:  uv run manim -qm scenes/05_sandbox.py CodexSandbox
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from manim import *  # noqa: F403, E402
from archcast import ArchScene, component, connect, caption  # noqa: E402


class CodexSandbox(ArchScene):
    def construct(self):
        title = Text("The sandbox", weight=BOLD, font_size=36)
        title.to_edge(UP, buff=0.45)

        with self.voiceover(text=(
            "Here is the uncomfortable part. A coding agent runs commands on "
            "your real machine. Codex's answer to that risk is the sandbox."
        )):
            self.play(Write(title))

        cmd = component("shell command", "from a tool handler", color=GREEN,
                        width=3.8, height=1.1)
        cmd.move_to(UP * 2.05)

        sandbox = component("Sandbox", "policy: read-only · workspace-write",
                            color=RED, width=5.4, height=1.3)
        sandbox.move_to(UP * 0.05)

        with self.voiceover(text=(
            "Every shell command a handler wants to run is intercepted first. "
            "It does not touch the system directly -- it goes through the sandbox."
        )):
            self.play(FadeIn(cmd, shift=DOWN * 0.3))

        a_in = connect(cmd, sandbox)
        with self.voiceover(text=(
            "A policy sets the rules. Read-only by default; workspace-write to "
            "let the agent edit the project but not reach the network; or full "
            "access, when you have deliberately turned the guardrails off."
        )):
            self.play(GrowArrow(a_in))
            self.play(FadeIn(sandbox, scale=1.05))

        mac = component("Seatbelt", "macOS", color=BLUE, width=3.4, height=1.15)
        lin = component("Landlock / bwrap", "Linux", color=PURPLE,
                        width=3.4, height=1.15)
        win = component("Windows sandbox", "Windows", color=TEAL,
                        width=3.4, height=1.15)
        backends = VGroup(mac, lin, win).arrange(RIGHT, buff=0.5)
        backends.move_to(DOWN * 2.2)

        arrows = VGroup(*(connect(sandbox, b) for b in (mac, lin, win)))
        with self.voiceover(text=(
            "And the sandbox is not one mechanism -- it is whichever one your "
            "operating system provides. Seatbelt on macOS. Landlock, or "
            "bubblewrap, on Linux. A dedicated sandbox on Windows. Same policy, "
            "enforced by the native kernel feature."
        )):
            self.play(LaggedStart(*[GrowArrow(a) for a in arrows],
                                  lag_ratio=0.3))
            self.play(LaggedStart(*[FadeIn(m, shift=UP * 0.2) for m in backends],
                                  lag_ratio=0.3))

        esc = CurvedArrow(
            sandbox.get_left() + UP * 0.2,
            cmd.get_left() + DOWN * 0.2,
            angle=TAU / 5, color=YELLOW,
        )
        esc_label = Text("denied?  ask,\nthen retry wider", font_size=19,
                         color=YELLOW)
        esc_label.move_to(LEFT * 5.15 + UP * 1.0)

        with self.voiceover(text=(
            "And if the policy is too tight -- a command blocked that you "
            "actually meant to allow -- the orchestrator does not just fail. It "
            "asks you, and on your approval retries the command under a wider "
            "sandbox. Safe by default, escalated only with consent."
        )):
            self.play(Create(esc), FadeIn(esc_label))

        note = caption("safe by default  ·  OS-native enforcement  ·  escalate on consent")
        with self.voiceover(text=(
            "Isolation you do not have to think about, until the moment you "
            "choose to."
        )):
            self.play(FadeIn(note))

        self.wait(0.3)
        self.play(FadeOut(VGroup(
            title, cmd, sandbox, a_in, backends, arrows, esc, esc_label, note,
        )))
