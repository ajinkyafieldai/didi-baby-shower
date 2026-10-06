#!/usr/bin/env bash
set -euo pipefail

session="${BABYSHOWER_TMUX_SESSION:-babyshower-transcript}"
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
action="${1:-start}"

need_tmux() {
  if ! command -v tmux >/dev/null 2>&1; then
    echo "tmux is required. Install it with: sudo apt install tmux" >&2
    exit 2
  fi
}

exists() {
  tmux has-session -t "$session" 2>/dev/null
}

case "$action" in
  start)
    need_tmux
    if exists; then
      echo "Transcript session already running: $session"
      echo "Attach with: tmux attach -t $session"
      exit 0
    fi

    tmux new-session -d -s "$session" -c "$repo_dir"       "npm run transcript:local"

    sleep 0.5

    if ! exists; then
      echo "Transcript session exited immediately." >&2
      echo "Run 'npm run transcript:local' directly to see the startup error." >&2
      exit 1
    fi

    echo "Started transcript session: $session"
    echo "Attach: tmux attach -t $session"
    echo "Stop:   npm run transcript:tmux -- stop"
    ;;

  attach)
    need_tmux
    if ! exists; then
      echo "Transcript session is not running." >&2
      exit 1
    fi
    exec tmux attach -t "$session"
    ;;

  status)
    need_tmux
    if exists; then
      echo "running: $session"
      tmux list-panes -t "$session" -F 'pane=#{pane_index} pid=#{pane_pid} command=#{pane_current_command}'
    else
      echo "stopped: $session"
      exit 1
    fi
    ;;

  stop)
    need_tmux
    if exists; then
      tmux kill-session -t "$session"
      echo "Stopped transcript session: $session"
    else
      echo "Transcript session already stopped: $session"
    fi
    ;;

  *)
    echo "Usage: $0 [start|attach|status|stop]" >&2
    exit 2
    ;;
esac
