#!/usr/bin/env bash
set -euo pipefail

env_file="${BABYSHOWER_ENV_FILE:-.env}"
venv="${BABYSHOWER_WHISPER_VENV:-.venv-whisper}"

if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file. Copy .env.example to .env and fill it in." >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

: "${BABYSHOWER_URL:?BABYSHOWER_URL is required}"

if [[ ! -x "$venv/bin/python" ]]; then
  echo "Missing Whisper venv at $venv." >&2
  echo "Run: python3 -m venv $venv && $venv/bin/pip install -r requirements-transcript.txt" >&2
  exit 2
fi

log_dir="${BABYSHOWER_LOG_DIR:-./logs}"
mkdir -p "$log_dir"

"$venv/bin/python" scripts/local-transcript.py \
  | tee -a "$log_dir/transcript.log" /dev/stderr \
  | node scripts/phrase-map.mjs \
  | xargs -r -n1 node babyshower.js trigger
