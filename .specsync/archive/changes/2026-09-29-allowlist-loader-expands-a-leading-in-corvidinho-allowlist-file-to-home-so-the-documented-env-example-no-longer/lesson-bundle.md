# Lesson bundle — allowlist-loader-expands-a-leading-in-corvidinho-allowlist-file-to-home-so-the-documented-env-example-no-longer

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Allowlist loader expands a leading ~ in CORVIDINHO_ALLOWLIST_FILE to HOME so the documented .env example no longer silently drops the file's deny lists and owner
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: src/allowlist/load.ts, tests/allowlist.tilde-path.test.ts, .env.example
- **Acceptance**: CORVIDINHO_ALLOWLIST_FILE set to ~ or to a value starting with ~/ (after trim) resolves against the HOME the loader already uses, so the documented .env.example value ~/.config/corvidinho/allowlist.toml reads the same file as the default path: loadAllowlist / tryLoadAllowlist, the GITHUB-6 repo gate, the owner loader, the /admin write target and doctor all use that file, its deny lists win over an env allow list, and a malformed file behind ~ fails closed; ~user, absolute and relative values are used as written; a missing explicit file still contributes nothing (env overlays only); .env.example says how ~ is read; regression tests fail on main; no new env var, config key, command or schema change

## Evidence

- Verification commit: `685c71c8f70db72cb0e4f992ecb86712c31eba8b`
- Base commit: `0f2e2c2774635d1dcbdff599cba92dbecf8eebd9`
- Verified by: `specsync check --spec cli --spec plugins`

## From the change's context.md

# Context

W12 bug sweep seed `allowlist-file-tilde-silently-ignored` (Leif interview
2026-09-28, Wave 0: no new criteria). ALLOW-4 (`hi/allow.md`): allowlists load
from config on the bot VM. GITHUB-6 (`hi/github.md`): repos it will not touch.
REQ-plugins-006 names `CORVIDINHO_ALLOWLIST_FILE` as the file path.

`.env.example` documents `# CORVIDINHO_ALLOWLIST_FILE=~/.config/corvidinho/allowlist.toml`.
Bun's `.env` loader keeps the `~` literally, and `resolveAllowlistPath`
returned an explicit value verbatim, so the loader looked for a cwd-relative
`~/.config/…`, found nothing and fell back to env overlays only, with no error.
The file's `deny_repos` / `deny_users` and `[owner]` were dropped while an env
allow list still admitted targets. Every reader shares the resolver: the
allowlist loader (bridge, WATCH, GitHub repo gate, Discord plugins), the owner
loader, the `/admin` write target (which would have created `./~/.config/…` in
the cwd) and doctor (`[info] … not found — env overlays only`).

Leif's design calls (interview record): expand a leading `~` or `~/` to the
process HOME only (no `~user`); keep explicit absolute paths as-is; make the
`.env.example` comment true for this code (a parallel docs PR may say `~` is
not expanded). Bug-fix kind; regression tests must fail on `main`.

Constraints: no new env var, config key, command or schema change; a missing
explicit file stays "env overlays only" (the test preload relies on it,
REQ-plugins-253). #232 / #233 scope untouched.

## From the change's design.md

# Design

One change in `resolveAllowlistPath` (`src/allowlist/load.ts`): after trimming
the explicit value, `~` returns `home` and `~/rest` returns `join(home, rest)`;
anything else (`~user…`, absolute, relative, a `~` later in the path) is
returned as before. `home` is the parameter every caller already passes for
the default path, so the explicit `~/…` value and the default path agree.

No other module changes: the loader, owner loader, `/admin` writer and doctor
all call the resolver. The existing "exists ⇒ read (fail closed on parse
errors); missing ⇒ env overlays only" logic is untouched, so a broken file
behind `~/` now fails closed like any other path, and a missing one stays
env-only (REQ-plugins-253's test preload depends on that).

`.env.example` gains one comment line saying how `~` is read. The plugins spec
Public API notes the resolver's behaviour and lists the new test file.

## From the change's testing.md

# Testing

With `main`'s `src/allowlist/load.ts` swapped in, `bun test tests/allowlist.tilde-path.test.ts`
gives 2 pass and 8 fail: every case that sets `CORVIDINHO_ALLOWLIST_FILE` to
`~` or `~/…` fails (the resolver returns the literal value, the loader finds no
file, `sourcePath` is null, the file's deny lists and `[owner]` are missing, a
malformed file is not reported, `/admin` targets a literal `~/…`, and the
end-to-end gate admits `corvidlabs/secret`). The two cases that pass on `main`
are the ones whose behaviour must not change (`~user` / absolute / relative
values as written; a missing file means env overlays only). After the fix:
10 pass, 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-006` (`~` is HOME) | `tests/allowlist.tilde-path.test.ts` | `~/.config/corvidinho/allowlist.toml` resolves to `<home>/.config/corvidinho/allowlist.toml`, the same path the default resolution returns; `~` and `~/` resolve to `<home>`; surrounding spaces are trimmed first. |
| `REQ-plugins-006` (other values as written) | `tests/allowlist.tilde-path.test.ts` | `~other/allowlist.toml`, `~other`, `/etc/corvidinho/allowlist.toml`, `config/allowlist.toml`, `./~/allowlist.toml` and `a/~/allowlist.toml` come back unchanged. |
| `REQ-plugins-006` (loader, fail closed, missing) | `tests/allowlist.tilde-path.test.ts` | `loadAllowlist` with the `~/` value and an env org allow list returns `sourcePath` = the file, `github.denyRepos` `["corvidlabs/secret"]`, `discord.denyUsers` `["666"]`; a malformed file there makes `tryLoadAllowlist` return `ok: false` naming the path and not the list values; a missing file gives `sourcePath: null` with env overlays only. |
| `REQ-plugins-006` (owner, doctor, `/admin`) | `tests/allowlist.tilde-path.test.ts` | `loadOwnerConfig` reads `[owner] discord_id` from the `~/` path; `loadDoctorAllowlist` reports the file as the source and its deny list in the merged set; `resolveAdminAllowlistPath` returns the expanded path, not a literal `~/…` under the cwd. |
| `REQ-plugins-006` / `REQ-plugins-253` (documented example, GITHUB-6) | `tests/allowlist.tilde-path.test.ts` | the `.env.example` line, uncommented into a temp project's `.env`, run in a child `bun` with a temp HOME and `CORVIDINHO_GITHUB_ALLOW_ORGS=corvidlabs`: `process.env` keeps `~/…` literally, `loadAllowlist` loads the HOME file, `checkRepoGateAsync("corvidlabs/secret")` refuses with GITHUB-6, `corvidlabs/open` passes, and no `./~` dir is created. |
| `REQ-plugins-006` (earlier fixtures) | `tests/allowlist.default-deny.test.ts`, `tests/allowlist.toml-multiline.test.ts`, `tests/github.gate-allowlist-file.test.ts` | unchanged and passing (79 pass across the four allowlist files). |

## Automated coverage

- `bunx tsc --noEmit` — passed.
- `hi check` — passed (146 criteria, no new ids).
- `specsync check --require-coverage 100` — 5 specs passed, file and LOC coverage 100%.
- `bun test` (Bun 1.4.2, as CI pins) — 2123 passed, 2 skipped, 0 failed.
- `fledge lanes run verify --non-interactive` — green (lint, smoke, test 2123 pass / 0 fail, spec-check 100%). Two earlier runs on the loaded box each hit one unrelated timing test (`tests/proc-group.test.ts` grandchild kill, `tests/discord.session-thread.unit.test.ts` 5 s timeout); both pass alone and in the full `bun test` run.
- Manual: `corvidinho doctor` with a temp HOME and `CORVIDINHO_ALLOWLIST_FILE='~/.config/corvidinho/allowlist.toml'` prints `[ok] allowlist-file: <HOME>/.config/corvidinho/allowlist.toml loads (values not shown)`; on `main` it printed `[info] allowlist-file: ~/.config/corvidinho/allowlist.toml not found — env overlays only`.

## Where these lessons go

- `specs/plugins/context.md`
