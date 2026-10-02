#!/usr/bin/env bash
# Copies mods from a Claude Code dev-mods folder (where they hot-reload while
# you edit them) into the repo root, one folder per mod, leaving out the files the engine generates.
#
#   scripts/sync-from-dev.sh ~/.claude/dev-mods/<session-id>
set -euo pipefail

src="${1:?usage: $0 <dev-mods folder>}"
dest="$(cd "$(dirname "$0")/.." && pwd)"

for mod in "$src"/*/; do
  name="$(basename "$mod")"
  [ -f "$mod/.claude-plugin/plugin.json" ] || continue
  rsync -a --delete \
    --exclude '.claude-plugin/types/' \
    --exclude 'tsconfig.json' \
    --exclude 'node_modules/' \
    --exclude '.DS_Store' \
    "$mod" "$dest/$name/"
  echo "synced $name"
done
