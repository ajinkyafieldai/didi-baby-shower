#!/usr/bin/env bash
set -euo pipefail

: "${BABYSHOWER_URL:?BABYSHOWER_URL is required}"

log_dir="${BABYSHOWER_LOG_DIR:-/var/log/babyshower}"
mkdir -p "$log_dir"

node scripts/rtms-transcript.mjs \
  | tee -a "$log_dir/transcript.log" /dev/stderr \
  | node scripts/phrase-map.mjs \
  | xargs -r -n1 node babyshower.js trigger
