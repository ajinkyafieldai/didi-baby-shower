#!/usr/bin/env bash
set -euo pipefail

repo_dir="${1:-/opt/babyshower/current}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

if ! id babyshower >/dev/null 2>&1; then
  useradd --system --home /nonexistent --shell /usr/sbin/nologin babyshower
fi

install -d -o babyshower -g babyshower -m 0750 /var/log/babyshower
install -d -o root -g babyshower -m 0750 /etc/babyshower

if [[ ! -f /etc/babyshower/rtms.env ]]; then
  install -o root -g babyshower -m 0640 "$repo_dir/deploy/rtms.env.example" /etc/babyshower/rtms.env
  echo "Created /etc/babyshower/rtms.env from example. Fill credentials before starting." >&2
fi

install -o root -g root -m 0644 "$repo_dir/deploy/systemd/babyshower-rtms.service" /etc/systemd/system/babyshower-rtms.service
chmod 0755 "$repo_dir/scripts/run-transcript-pipeline.sh"

systemctl daemon-reload
systemctl enable babyshower-rtms.service

echo "Installed babyshower-rtms.service."
echo "Next: configure /etc/babyshower/rtms.env and Cloudflare Tunnel, then start the service."
