#!/usr/bin/env bash
# Load repo-root .env (with shell expansion) then run a command.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

usage() {
  echo "usage: tools/with-root-env.sh -- <command> [args...]" >&2
  exit 1
}

[[ $# -gt 0 ]] || usage

if [[ "${1:-}" == "--" ]]; then
  shift
fi

[[ $# -gt 0 ]] || usage
exec "$@"
