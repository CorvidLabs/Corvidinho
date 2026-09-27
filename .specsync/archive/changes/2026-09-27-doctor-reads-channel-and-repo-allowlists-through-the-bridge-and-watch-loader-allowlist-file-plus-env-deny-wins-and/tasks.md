---
change: doctor-reads-channel-and-repo-allowlists-through-the-bridge-and-watch-loader-allowlist-file-plus-env-deny-wins-and
artifact: tasks
---

# Tasks

- [x] Re-verify defects 7 and 8 on `origin/main` 9973a27 (file-only
      allowlists → two `[missing]` lines, exit 1; no `llm` / `data-dir`
      line; `CORVIDINHO_DATA_DIR=/proc/nope` silent).
- [x] Add `tests/cli.doctor-truth.test.ts` (real CLI, clean env, stub
      fledge / specsync, fake tokens) and prove 9 of 10 fail on main.
- [x] Add `src/doctor.ts`: allowlists through the bridge / WATCH loader with
      source and deny wins; `llm` warn; `data-dir` probe.
- [x] Wire the checks into `doctor` in `src/cli.ts`; help line names the
      new checks.
- [x] Delta: Modified REQ-cli-003; `specs/cli/cli.spec.md` (files, Public
      API, invariant, error rows) updated.
- [x] Docs: `docs/DISCORD-GO-LIVE.md` (doctor reads the allowlist file),
      `docs/BOX-UPDATE.md` (`data-dir` must pass; `llm` warn only).
- [x] Run SpecSync change approve / check / audit, coverage check, tsc,
      bun test and the verify lane.
- [x] Review: read the allowlist file once (`preloaded`); trim token /
      login presence like the bridge / WATCH; "deny wins" only when every
      repo entry is denied; a symlink-to-nothing data dir fails; tests for
      each plus the default allowlist path, a non-writable data dir
      (non-root) and a clean probe; re-approve and re-check.
