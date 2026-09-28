#!/usr/bin/env bash
# Safe Corvidinho box update: fetch → checkout → bun install → doctor → restart bridge.
# On failure after checkout/install/ready-wait: rollback to previous tip. Never Discord-spam.
#
# Usage:
#   ./scripts/corvidinho-update.sh
#   CORVIDINHO_REF=v0.0.3 ./scripts/corvidinho-update.sh
#   CORVIDINHO_UPDATE_DRY_RUN=1 ./scripts/corvidinho-update.sh
#
# Env:
#   CORVIDINHO_REF            git ref (tag/branch/sha); default origin/main
#   CORVIDINHO_ROOT           repo root
#   CORVIDINHO_ENV_FILE       secrets env sourced once, after bun install and before doctor, so
#                             doctor, every restart path and rollback see it
#                             (default ~/.config/corvidinho/env)
#   CORVIDINHO_PIDFILE        default /tmp/corvidinho-discord-bridge.pid
#   CORVIDINHO_BRIDGE_LOG     default /tmp/corvidinho-discord-bridge.log
#   CORVIDINHO_READY_TIMEOUT  seconds (default 60) to wait, in pidfile mode, for the bridge's
#                             Discord login line "[discord] logged in as …" (not the earlier
#                             "protocol version N OK" line); no login line in time → rollback
#   CORVIDINHO_USE_PIDFILE=1  force pidfile stop/start (default: pidfile unless a UNIT is set;
#                             with no UNIT, pidfile if the file exists or no CMD)
#   CORVIDINHO_BRIDGE_UNIT    systemd unit (optional; wins over a leftover pidfile)
#   CORVIDINHO_BRIDGE_CMD     restart command when no unit (optional). Runs via
#                             `bash -lc 'eval "$CORVIDINHO_BRIDGE_CMD"'` so its text is not on the
#                             shell's argv and `pkill -f <pattern>` cannot match that shell.
#   CORVIDINHO_UPDATE_DRY_RUN=1
#   CORVIDINHO_SKIP_DOCTOR=1
#   CORVIDINHO_SKIP_RESTART=1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/update-helpers.sh
source "${SCRIPT_DIR}/lib/update-helpers.sh"

log() { printf '[corvidinho-update] %s\n' "$*"; }
die() { printf '[corvidinho-update] ERROR: %s\n' "$*" >&2; exit 1; }

ROOT="${CORVIDINHO_ROOT:-}"
if [ -z "$ROOT" ]; then
  CANDIDATE="$(cd "$SCRIPT_DIR/.." && pwd)"
  if [ -d "$CANDIDATE/.git" ] || [ -f "$CANDIDATE/package.json" ]; then
    ROOT="$CANDIDATE"
  else
    ROOT="$(pwd)"
  fi
fi
cd "$ROOT" || die "cannot cd to $ROOT"

command -v git >/dev/null || die "git not found"
command -v bun >/dev/null || die "bun not found (Linux-only dogfood)"

REF="${CORVIDINHO_REF:-origin/main}"
DRY="${CORVIDINHO_UPDATE_DRY_RUN:-0}"
SKIP_DOCTOR="${CORVIDINHO_SKIP_DOCTOR:-0}"
SKIP_RESTART="${CORVIDINHO_SKIP_RESTART:-0}"
UNIT="${CORVIDINHO_BRIDGE_UNIT:-}"
BRIDGE_CMD="${CORVIDINHO_BRIDGE_CMD:-}"
ENV_FILE="${CORVIDINHO_ENV_FILE:-${HOME}/.config/corvidinho/env}"
PIDFILE="${CORVIDINHO_PIDFILE:-/tmp/corvidinho-discord-bridge.pid}"
BRIDGE_LOG="${CORVIDINHO_BRIDGE_LOG:-/tmp/corvidinho-discord-bridge.log}"
READY_TIMEOUT="${CORVIDINHO_READY_TIMEOUT:-60}"
USE_PIDFILE="${CORVIDINHO_USE_PIDFILE:-}"

PREV_SHA="$(git rev-parse HEAD 2>/dev/null || true)"
[ -n "$PREV_SHA" ] || die "not a git checkout (no HEAD)"

log "root=$ROOT ref=$REF prev=$PREV_SHA dry_run=$DRY"

if [ "$DRY" = "1" ]; then
  log "DRY RUN: would fetch, checkout $REF, bun install, doctor, restart (pidfile=$PIDFILE unit=${UNIT:-none})"
  git fetch --tags --prune origin || true
  exit 0
fi

ENV_LOADED=0
# Idempotent: doctor, every restart path (pidfile, unit, command) and rollback share one env.
load_env_file() {
  [ "$ENV_LOADED" = "1" ] && return 0
  ENV_LOADED=1
  if [ -f "$ENV_FILE" ]; then
    log "sourcing env file: $ENV_FILE (secrets not logged)"
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  else
    log "env file not found ($ENV_FILE) — using process environment"
  fi
}

want_pidfile() {
  if [ "${USE_PIDFILE}" = "1" ] || [ "${USE_PIDFILE,,}" = "true" ]; then
    return 0
  fi
  # An explicitly configured systemd unit wins over a leftover pidfile: starting a
  # nohup bridge next to the unit's bridge would answer every mention twice.
  if [ -n "$UNIT" ]; then
    return 1
  fi
  if [ -f "$PIDFILE" ]; then
    return 0
  fi
  # Prefer pidfile when neither systemd nor custom cmd configured
  if [ -z "$BRIDGE_CMD" ]; then
    return 0
  fi
  return 1
}

# Unit mode: a pidfile left from an earlier pidfile-mode run is not ours to act on.
# Drop it when its pid is gone; never signal a live pid (it may be recycled).
drop_leftover_pidfile() {
  [ -f "$PIDFILE" ] || return 0
  local pid
  pid="$(tr -d '[:space:]' < "$PIDFILE" 2>/dev/null || true)"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    log "unit mode: ignoring leftover pidfile $PIDFILE (pid $pid is alive — stop it yourself if it is a stray bridge)"
    return 0
  fi
  log "unit mode: removing stale pidfile $PIDFILE"
  rm -f "$PIDFILE" 2>/dev/null || log "unit mode: could not remove $PIDFILE (ignored)"
}

stop_via_pidfile() {
  if [ ! -f "$PIDFILE" ]; then
    log "no pidfile at $PIDFILE"
    return 0
  fi
  local pid
  pid="$(tr -d '[:space:]' < "$PIDFILE" || true)"
  if [ -z "$pid" ] || ! [[ "$pid" =~ ^[0-9]+$ ]]; then
    log "invalid pidfile — removing"
    rm -f "$PIDFILE"
    return 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    log "stale pid $pid — removing pidfile"
    rm -f "$PIDFILE"
    return 0
  fi
  log "stopping bridge pid=$pid (SIGTERM)"
  kill -TERM "$pid" 2>/dev/null || true
  local i=0
  while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 20 ]; do
    sleep 0.25
    i=$((i + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    log "SIGKILL pid=$pid"
    kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"
  log "bridge stopped"
}

start_via_pidfile() {
  mkdir -p "$(dirname "$BRIDGE_LOG")"
  : > "$BRIDGE_LOG"
  local bin="${CORVIDINHO_BIN:-${ROOT}/src/cli.ts}"
  log "starting bridge via pidfile (log=$BRIDGE_LOG)"
  (
    cd "$ROOT"
    nohup bun "$bin" discord bridge >>"$BRIDGE_LOG" 2>&1 &
    echo $! > "$PIDFILE"
  )
  log "spawned pid=$(tr -d '[:space:]' < "$PIDFILE")"
}

wait_for_ready() {
  local deadline=$((SECONDS + READY_TIMEOUT))
  log "waiting up to ${READY_TIMEOUT}s for ${BRIDGE_READY_LINE} … in $BRIDGE_LOG"
  while [ "$SECONDS" -lt "$deadline" ]; do
    if [ -f "$BRIDGE_LOG" ] && log_indicates_ready "$(cat "$BRIDGE_LOG" 2>/dev/null || true)"; then
      log "ready signal observed"
      return 0
    fi
    if [ -f "$PIDFILE" ]; then
      local pid
      pid="$(tr -d '[:space:]' < "$PIDFILE" || true)"
      if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
        log "bridge exited before ready"
        return 1
      fi
    fi
    sleep 0.5
  done
  log "ready timeout: no '${BRIDGE_READY_LINE} …' line within ${READY_TIMEOUT}s — log only (no Discord panic)"
  return 1
}

rollback() {
  local reason="$1"
  log "ROLLBACK: $reason → $PREV_SHA (no Discord panic post)"
  if git checkout --force "$PREV_SHA" >/dev/null 2>&1; then
    bun install --frozen-lockfile >/dev/null 2>&1 || bun install >/dev/null 2>&1 || true
    log "ROLLBACK: checkout restored to $PREV_SHA"
    [ "$SKIP_RESTART" = "1" ] || load_env_file
    if [ "$SKIP_RESTART" != "1" ] && want_pidfile; then
      stop_via_pidfile || true
      start_via_pidfile || true
      wait_for_ready || log "ROLLBACK: ready wait failed after restore"
    elif [ "$SKIP_RESTART" != "1" ] && [ -n "$UNIT" ]; then
      systemctl restart "$UNIT" >/dev/null 2>&1 || true
    fi
  else
    log "ROLLBACK: FAILED to restore $PREV_SHA — manual intervention required"
  fi
  exit 1
}

log "fetching origin…"
git fetch --tags --prune origin || die "git fetch failed"

log "checking out $REF…"
if ! git checkout --force "$REF"; then
  die "git checkout $REF failed (still on $PREV_SHA)"
fi
NEW_SHA="$(git rev-parse HEAD)"
log "now=$NEW_SHA"

log "bun install…"
if ! bun install --frozen-lockfile; then
  log "frozen-lockfile failed; retrying bun install"
  bun install || rollback "bun install failed"
fi

# After fetch/install (secrets stay out of those), before doctor and any restart.
load_env_file

if [ "$SKIP_DOCTOR" != "1" ]; then
  log "doctor…"
  if ! bun src/cli.ts doctor; then
    rollback "doctor failed after update"
  fi
  log "version: $(bun src/cli.ts version 2>/dev/null || true)"
else
  log "skipping doctor (CORVIDINHO_SKIP_DOCTOR=1)"
fi

if [ "$SKIP_RESTART" = "1" ]; then
  log "skipping restart (CORVIDINHO_SKIP_RESTART=1)"
  log "OK updated $PREV_SHA → $NEW_SHA (no restart)"
  exit 0
fi

restart_ok=0
if want_pidfile; then
  stop_via_pidfile
  start_via_pidfile
  if wait_for_ready; then
    restart_ok=1
  else
    log "pidfile start ready-wait failed"
  fi
elif [ -n "$UNIT" ]; then
  drop_leftover_pidfile
  log "restarting systemd unit $UNIT…"
  if systemctl restart "$UNIT"; then
    sleep 2
    if systemctl is-active --quiet "$UNIT"; then
      restart_ok=1
      log "unit $UNIT active"
    fi
  fi
elif [ -n "$BRIDGE_CMD" ]; then
  log "running CORVIDINHO_BRIDGE_CMD…"
  # Command text via env, not argv: `pkill -f` in it must not match this shell.
  if CORVIDINHO_BRIDGE_CMD="$BRIDGE_CMD" bash -lc 'eval "$CORVIDINHO_BRIDGE_CMD"'; then
    restart_ok=1
  fi
else
  log "no restart target configured"
  restart_ok=1
fi

if [ "$restart_ok" != "1" ]; then
  rollback "bridge restart/health failed"
fi

log "OK updated $PREV_SHA → $NEW_SHA"
exit 0
