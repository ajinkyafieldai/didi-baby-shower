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
language = os.environ.get("BABYSHOWER_WHISPER_LANGUAGE", "en").strip() or None
chunk_seconds = float(os.environ.get("BABYSHOWER_WHISPER_CHUNK_SECONDS", "4"))
device = os.environ.get("BABYSHOWER_WHISPER_DEVICE", "auto")
compute_type = os.environ.get("BABYSHOWER_WHISPER_COMPUTE_TYPE", "default")

if not shutil.which("ffmpeg"):
    print("[local-transcript] ffmpeg is required.", file=sys.stderr)
    raise SystemExit(2)

chunk_bytes = int(RATE * CHANNELS * SAMPLE_BYTES * chunk_seconds)

print(
    f"[local-transcript] source={source} model={model_name} "
    f"language={language or 'auto'} chunk={chunk_seconds:g}s",
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

try:
    while True:
        data = ffmpeg.stdout.read(chunk_bytes)
        if not data:
            break
        if len(data) < RATE * SAMPLE_BYTES:
            continue

        audio = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0

        started = time.monotonic()
        segments, info = model.transcribe(
            audio,
            language=language,
            beam_size=1,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        elapsed = time.monotonic() - started

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
