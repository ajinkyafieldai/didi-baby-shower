#!/usr/bin/env bash
set -euo pipefail

if ! command -v pactl >/dev/null 2>&1; then
  echo "pactl not found. Install pulseaudio-utils." >&2
  exit 2
fi

echo "Available Pulse/PipeWire sources:"
pactl list short sources
echo
echo "For Zoom/system audio, choose a source ending in .monitor."
