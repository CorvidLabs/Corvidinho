---
change: shell-exec-refuses-specsync-change-approve-review-finalize-and-ship-in-every-repo-only-a-human-or-corvidinho-s-own
artifact: docs
---

# Docs

- `docs/DISCORD-GO-LIVE.md`: the `shell-exec` row says it refuses
  `specsync change approve` / `review` / `finalize` / `ship` in every repo
  (wrappers, `bunx` / `npx`, paths, `sh -c` and in-root scripts included):
  a human approves, reviews and finalizes, and on Corvidinho only the run's
  own settle step after a green lane does (AGENT-18.a).
- `docs/discord.md`: the must-ask list of calls refused with no card names
  the shell's SpecSync lifecycle refusal.
- Specs: `plugins.spec.md` (files list, Purpose, Public API, the
  AUTONOMY-9 "not classified" line, the AGENT-18.a invariant with its
  residuals, a scenario and an error row) and `specs/plugins/testing.md`.
- No README, CHANGELOG, STATUS or package.json edit (the release PR writes
  them).
