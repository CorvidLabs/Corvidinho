#!/usr/bin/env bash
# Safe box update for Corvidinho (Discord bridge).
#
# - Fetches, records previous SHA, checks out CORVIDINHO_REF (tag or main)
# - bun install; optional doctor
# - Stops bridge via pidfile /tmp/corvidinho-discord-bridge.pid
# - Starts bridge with env from CORVIDINHO_ENV_FILE (never hardcodes secrets)
# - Waits for "[discord] logged in" / protocol OK in log; else rollback + restart
# - Failures: log only — NEVER post panic messages to Discord
#
# Usage:
#   scripts/corvidinho-update.sh
#   CORVIDINHO_REF=v0.0.3 scripts/corvidinho-update.sh
#   CORVIDINHO_REF=main CORVIDINHO_RUN_DOCTOR=1 scripts/corvidinho-update.sh
#
# Env (all optional except secrets must live in env file / process env):
#   CORVIDINHO_ROOT           repo root (default: parent of scripts/)
#   CORVIDINHO_REF            git ref to checkout (default: main)
#   CORVIDINHO_ENV_FILE       secrets env file to source (default: ~/.config/corvidinho/env)
#   CORVIDINHO_BRIDGE_LOG     bridge stdout/stderr log (default: /tmp/corvidinho-discord-bridge.log)
#   CORVIDINHO_PIDFILE        default /tmp/corvidinho-discord-bridge.pid
#   CORVIDINHO_READY_TIMEOUT  seconds to wait for ready (default: 60)
#   CORVIDINHO_RUN_DOCTOR     if 1/true, run `bun src/cli.ts doctor` after install
#   CORVIDINHO_SKIP_START     if 1/true, update tree only (no stop/start)
#   CORVIDINHO_DRY_RUN        if 1/true, print plan and exit 0 (no git/bun/bridge)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/update-helpers.sh
source "${SCRIPT_DIR}/lib/update-helpers.sh"

ROOT="${CORVIDINHO_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
REF="${CORVIDINHO_REF:-main}"
ENV_FILE="${CORVIDINHO_ENV_FILE:-${HOME}/.config/corvidinho/env}"
BRIDGE_LOG="${CORVIDINHO_BRIDGE_LOG:-/tmp/corvidinho-discord-bridge.log}"
PIDFILE="${CORVIDINHO_PIDFILE:-/tmp/corvidinho-discord-bridge.pid}"
READY_TIMEOUT="${CORVIDINHO_READY_TIMEOUT:-60}"
RUN_DOCTOR="${CORVIDINHO_RUN_DOCTOR:-0}"
SKIP_START="${CORVIDINHO_SKIP_START:-0}"
DRY_RUN="${CORVIDINHO_DRY_RUN:-0}"
PREV_SHA_FILE="${CORVIDINHO_PREV_SHA_FILE:-/tmp/corvidinho-update-prev.sha}"

log() { printf '[corvidinho-update] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

load_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    log "sourcing env file: $ENV_FILE (secrets not logged)"
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  else
    log "env file not found ($ENV_FILE) — relying on process environment"
  fi
}

stop_bridge() {
  if [[ ! -f "$PIDFILE" ]]; then
    log "no pidfile at $PIDFILE — bridge not tracked as running"
    return 0
  fi
  local pid
  pid="$(tr -d '[:space:]' < "$PIDFILE" || true)"
  if [[ -z "$pid" || ! "$pid" =~ ^[0-9]+$ ]]; then
    log "pidfile $PIDFILE empty/invalid — removing"
    rm -f "$PIDFILE"
    return 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    log "stale pidfile (pid $pid not running) — removing"
    rm -f "$PIDFILE"
    return 0
  fi
  log "stopping bridge pid=$pid (SIGTERM)"
  kill -TERM "$pid" 2>/dev/null || true
  local i=0
  while kill -0 "$pid" 2>/dev/null && (( i < 20 )); do
    sleep 0.25
    i=$((i + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    log "bridge still alive — SIGKILL"
    kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"
  log "bridge stopped"
}

start_bridge() {
  load_env_file
  mkdir -p "$(dirname "$BRIDGE_LOG")"
  : > "$BRIDGE_LOG"
  local bin="${CORVIDINHO_BIN:-${ROOT}/src/cli.ts}"
  log "starting bridge: bun $bin discord bridge (log=$BRIDGE_LOG pidfile=$PIDFILE)"
  # Do not pass secrets on the command line — inherit env only.
  (
    cd "$ROOT"
    nohup bun "$bin" discord bridge >>"$BRIDGE_LOG" 2>&1 &
    echo $! > "$PIDFILE"
  )
  local pid
  pid="$(tr -d '[:space:]' < "$PIDFILE")"
  log "bridge spawned pid=$pid"
}

wait_for_ready() {
  local deadline=$((SECONDS + READY_TIMEOUT))
  log "waiting up to ${READY_TIMEOUT}s for ready signal in $BRIDGE_LOG"
  while (( SECONDS < deadline )); do
    if [[ -f "$BRIDGE_LOG" ]] && log_indicates_ready "$(cat "$BRIDGE_LOG" 2>/dev/null || true)"; then
      log "ready signal observed"
      return 0
    fi
    # Early death of process
    if [[ -f "$PIDFILE" ]]; then
      local pid
      pid="$(tr -d '[:space:]' < "$PIDFILE" || true)"
      if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
        log "bridge process exited before ready (see $BRIDGE_LOG)"
        return 1
      fi
    fi
    sleep 0.5
  done
  log "timeout waiting for ready (see $BRIDGE_LOG) — will not post to Discord"
  return 1
}

checkout_ref() {
  local target="$1"
  log "git fetch --tags origin"
  git -C "$ROOT" fetch --tags origin
  log "git checkout --detach? or branch: $target"
  if git -C "$ROOT" rev-parse --verify "refs/tags/${target}" >/dev/null 2>&1; then
    git -C "$ROOT" checkout --force "tags/${target}"
  elif git -C "$ROOT" show-ref --verify --quiet "refs/remotes/origin/${target}"; then
    git -C "$ROOT" checkout --force -B "$target" "origin/${target}"
  else
    git -C "$ROOT" checkout --force "$target"
  fi
  log "now at $(git -C "$ROOT" rev-parse --short HEAD) ($(git -C "$ROOT" describe --tags --always 2>/dev/null || true))"
}

install_deps() {
  log "bun install --frozen-lockfile (fallback without freeze)"
  if ! (cd "$ROOT" && bun install --frozen-lockfile); then
    log "frozen-lockfile failed — bun install"
    (cd "$ROOT" && bun install)
  fi
}

maybe_doctor() {
  case "${RUN_DOCTOR,,}" in
    1|true|yes|on)
      log "running doctor (optional)"
      (cd "$ROOT" && bun src/cli.ts doctor) || log "doctor exited non-zero (continuing)"
      ;;
    *) log "skipping doctor (set CORVIDINHO_RUN_DOCTOR=1 to enable)" ;;
  esac
}

rollback_to() {
  local prev="$1"
  log "ROLLBACK to $prev (log-only; no Discord panic post)"
  git -C "$ROOT" checkout --force "$prev"
  install_deps
  if [[ "${SKIP_START}" != "1" && "${SKIP_START,,}" != "true" ]]; then
    stop_bridge
    start_bridge
    if wait_for_ready; then
      log "rollback ready OK"
      return 0
    fi
    log "rollback started but ready wait failed — manual intervention needed (log only)"
    return 1
  fi
  return 0
}

main() {
  log "root=$ROOT ref=$REF env_file=$ENV_FILE"
  [[ -d "$ROOT/.git" ]] || die "not a git repo: $ROOT"

  if [[ "${DRY_RUN}" == "1" || "${DRY_RUN,,}" == "true" ]]; then
    log "DRY_RUN: would update to $REF, pidfile=$PIDFILE, log=$BRIDGE_LOG"
    exit 0
  fi

  local prev
  prev="$(git -C "$ROOT" rev-parse HEAD)"
  printf '%s\n' "$prev" > "$PREV_SHA_FILE"
  log "recorded previous SHA $prev -> $PREV_SHA_FILE"

  checkout_ref "$REF"
  install_deps
  maybe_doctor

  if [[ "${SKIP_START}" == "1" || "${SKIP_START,,}" == "true" ]]; then
    log "CORVIDINHO_SKIP_START set — tree updated; not touching bridge"
    exit 0
  fi

  stop_bridge
  start_bridge
  local wait_ok=0
  if wait_for_ready; then
    wait_ok=1
  fi

  if should_rollback "$wait_ok" "$prev"; then
    rollback_to "$prev" || exit 1
    exit 1
  fi

  log "update complete at $(git -C "$ROOT" rev-parse --short HEAD)"
}

main "$@"
