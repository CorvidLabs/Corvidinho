# Shared helpers for scripts/corvidinho-update.sh (sourced; not executed alone).
# Keep predicates pure so tests can `bash -c 'source …; …'`.

# Return 0 if a log line (or blob) indicates Discord bridge is ready.
# Matches bridge stdout: "[discord] logged in as …" and "protocol version N OK".
log_indicates_ready() {
  local blob="${1:-}"
  [[ -n "$blob" ]] || return 1
  if printf '%s\n' "$blob" | grep -Eq '\[discord\] logged in'; then
    return 0
  fi
  if printf '%s\n' "$blob" | grep -Eq 'protocol version[[:space:]]+[0-9]+[[:space:]]+OK'; then
    return 0
  fi
  return 1
}

# Extract a CHANGELOG.md section for version VER (with or without leading v).
# Prints body lines (no heading). Exit 1 if missing/empty.
extract_changelog_section() {
  local file="${1:?}"
  local ver="${2:?}"
  ver="${ver#v}"
  [[ -f "$file" ]] || return 1
  local out
  out="$(
    awk -v ver="$ver" '
      BEGIN { want=0 }
      /^##[ \t]+v?/ {
        heading=$0
        sub(/^##[ \t]+/, "", heading)
        if (heading == ver || heading == ("v" ver)) { want=1; next }
        else if (want) { exit }
      }
      want { print }
    ' "$file"
  )"
  # Trim trailing blank lines
  out="$(printf '%s\n' "$out" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')"
  [[ -n "${out// }" ]] || return 1
  printf '%s\n' "$out"
}

# Decide whether rollback should run given wait outcome and previous SHA.
# Args: wait_ok (0|1) previous_sha
# Exit 0 = should rollback; 1 = do not.
should_rollback() {
  local wait_ok="${1:?}"
  local prev="${2:-}"
  if [[ "$wait_ok" == "1" ]]; then
    return 1
  fi
  [[ -n "$prev" ]] || return 1
  return 0
}
