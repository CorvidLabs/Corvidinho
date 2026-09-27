---
change: safe-3-shell-exec-cd-clamp-refuses-a-shell-reading-commands-from-standard-input-a-pipe-sh-s-sh-a-file-a-dup-d-fd-a
artifact: context
---

# Context

SAFE-3 (captured in `hi/safe.md`): "Shell commands cannot `cd` their way out
of the project root to run elsewhere on my machine." Issue #83. The lexical
clamp in `plugins/shell/clamp.ts` (`firstDisallowedCd`, REQ-plugins-087) checks
every `cd` / `pushd` the command text holds, re-parses `eval` arguments and a
shell's `-c` string, and fails closed on what it cannot resolve. #226 was the
latest hardening (quote-aware tokenizer, here-docs read both ways, `sh -c`).

The scoping pass on `main` (fc0ed8d) ran the `shell-exec` handler with cwd at
the root. A literal `cd` still escaped when a shell read its commands from
somewhere the clamp does not look: `echo 'cd /etc; pwd' | sh` (also
`| /bin/sh`, `| env sh`), `printf 'cd /etc\npwd' | sh -s`,
`echo 'cd /etc; pwd' | xargs -0 sh -c` (`-c` with no literal string) and
`bash -c "bash <<< 'cd /etc; pwd'"` (here-string) all printed `/etc` with
exit 0 while `firstDisallowedCd` returned null. Reproduced again on this
branch's base, plus `| sh -`, `| bash -eo pipefail`, `| sh /dev/stdin`,
`xargs -I{} sh -c 'echo {}'`, `| find . -exec sh \;`, `{ sh; }`, `(sh)`,
`sh < <(…)`, `sh <(…)`, `coproc sh`, an unquoted here-doc body holding
`c\\d /etc` (the shell turns `\\` into `\`, so `sh` reads `cd /etc`),
`sh -c - 'cd /etc'` and `bash -co pipefail 'cd /etc'`.

Constraints: this slice is only the piped-stdin / here-string remainder a
lexical clamp can close. Script files (`sh file`, `bash scripts/build.sh`),
`.` / `source`, `env -C` / `git -C` / `make -C` and interpreter chdir
(`python3 -c`, `node -e`) need Leif's decision on #83 (the G13 sandbox was
deferred 2026-09-26) and are left unchanged; REQ-plugins-087 keeps
`bash scripts/build.sh` allowed. No new flag, env var, config key or command;
no package bump, CHANGELOG or STATUS edit (bug-fix slice). The PLUGIN-4 runner
plugins are built in a separate PR and are not touched. Draft PR #233 (open,
not merged) rewrites the clamp to read script files and also refuses a shell
reading a pipe; it needs a Leif trade-off decision (fail-closed `./gradlew`,
`cd "$(dirname "$0")"` scripts), so this narrower change stands on its own.
