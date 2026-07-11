#!/usr/bin/env bash
set -euo pipefail

dry_run=0
if [[ "${1:-}" == "--dry-run" ]]; then dry_run=1; elif [[ $# -gt 0 ]]; then echo "usage: $0 [--dry-run]" >&2; exit 2; fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$script_dir/.." && pwd)"
payload="$repo/home"
codex_home="${CODEX_HOME:-$HOME/.codex}"
stamp="$(date +%Y%m%d-%H%M%S)"
backup_root="$repo/.bootstrap-backups/$stamp"
changed=0
backed_up=0

install_file() {
  local source="$1" relative="$2" destination="$codex_home/$2"
  if [[ -f "$destination" ]]; then
    if cmp -s "$source" "$destination"; then printf 'ok       %s\n' "$relative"; return; fi
    printf 'backup   %s\n' "$relative"
    if (( ! dry_run )); then mkdir -p "$(dirname "$backup_root/$relative")"; cp "$destination" "$backup_root/$relative"; fi
    backed_up=$((backed_up + 1))
  fi
  printf 'install  %s\n' "$relative"
  if (( ! dry_run )); then mkdir -p "$(dirname "$destination")"; cp "$source" "$destination"; fi
  changed=$((changed + 1))
}

printf 'CODEX_HOME: %s\n' "$codex_home"
while IFS= read -r -d '' source; do install_file "$source" "${source#"$payload/"}"; done < <(find "$payload" -type f -print0)
for tool in checkpoint.mjs local-llm.mjs route-task.mjs codex-sync.mjs; do install_file "$script_dir/$tool" "bootstrap-tools/$tool"; done

if (( ! dry_run )); then
  mkdir -p "$codex_home"
  printf '{\n  "repository": "%s",\n  "installed_at": "%s",\n  "version": 1\n}\n' "${repo//\\/\\\\}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$codex_home/bootstrap-source.json"
fi
printf 'Done: %d installed, %d backed up. Restart Codex to reload the environment.\n' "$changed" "$backed_up"
