---
change: safe-2-a-the-file-tools-refuse-fledge-like-fledge-toml-and-specs-so-a-run-cannot-weaken-the-verify-lane-it-is-judged-by
artifact: testing
---

# Testing

New tests:

- `tests/files.plugins.test.ts` › "SAFE-2.a: write/edit/delete refuse every
  path under .fledge/; reads stay allowed (REQ-plugins-083)":
  `isProtectedPath` true for `.fledge`, `.fledge/lanes/verify.toml`,
  `./.fledge/…`, `.Fledge/Lanes/…`, `src/../.fledge/…`,
  `pkg/.fledge/config.toml` and an absolute path with the root; false for
  `docs/fledge.md`, `fledge/lanes/verify.toml`, `.fledgerc`,
  `src/fledge-lanes.ts`. In a temp project, files-write of the existing lane
  and config files, a new `.fledge/lanes/extra.toml`, the `./`, `src/../`,
  `.FLEDGE/` and absolute spellings, a symlink to the lane file, a path
  through a symlink to `.fledge/lanes` (existing and new file) and a dangling
  symlink to a missing lane file → exit 2 with the SAFE-2 refusal naming
  `.fledge`; nothing is created. files-edit and files-delete of the same
  existing targets → exit 2 SAFE-2; the files are unchanged. files-read of
  the lane returns its text and files-list of `.fledge/lanes` lists it.
  files-write of `.fledge` in a project without one → exit 2, not created.
- `tests/git.plugins.test.ts` › "SAFE-2.a: the deletion of a .fledge/ lane or
  config file is refused (REQ-plugins-083 / REQ-plugins-182)": the deletion of
  a tracked `.fledge/lanes/verify.toml` / `.fledge/config.toml` → exit 2
  SAFE-2, still in `ls-files`, nothing staged.
- `tests/discord.send-file.test.ts` › "SAFE-2: protected and secret paths are
  refused …" gains `.fledge/lanes/notes.md` and a link to it (`lane-notes.md`):
  both refused, nothing uploaded.

Fail-on-main proof: with `plugins/files/protectedPaths.ts` and
`plugins/discord/send-file.ts` swapped for `origin/main` (5aaf7f0) — `git
diff origin/main -- plugins/` empty — the three touched files run
**70 pass, 3 fail**, the three failures being exactly the three tests above.
Source restored: **73 pass, 0 fail**. A probe on main's source also showed
`files-write .fledge/lanes/verify.toml` and `files-delete` of it both
succeeding (`ok: true`), and on the branch both refused with SAFE-2.

No live Discord, GitHub or network: temp dirs, temp git repos and the stubbed
send-file transport.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-083` | `tests/files.plugins.test.ts` | `.fledge` component rule: files-write / files-edit / files-delete of `.fledge/lanes/verify.toml`, `.fledge/config.toml` (all spellings, case, absolute, symlink to the file, symlink to `.fledge/lanes`), a new lane file, a dangling link and a planted `.fledge` → exit 2 SAFE-2 naming `.fledge`, unchanged / not created; files-read and files-list still work. Fails on main's source. |
| `REQ-plugins-083` | `tests/git.plugins.test.ts` | git-commit of the deletion of `.fledge/lanes/verify.toml` / `.fledge/config.toml` → exit 2 SAFE-2, path still tracked, nothing staged. Fails on main's source. |
| `REQ-plugins-182` (unchanged) | `tests/git.plugins.test.ts` | Same test: git-commit refuses staging the deletion of an `isProtectedPath` path, now including `.fledge/`. |
| `REQ-discord-476` | `tests/discord.send-file.test.ts` | `.fledge/lanes/notes.md` and a link to it are refused with the SAFE-2 set; no upload. Fails on main's source. |
