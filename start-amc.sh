#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 24 LTS or newer from nodejs.org, then try again.' >&2
  exit 1
fi
exec node scripts/start.mjs
