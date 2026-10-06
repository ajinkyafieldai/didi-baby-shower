#!/usr/bin/env bash
set -euo pipefail

env_file="${BABYSHOWER_ENV_FILE:-.env}"

if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file. Copy .env.example to .env and fill it in." >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

exec bash ./scripts/run-transcript-pipeline.sh
