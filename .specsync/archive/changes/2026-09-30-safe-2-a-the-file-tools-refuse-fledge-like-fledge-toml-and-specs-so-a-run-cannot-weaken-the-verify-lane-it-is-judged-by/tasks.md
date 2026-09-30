---
change: safe-2-a-the-file-tools-refuse-fledge-like-fledge-toml-and-specs-so-a-run-cannot-weaken-the-verify-lane-it-is-judged-by
artifact: tasks
---

# Tasks

- [x] Capture SAFE-2.a with `hi` in its own commit; `hi check` passes.
- [x] `isProtectedPath` refuses any `.fledge` component; SAFE-2 refusal text names `.fledge`.
- [x] files-write / files-edit / files-delete `.fledge/` tests (spellings, case, absolute, symlinks, dangling link, planted `.fledge`); files-read / files-list still work.
- [x] git-commit refuses staging the deletion of a `.fledge/` file.
- [x] discord-send-file refuses a `.fledge/` file and a link to one.
- [x] New tests fail on main's source (3 fail) and pass on the branch; source restored.
- [x] Docs and spec prose that list the SAFE-2 set updated; spec testing evidence; deltas (REQ-plugins-083, REQ-discord-476 Modified).
- [x] SpecSync approve / check / audit, coverage, `hi check`, tsc, `bun test`, fledge verify.
