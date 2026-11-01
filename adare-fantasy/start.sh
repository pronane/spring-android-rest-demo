#!/usr/bin/env sh
#
# Starts Twenty-Eight (and its local Postgres, if .env.local points at it).
#
#   ./start.sh            production build, http://localhost:3000
#   ./start.sh --dev      development server with hot reload
#   ./start.sh --e2e      start, run the end-to-end test, stop
#
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  # A portable Node installed by install.sh, if there is one.
  if [ -f "$HOME/.twenty-eight/node/bin-path" ]; then
    PATH="$(cat "$HOME/.twenty-eight/node/bin-path"):$PATH"
    export PATH
  else
    printf '\nNode is not installed. Run ./install.sh first.\n\n' >&2
    exit 1
  fi
fi

exec node scripts/start.mjs "$@"
