---
id: shell-exec-refuses-a-specsync-lifecycle-step-written-as-a-glob-or-brace-pattern-or-reached-through-an-expanding
state: accepted
type: bug_fix
base_commit: 54d6a6c777f51b4fa430511a5d7f049a8ba42083
---

# Shell-exec refuses a SpecSync lifecycle step written as a glob or brace pattern, or reached through an expanding subcommand or xargs input (AGENT-18.a follow-up to #372)

## Intent

Shell-exec refuses a SpecSync lifecycle step written as a glob or brace pattern, or reached through an expanding subcommand or xargs input (AGENT-18.a follow-up to #372)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- AGENT-18.a (on main, hi/agent.md: 'On Corvidinho it may approve and archive its own SpecSync change once verify is green; in other repos a human approves, reviews and finalizes.'), follow-up to #372. REQ-plugins-1818 (modified): (1) shell-exec refuses specsync change approve|review|finalize|ship when the program name, the change subcommand or the step is written as a glob or brace pattern (an unquoted *, ?, [ or {: spec*ync, specsyn?, [s]pecsync, env spec*, bunx spec*, c?ange, appr*ve, [a]pprove, {approve,}, {specsync,}), exit 2 with nothing spawned; the tokenizer marks such a word (Word.glob) and the check reads it as every word it may stand for. (2) It refuses, with step null, a subcommand that expands or is a pattern after a word naming specsync (a function forwarding "$@", set -- then "$@", change${IFS}approve, an unquoted $S holding 'change approve') and a subcommand xargs supplies (... | xargs specsync, xargs -n3 specsync, an xargs replace string where the subcommand belongs), and an expanding command word in front may be xargs. Read-only commands still run: specsync change status|list|show|check|ship-status, specsync check, xargs specsync change status / check, quoted pattern characters, wildcards away from a command word (cp * "$dest"), and a specsync word that is only an argument of a command that never runs its arguments (grep -l specsync "$f", git ls-files | xargs grep -l specsync). tests/shell.sdd-lifecycle.test.ts fails on the base sources (3 new tests) and passes on the branch; every new shell-exec case approves, reviews, finalizes or ships through the fake specsync on the base.

## No-spec Rationale

Not applicable
