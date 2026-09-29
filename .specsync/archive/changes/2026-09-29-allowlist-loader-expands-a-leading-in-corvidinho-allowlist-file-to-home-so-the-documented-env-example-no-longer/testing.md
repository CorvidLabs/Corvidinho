---
change: allowlist-loader-expands-a-leading-in-corvidinho-allowlist-file-to-home-so-the-documented-env-example-no-longer
artifact: testing
---

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
