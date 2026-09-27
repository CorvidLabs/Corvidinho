---
change: task-run-offers-allowlisted-dangerous-tools-to-the-model-a-dangerous-plugin-enters-the-catalog-only-when-corvidinho
artifact: context
---

# Context

Captured HI (hi/*.md, not retired):

- CLI-3: "`--non-interactive` runs without asking, and dangerous tools are denied unless I allowlisted them."
- GITHUB-1: "I can ask it to list or open issues and pull requests on a repo I care about, and it does that through reviewed tools rather than improvised shell."
- GITHUB-3: "It can read a PR diff, comment, and submit a review without me pasting the patch into chat."
- ROLES-CHAT-4: "ADMIN (configured owner per IDENTITY-2) may use mutating tools subject to SAFE-1..9, ALLOW, ADMIN-4, MEMORY-ACL, and two-phase confirms."
- PLUGIN-3: "I can add a project or third-party Fledge plugin and have Corvidinho call it without a Corvidinho release."
- SAFE-1 (the consent rule the allowlist implements) and AGENT-4 (verify before done).

Gap on main (0940db3): `buildOpenAiTools` (src/agent/tools.ts:55) skipped every
dangerous entry unless `includeDangerous`, and no product caller set it
(`src/cli.ts` `createTaskExecute` passes only `allowlist`). So the GitHub
writes, `memory-forget` / `memory-override`, `files-delete`, the git writes and
every `fledge-*` command (Fledge discovery ran only with `includeDangerous`)
were never offered to the model, even when allowlisted: an allowlist entry
unlocked only `corvidinho plugins run` and the `/work` PR step
(docs/DISCORD-GO-LIVE.md said "`task run` does not offer dangerous plugins to
the model yet"). With the human CLI retired (CLI-1/2, #129) the agent path is
the one that counts for PLUGIN-3 and GITHUB-1/3.

Constraints: shell-exec and the node/python/cargo runners stay out until Leif
answers the SAFE-3 chdir question; Discord/WATCH role gates (ROLES-CHAT-*)
unchanged; no new env var, config key, flag, slash command, SQLite schema or
package version. AGENT-4 was refuted as a live gap only because no reachable
tool edits files without reporting them in a non-git project; offering Fledge
commands makes it reachable, so the non-git gate must fail closed in the same
change. Open PRs #232 / #233 (ask-button gate, SAFE-3 clamp) are not touched.
