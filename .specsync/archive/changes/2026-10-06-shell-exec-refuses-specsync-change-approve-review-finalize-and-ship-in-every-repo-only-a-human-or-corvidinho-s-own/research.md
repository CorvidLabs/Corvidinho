---
change: shell-exec-refuses-specsync-change-approve-review-finalize-and-ship-in-every-repo-only-a-human-or-corvidinho-s-own
artifact: research
---

# Research

- Sources: issue #89 (body and three comments: Leif's decision that other
  repos follow their own gates; v0.0.30 / v0.0.31 rollups), the interview
  record `/home/user/coord/interview-2026-09-28.md` (round 13, "SpecSync
  reach (AGENT-18)"), and the W13 slice brief (verified gap, acceptance
  (1)–(6)).
- Evidence on main (e1a24ed2; the shell code is the same at 8bf4422, where the W13 audit found it): `plugins/shell/footguns.ts` covers only the
  SAFE-21 families; `plugins/shell/commands.ts` goes `firstFootgun` →
  `firstDisallowedCd` → `spawnCapped`; `plugins/files/protectedPaths.ts`
  guards SpecSync's lifecycle records for the file tools only;
  `src/agent/repo-ways.ts` `HUMAN_LIFECYCLE_LINE` / `selfLifecycleRefusal`
  gate only the SpecSync plugin's tools.
- `specsync` 6.0.0 CLI: `change` subcommands are new, answer, depend,
  supersede, list, show, status, ship-status, ship, approve, review, reopen,
  correct, correct-owner, finalize, check, audit, adopt; `ship` preflights
  and finalizes. Global options (`--strict`, `--require-coverage <N>`,
  `--root <ROOT>`, `--format <FORMAT>`, `--json`, `--enforcement <MODE>`,
  `--exclude-status`, `--only-status`) may sit before `change` and before the
  step. No subcommand prefix inference (`change appr` is an error). The MCP
  server (`specsync mcp`, `--allow-write` too) exposes no change lifecycle
  tool, so it is not a way around the check.
- The SAFE-21 walker already reads `sh -c`, `eval`, `$(…)`, backticks,
  functions, control flow and in-root scripts (`sh x.sh`, `. ./x.sh`,
  `./x.sh`); quote removal yields literal words (`appr\ove` → `approve`);
  dash reads `$'approve'` as an expansion, bash as the literal.
