#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OFFICE_BASE_PATH="${OFFICE_BASE_PATH:-/office}"
OFFICE_VERSION="${OFFICE_VERSION:-v9.3.0.24-1}"

cd "$ROOT"
export OFFICE_BASE_PATH
export NEXT_PUBLIC_APP_ROOT="${OFFICE_BASE_PATH}/${OFFICE_VERSION}"
export NEXT_PUBLIC_OFFICE_BASE_PATH="${OFFICE_BASE_PATH}"

pnpm run build:upstream
node utils/build-slim.mjs

echo "Build complete: ${ROOT}/out/"
