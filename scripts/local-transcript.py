#!/usr/bin/env python3
import os
import shutil
import subprocess
import sys
import time

import numpy as np
from faster_whisper import WhisperModel

RATE = 16000
CHANNELS = 1
SAMPLE_BYTES = 2

source = os.environ.get("BABYSHOWER_AUDIO_SOURCE", "default")
model_name = os.environ.get("BABYSHOWER_WHISPER_MODEL", "small")
language = os.environ.get("BABYSHOWER_WHISPER_LANGUAGE", "").strip() or None
allowed_languages = [
    value.strip()
    for value in os.environ.get("BABYSHOWER_WHISPER_ALLOWED_LANGUAGES", "en,mr,hi").split(",")
    if value.strip()
]
chunk_seconds = float(os.environ.get("BABYSHOWER_WHISPER_CHUNK_SECONDS", "2.5"))
context_seconds = float(os.environ.get("BABYSHOWER_WHISPER_CONTEXT_SECONDS", "5"))
device = os.environ.get("BABYSHOWER_WHISPER_DEVICE", "cpu")
compute_type = os.environ.get("BABYSHOWER_WHISPER_COMPUTE_TYPE", "int8")

if not shutil.which("ffmpeg"):
    print("[local-transcript] ffmpeg is required.", file=sys.stderr)
    raise SystemExit(2)

if chunk_seconds <= 0:
    raise SystemExit("BABYSHOWER_WHISPER_CHUNK_SECONDS must be > 0")

context_seconds = max(context_seconds, chunk_seconds)
chunk_samples = max(1, int(RATE * chunk_seconds))
chunk_bytes = chunk_samples * CHANNELS * SAMPLE_BYTES
context_samples = max(chunk_samples, int(RATE * context_seconds))

print(
    f"[local-transcript] source={source} model={model_name} "
    f"language={language or 'auto'} chunk={chunk_seconds:g}s "
    f"context={context_seconds:g}s",
    file=sys.stderr,
)

model = WhisperModel(
    model_name,
    device=device,
    compute_type=compute_type,
)

ffmpeg = subprocess.Popen(
    [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "pulse",
        "-i",
        source,
        "-ac",
        str(CHANNELS),
        "-ar",
        str(RATE),
        "-f",
        "s16le",
        "pipe:1",
    ],
    stdout=subprocess.PIPE,
)

assert ffmpeg.stdout is not None

rolling = np.empty(0, dtype=np.float32)

try:
    while True:
        data = ffmpeg.stdout.read(chunk_bytes)
        if not data:
            break
        if len(data) < RATE * SAMPLE_BYTES:
            continue

        current = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
        rolling = np.concatenate((rolling, current))
        if rolling.size > context_samples:
            rolling = rolling[-context_samples:]

        window_seconds = rolling.size / RATE
        new_audio_start = max(0.0, window_seconds - (current.size / RATE))

        started = time.monotonic()
        selected_language = language
        if selected_language is None and allowed_languages:
            _, _, all_language_probs = model.detect_language(
                audio=rolling,
                vad_filter=True,
                language_detection_segments=1,
            )
            candidates = {
                code: probability
                for code, probability in all_language_probs
                if code in allowed_languages
            }
            if candidates:
                selected_language = max(candidates, key=candidates.get)

        segments, info = model.transcribe(
            rolling,
            language=selected_language,
            beam_size=1,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        segments = list(segments)
        elapsed = time.monotonic() - started

        # The rolling window includes old audio for context. Only publish
        # segments that reach into the newest chunk. A small boundary grace
        # keeps commands spanning two chunks from being dropped; downstream
        # duplicate/cooldown handling prevents repeated triggers.
        boundary = max(0.0, new_audio_start - 0.35)
        fresh = [
            segment.text.strip()
            for segment in segments
            if segment.text.strip() and float(segment.end) > boundary
        ]
        text = " ".join(fresh).strip()

        if text:
            print(text, flush=True)
            print(
                f"[local-transcript] {elapsed:.2f}s {info.language}: {text}",
                file=sys.stderr,
                flush=True,
            )
finally:
    ffmpeg.terminate()
    try:
        ffmpeg.wait(timeout=2)
    except subprocess.TimeoutExpired:
        ffmpeg.kill()
