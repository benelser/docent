"""ArchScene — a narrated Manim scene base class for architecture films."""

from manim_voiceover import VoiceoverScene

from archcast.narration import KokoroService


class ArchScene(VoiceoverScene):
    """A Manim scene that narrates itself with the local Kokoro voice.

    Subclass it and write `construct()`; wrap each beat in
    ``with self.voiceover(text="..."):``. The narrator is wired up automatically
    — no need to call `set_speech_service` yourself.

    Override the class attribute `voice` to change the Kokoro voice.
    """

    voice = "af_heart"

    def setup(self):
        super().setup()
        self.set_speech_service(KokoroService(voice=self.voice))
