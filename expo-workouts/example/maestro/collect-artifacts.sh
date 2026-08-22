#!/usr/bin/env bash
# Copy the screenshots of the most recent Maestro run into `maestro/artifacts/`.
#
# Maestro 2.8.0 refuses absolute `takeScreenshot:` paths outside its own run folder (Phase 0 f131),
# so the flows use bare names and Maestro writes them to
#   ~/.maestro/tests/<timestamp>/<flow>/takeScreenshot/<name>.png
# This script gathers them where the mission expects them. `maestro/artifacts/` is gitignored.
#
#   ./maestro/collect-artifacts.sh          # newest run
#   ./maestro/collect-artifacts.sh 2026-08-22_205401
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="${MAESTRO_HOME:-$HOME/.maestro}/tests"
run="${1:-}"

if [ -z "$run" ]; then
  run="$(ls -1 "$root" | sort | tail -1)"
fi
src="$root/$run"
[ -d "$src" ] || { echo "no such Maestro run: $src" >&2; exit 1; }

mkdir -p "$here/artifacts"
found=0
while IFS= read -r png; do
  cp "$png" "$here/artifacts/"
  echo "  $(basename "$png")"
  found=$((found + 1))
done < <(find "$src" -path '*/takeScreenshot/*' -name '*.png' | sort)

echo "copied $found screenshot(s) from $run into maestro/artifacts/"
