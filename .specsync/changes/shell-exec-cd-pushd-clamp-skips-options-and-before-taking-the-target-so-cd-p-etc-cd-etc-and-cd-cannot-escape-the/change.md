---
id: shell-exec-cd-pushd-clamp-skips-options-and-before-taking-the-target-so-cd-p-etc-cd-etc-and-cd-cannot-escape-the
state: implementing
type: bug_fix
base_commit: 2ff0598784b5e7c72f2c0eedbb85131324e7e239
---

# Shell-exec cd/pushd clamp skips options and -- before taking the target so cd -P /etc, cd -- /etc and cd - cannot escape the project root (SAFE-3)

## Intent

shell-exec cd/pushd clamp skips options and -- before taking the target so cd -P /etc, cd -- /etc and cd - cannot escape the project root (SAFE-3)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- shell-exec refuses before spawn (exit 2, SAFE-3) when cd/pushd reach an outside target after option words (-P, -L, -e, -@, -PL, pushd -n) or a terminating --; a lone - (OLDPWD), options with no target (home) and target/option words still holding quoting or expansion characters after outer-quote strip also refuse; cd/pushd with or without options to a target inside the project root stay allowed

## No-spec Rationale

Not applicable
