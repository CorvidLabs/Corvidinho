# Lesson bundle — safe-2-a-the-file-tools-refuse-fledge-like-fledge-toml-and-specs-so-a-run-cannot-weaken-the-verify-lane-it-is-judged-by

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-2.a: the file tools refuse .fledge/ like fledge.toml and specs/, so a run cannot weaken the verify lane it is judged by
- **Kind**: BugFix
- **Specs**: plugins, discord
- **Paths**: hi/safe.md, INTENT.md, plugins/files/protectedPaths.ts, plugins/discord/send-file.ts, tests/files.plugins.test.ts, tests/git.plugins.test.ts, tests/discord.send-file.test.ts, docs/discord.md, specs/plugins/plugins.spec.md, specs/plugins/requirements.md, specs/plugins/testing.md, specs/discord/discord.spec.md, specs/discord/requirements.md, specs/discord/testing.md
- **Acceptance**: files-write, files-edit and files-delete refuse any path with a .fledge component (existing lane and config files, a new lane file, a file planted as .fledge itself, ./ and ../ spellings, an absolute path, other letter case, a symlink to a lane file, a path through a symlink to .fledge/lanes, a dangling symlink to a missing lane file) with the same SAFE-2 refusal (exit 2) and the files unchanged or not created; files-read and files-list of .fledge/ still work; git-commit refuses to stage the deletion of a .fledge/ file (exit 2, SAFE-2) and nothing is staged; discord-send-file refuses a .fledge/ file and a link to one like the rest of the SAFE-2 set; each of these tests fails on main's source

## Evidence

- Verification commit: `9ba0caa8a98ee760c41608416f053c307ab2b1f0`
- Base commit: `1d28c493ce59084e4a2a8cb09c3f7fc278289b0e`
- Verified by: `specsync check --spec discord --spec plugins`

## From the change's context.md

# Context

SAFE-2 ("The agent cannot delete or overwrite protected project infra (env
files, git metadata, fledge.toml, specs, keystores) through its file tools")
is enforced by `isProtectedPath` in `plugins/files/protectedPaths.ts`, the one
list every writing file tool consults (`files-write`, `files-edit`,
`files-delete`; `git-commit` for staged deletions; `discord-send-file` refuses
the same set on read-out).

The verify gate runs the project's `verify` lane with `fledge lanes run
verify`. Fledge reads that lane from `fledge.toml` **or** from a
`.fledge/lanes/*.toml` import (doctor's `verify-lane` check reads both,
REQ-cli-430). `fledge.toml` was protected; `.fledge/` was not. On `main`
(5aaf7f0) `files-write .fledge/lanes/verify.toml "[lanes.verify] steps=[]"`
and `files-delete .fledge/lanes/verify.toml` both succeed, so a run (an
owner or team `/work` run, or a delegate worker, all of which get the file
tools in their worktree) could rewrite or drop the checks it is then judged
by.

Leif's 2026-09-28 interview, round 12 (2026-09-29, recorded in
`/home/user/coord/interview-2026-09-28.md`): "protect .fledge/ like
fledge.toml and specs/ so a run can't weaken the verify lane" and capture
**SAFE-2.a** "Its file tools also can't change .fledge/, so a run can't
weaken the checks it is verified by." Captured with `hi` in this PR
(`hi/safe.md`, under SAFE-2).

## From the change's design.md

# Design

One rule in the existing list, no new module, flag, env var, config key,
table or command:

- `isProtectedPath` gains `if (lower === ".fledge") return true;` in the
  component loop next to `.git` / `.env*` / `specs`. Like those exact-name
  rules it reads the whole path, case-folded, so `.fledge` itself (a file
  planted where Fledge needs the folder), anything under it at any depth,
  `./` and `..` spellings and `.FLEDGE/…` are all refused.
- Every writer already routes through that list, so no call site changes:
  `files-write` / `files-edit` / `files-delete` check the path as given and
  the resolved path (`resolveProjectPath` follows symlinks, and dangling
  links by hand), so a link to a lane file, a path through a link to
  `.fledge/lanes` and a dangling link to a missing lane file are refused;
  `/work` runs (owner and team) and `delegate` workers use these same tools
  through `runPlugin`; `git-commit` refuses staging the deletion of a
  protected path; `discord-send-file` (read-only) refuses the SAFE-2 set, so
  it now refuses `.fledge/` as it already refuses `fledge.toml`.
- The refusal is the same SAFE-2 text (`protectedRefuseMessage`); its
  parenthetical list of protected kinds now names `.fledge`.
- Reads stay allowed: `files-read`, `files-list`, `files-glob`,
  `search-grep` and `fledge-lanes-list` / `-validate` do not consult the list.

Conservative choices (listed for Leif): the rule matches a `.fledge`
component anywhere in the path (like `specs` / `.git`), not only at the
project root, and in any letter case; `discord-send-file` refuses `.fledge/`
along with the rest of SAFE-2.

## From the change's testing.md

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

## Where these lessons go

- `specs/plugins/context.md`
- `specs/discord/context.md`
