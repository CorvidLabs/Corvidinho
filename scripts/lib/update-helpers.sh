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

# --- Release tagging (.github/workflows/release.yml) -------------------------

# Package version in package.json at commit-ish $1 (empty when there is none).
package_version_at() {
  local rev="${1:-}"
  [[ -n "$rev" ]] || return 1
  git show "${rev}:package.json" 2>/dev/null |
    python3 -c 'import json, sys
try:
    v = json.load(sys.stdin).get("version", "")
    print(v if isinstance(v, str) else "")
except Exception:
    pass' 2>/dev/null || true
}

# True when $1 is a plain release version (X.Y.Z, no pre-release suffix).
is_release_version() {
  [[ "${1:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# Print "VERSION SHA" for the first commit on ref $1 (default origin/main) whose
# package.json carries each package version, oldest first. That commit is the
# one that bumped the version, so it is where v<VERSION> is tagged. A bad ref fails.
package_version_commits() {
  local ref="${1:-origin/main}" list c v seen=" "
  list="$(git log --reverse --format=%H "$ref" -- package.json)" || return 1
  while read -r c; do
    [[ -n "$c" ]] || continue
    v="$(package_version_at "$c")"
    [[ -n "$v" ]] || continue
    [[ "$seen" == *" $v "* ]] && continue
    seen+="$v "
    printf '%s %s\n' "$v" "$c"
  done <<< "$list"
}

# Oldest existing vX.Y.Z tag's version (empty when there is none).
oldest_release_tag_version() {
  git tag -l 'v*' | sed -n 's/^v\([0-9]*\.[0-9]*\.[0-9]*\)$/\1/p' | sort -V | head -n 1 || true
}

# Targets for a push to main, one "vVER SHA" per line, oldest first: every release
# version in versions file $1 up to main's version $2 that has no tag yet (from the
# oldest existing tag on, so the bootstrap version before it stays untagged), plus
# $2 itself so its Release is ensured. Catching up keeps each Release's range at the
# previous version even when an earlier run was cancelled or never ran.
release_push_targets() {
  local file="${1:?}" main_ver="${2:?}" floor v c
  floor="$(oldest_release_tag_version)"
  while read -r v c; do
    [[ -n "$v" ]] || continue
    is_release_version "$v" || continue
    if [[ -n "$floor" && "$(printf '%s\n%s\n' "$floor" "$v" | sort -V | head -n 1)" != "$floor" ]]; then
      continue
    fi
    if [[ "$v" == "$main_ver" ]] || ! git rev-parse -q --verify "refs/tags/v${v}" >/dev/null; then
      printf 'v%s %s\n' "$v" "$c"
    fi
    [[ "$v" == "$main_ver" ]] && break
  done < "$file"
}

# Targets for a manual backfill: the versions listed in $2 (space, comma or newline
# separated, with or without a leading v), oldest first, from versions file $1.
# Fails on anything that is not a release version carried by a commit in the file.
release_dispatch_targets() {
  local file="${1:?}" raw="${2:-}" w v c
  local -a wanted=()
  IFS=$' \t\n,' read -r -d '' -a wanted <<< "$raw" || true
  [[ ${#wanted[@]} -gt 0 ]] || { echo "no versions given" >&2; return 1; }
  for w in "${wanted[@]}"; do
    w="${w#v}"
    is_release_version "$w" || { echo "not a version: ${w}" >&2; return 1; }
    awk -v v="$w" '$1 == v { found = 1 } END { exit !found }' "$file" ||
      { echo "no main commit carries package version ${w}" >&2; return 1; }
  done
  while read -r v c; do
    for w in "${wanted[@]}"; do
      if [[ "${w#v}" == "$v" ]]; then
        printf 'v%s %s\n' "$v" "$c"
        break
      fi
    done
  done < "$file"
}

# One-line tag annotation for version $1 at commit $2: "v<ver> — <summary>".
# A release cut ("chore(release): v<ver> — …") gives its own summary; any other
# bumping commit uses the first "###" heading of that version's CHANGELOG
# section (its subject may name another version), else the commit subject.
release_tag_subject() {
  local ver="${1:?}" sha="${2:?}" subj s="" cl
  subj="$(git log -1 --format=%s "$sha")"
  if [[ "$subj" == "chore(release): v${ver} — "* ]]; then
    s="${subj#chore(release): v${ver} — }"
  else
    cl="$(mktemp)"
    git show "${sha}:CHANGELOG.md" >"$cl" 2>/dev/null || true
    s="$(extract_changelog_section "$cl" "$ver" 2>/dev/null | sed -n 's/^###[[:space:]]\{1,\}//p' | head -n 1 || true)"
    rm -f "$cl"
    [[ -n "$s" ]] || s="$subj"
  fi
  s="$(printf '%s' "$s" | sed -E 's/ \(#[0-9]+\)$//')"
  printf 'v%s — %s\n' "$ver" "$s"
}

# Verbose GitHub Release notes for existing tag $1 (v<ver>): the CHANGELOG
# section at that tag, the commits since the previous vX.Y.Z tag and the updater line.
release_notes() {
  local tag="${1:?}" ver sha pkg prev range cl section commits
  ver="${tag#v}"
  sha="$(git rev-list -n 1 "$tag")" || return 1
  pkg="$(package_version_at "$sha")"
  prev="$(git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude 'v*-*' "${tag}^" 2>/dev/null || true)"
  if [[ -n "$prev" ]]; then
    range="${prev}..${tag}"
    commits="$(git log --pretty=format:'- %s (%h)' "$range")"
  else
    range="(first tag)"
    commits="$(git log --pretty=format:'- %s (%h)' -n 40 "$tag")"
  fi
  cl="$(mktemp)"
  git show "${tag}:CHANGELOG.md" >"$cl" 2>/dev/null || true
  section="$(extract_changelog_section "$cl" "$ver" | sed '/./,$!d' || true)"
  rm -f "$cl"
  printf '## Corvidinho %s\n\n' "$tag"
  printf '**package.json version:** `%s`\n' "${pkg:-none}"
  printf '**Git tag:** `%s` (commit `%s`)\n' "$tag" "${sha:0:7}"
  printf '**Commit range:** `%s`\n\n' "$range"
  if [[ -n "$section" ]]; then
    printf '### Changes (CHANGELOG.md)\n\n%s\n\n' "$section"
  fi
  printf '### Commits in this cut\n\n%s\n\n' "$commits"
  printf '### Upgrade on the bot box\n\n'
  printf 'Use the updater, so a bad tip rolls back instead of staying live:\n\n'
  printf '```bash\ncd /path/to/Corvidinho\nCORVIDINHO_REF=%s ./scripts/corvidinho-update.sh\n```\n\n' "$tag"
  printf 'See docs/BOX-UPDATE.md. Secrets stay in the VM env or secret store, never in the repo.\n'
  printf 'Confirm with the ephemeral Discord `/status` (version, uptime, LLM mode, git tip).\n\n'
  printf 'Made with [Corvidinho](https://github.com/CorvidLabs/Corvidinho)\n'
}
