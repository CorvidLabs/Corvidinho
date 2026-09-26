#!/usr/bin/env bash
# Safe Corvidinho box update: fetch → checkout → bun install → doctor → restart bridge.
# On failure after checkout/install: attempt rollback to previous tip. Never Discord-spam.
#
# Usage:
#   ./scripts/corvidinho-update.sh                 # update to origin/main
#   CORVIDINHO_REF=v0.0.2 ./scripts/corvidinho-update.sh
#   CORVIDINHO_UPDATE_DRY_RUN=1 ./scripts/corvidinho-update.sh
#
# Env:
#   CORVIDINHO_REF          git ref (tag/branch/sha); default origin/main
#   CORVIDINHO_ROOT         repo root; default script's parent parent or cwd if .git
#   CORVIDINHO_BRIDGE_UNIT  systemd unit name; default empty (skip systemctl)
#   CORVIDINHO_BRIDGE_CMD   restart command when unit unset; default empty (skip restart)
#   CORVIDINHO_UPDATE_DRY_RUN=1  plan only; no checkout/install/restart
#   CORVIDINHO_SKIP_DOCTOR=1      skip doctor gate (not recommended)
#   CORVIDINHO_SKIP_RESTART=1     skip restart even if unit/cmd set
set -euo pipefail

log() { printf '[corvidinho-update] %s\n' "$*"; }
die() { printf '[corvidinho-update] ERROR: %s\n' "$*" >&2; exit 1; }

ROOT="${CORVIDINHO_ROOT:-}"
if [ -z "$ROOT" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

PREV_SHA="$(git rev-parse HEAD 2>/dev/null || true)"
[ -n "$PREV_SHA" ] || die "not a git checkout (no HEAD)"

log "root=$ROOT"
log "ref=$REF"
log "prev=$PREV_SHA"
log "dry_run=$DRY"

if [ "$DRY" = "1" ]; then
  log "DRY RUN: would fetch, checkout $REF, bun install, doctor, restart (unit=${UNIT:-none})"
  git fetch --tags --prune origin || true
  log "DRY RUN: fetch ok (best-effort)"
  exit 0
fi

rollback() {
  local reason="$1"
  log "ROLLBACK: $reason → $PREV_SHA"
  if git checkout --force "$PREV_SHA" >/dev/null 2>&1; then
    bun install --frozen-lockfile >/dev/null 2>&1 || bun install >/dev/null 2>&1 || true
    log "ROLLBACK: checkout restored to $PREV_SHA"
  else
    log "ROLLBACK: FAILED to restore $PREV_SHA — manual intervention required"
  fi
  # Deliberately no Discord notify — operators read exit code / logs.
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
if [ -n "$UNIT" ]; then
  log "restarting systemd unit $UNIT…"
  if systemctl restart "$UNIT"; then
    sleep 2
    if systemctl is-active --quiet "$UNIT"; then
      restart_ok=1
      log "unit $UNIT active"
    else
      log "unit $UNIT not active after restart"
    fi
  else
    log "systemctl restart $UNIT failed"
  fi
elif [ -n "$BRIDGE_CMD" ]; then
  log "running CORVIDINHO_BRIDGE_CMD…"
  # shellcheck disable=SC2086
  if bash -lc "$BRIDGE_CMD"; then
    restart_ok=1
  else
    log "BRIDGE_CMD failed"
  fi
else
  log "no CORVIDINHO_BRIDGE_UNIT / CORVIDINHO_BRIDGE_CMD — skip restart"
  restart_ok=1
fi

if [ "$restart_ok" != "1" ]; then
  rollback "bridge restart/health failed"
fi

log "OK updated $PREV_SHA → $NEW_SHA"
exit 0
