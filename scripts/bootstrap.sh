#!/usr/bin/env bash
# Thin wrapper: the real multi-harness installer is scripts/install.mjs (Node,
# cross-platform). This preserves the historical `bootstrap.sh [--dry-run]` entry point.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pass=()
for arg in "$@"; do
  case "$arg" in
    --dry-run|--all) pass+=("$arg") ;;
    *) echo "usage: $0 [--dry-run] [--all]" >&2; exit 2 ;;
  esac
done

exec node "$script_dir/install.mjs" "${pass[@]}"
