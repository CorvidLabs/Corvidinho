# Shared helpers for scripts/corvidinho-update.sh (sourced; not executed alone).
# Keep predicates pure so tests can `bash -c 'source …; …'`.

# The bridge prints this line on Discord ClientReady, i.e. only after a successful login
# (src/discord/gateway.ts). Keep the two in step.
BRIDGE_READY_LINE='[discord] logged in as'

# Return 0 if a log line (or blob) indicates the Discord bridge is ready.
# Only the login line counts: "[discord] protocol version N OK" is printed before
# client.login, so a bridge with a bad token prints it and then dies.
log_indicates_ready() {
  local blob="${1:-}"
  [[ -n "$blob" ]] || return 1
  # Plain substring match, no pipe: under the updater's pipefail a grep -q that stops
  # reading early could fail the pipeline on a long log.
  [[ "$blob" == *"$BRIDGE_READY_LINE "* ]]
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
