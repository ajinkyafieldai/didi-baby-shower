#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
unit_src="$repo_dir/deploy/systemd/babyshower-local-transcript.service"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
unit_dst="$unit_dir/babyshower-local-transcript.service"

for command in systemctl ffmpeg python3 node; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 2
  fi
done

if [[ ! -f "$repo_dir/.env" ]]; then
  echo "Missing $repo_dir/.env" >&2
  echo "Copy .env.example to .env and configure it first." >&2
  exit 2
fi

if [[ ! -x "$repo_dir/.venv-whisper/bin/python" ]]; then
  echo "Missing Whisper environment: $repo_dir/.venv-whisper" >&2
  echo "Run:" >&2
  echo "  python3 -m venv .venv-whisper" >&2
  echo "  .venv-whisper/bin/pip install -r requirements-transcript.txt" >&2
  exit 2
fi

mkdir -p "$unit_dir"

escaped_repo=${repo_dir//\\/\\\\}
escaped_repo=${escaped_repo//&/\\&}
escaped_repo=${escaped_repo//|/\\|}

sed "s|__REPO_DIR__|$escaped_repo|g" "$unit_src" > "$unit_dst"

systemctl --user daemon-reload
systemctl --user enable --now babyshower-local-transcript.service

echo
echo "Installed and started babyshower-local-transcript.service"
echo
echo "Status:"
echo "  systemctl --user status babyshower-local-transcript.service"
echo
echo "Live logs:"
echo "  journalctl --user -u babyshower-local-transcript.service -f"
echo
echo "Restart after editing .env:"
echo "  systemctl --user restart babyshower-local-transcript.service"
