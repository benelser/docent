"""Speech services for manim-voiceover — local, offline, free.

`KokoroService` is the default: a local neural TTS model. `SayService` wraps the
native macOS `say` command as a zero-dependency fallback.
"""

import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

from manim_voiceover.helper import remove_bookmarks
from manim_voiceover.services.base import SpeechService

SAMPLE_RATE = 24000


class KokoroService(SpeechService):
    """Local neural text-to-speech via Kokoro.

    Voices are named like "af_heart" — first letter is the language (a = American
    English, b = British), second is gender (f/m). The model downloads once from
    Hugging Face, then runs entirely on the CPU.
    """

    def __init__(self, voice: str = "af_heart", **kwargs):
        from kokoro import KPipeline  # imported lazily — pulls in torch

        self.voice = voice
        self.pipeline = KPipeline(lang_code=voice[0])
        SpeechService.__init__(self, **kwargs)

    def generate_from_text(
        self, text: str, cache_dir: str = None, path: str = None, **kwargs
    ) -> dict:
        if cache_dir is None:
            cache_dir = self.cache_dir

        input_text = remove_bookmarks(text)
        input_data = {"input_text": input_text, "service": "kokoro", "voice": self.voice}

        cached = self.get_cached_result(input_data, cache_dir)
        if cached is not None:
            return cached

        audio_path = path or (self.get_audio_basename(input_data) + ".mp3")
        mp3_path = Path(cache_dir) / audio_path
        wav_path = mp3_path.with_suffix(".wav")

        chunks = [
            np.asarray(audio)
            for _, _, audio in self.pipeline(input_text, voice=self.voice)
        ]
        sf.write(str(wav_path), np.concatenate(chunks), SAMPLE_RATE)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), str(mp3_path)],
            check=True,
        )
        wav_path.unlink(missing_ok=True)

        return {
            "input_text": text,
            "input_data": input_data,
            "original_audio": audio_path,
        }


class SayService(SpeechService):
    """Native macOS text-to-speech, via the `say` command. A simple fallback."""

    def __init__(self, voice: str = "Samantha", rate: int | None = None, **kwargs):
        self.voice = voice
        self.rate = rate
        SpeechService.__init__(self, **kwargs)

    def generate_from_text(
        self, text: str, cache_dir: str = None, path: str = None, **kwargs
    ) -> dict:
        if cache_dir is None:
            cache_dir = self.cache_dir

        input_text = remove_bookmarks(text)
        input_data = {
            "input_text": input_text,
            "service": "macos-say",
            "voice": self.voice,
            "rate": self.rate,
        }

        cached = self.get_cached_result(input_data, cache_dir)
        if cached is not None:
            return cached

        audio_path = path or (self.get_audio_basename(input_data) + ".mp3")
        mp3_path = Path(cache_dir) / audio_path
        aiff_path = mp3_path.with_suffix(".aiff")

        cmd = ["say", "-v", self.voice, "-o", str(aiff_path)]
        if self.rate is not None:
            cmd += ["-r", str(self.rate)]
        cmd.append(input_text)
        subprocess.run(cmd, check=True)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(aiff_path), str(mp3_path)],
            check=True,
        )
        aiff_path.unlink(missing_ok=True)

        return {
            "input_text": text,
            "input_data": input_data,
            "original_audio": audio_path,
        }
