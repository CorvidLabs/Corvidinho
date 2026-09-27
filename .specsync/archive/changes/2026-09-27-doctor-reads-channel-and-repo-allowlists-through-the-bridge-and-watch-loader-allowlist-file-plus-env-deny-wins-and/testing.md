---
change: doctor-reads-channel-and-repo-allowlists-through-the-bridge-and-watch-loader-allowlist-file-plus-env-deny-wins-and
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-003` (allowlist file, defect 7) | `tests/cli.doctor-truth.test.ts` | "channels and repos only in the allowlist file pass, with source file, exit 0": `[ok] discord: token + 1 allowlisted channel(s) from file`, `[ok] github-watch: … 1 allowlisted repo/org entry from file`, no `[missing]`, `All checks passed.`, exit 0. On main: `[missing] discord: … channel allowlist empty` and `[missing] github-watch: set CORVIDINHO_GITHUB_ALLOW_REPOS / ORGS`, exit 1. |
| `REQ-cli-003` (source named) | `tests/cli.doctor-truth.test.ts` | "env-only entries say env; file + env entries say file + env": `DISCORD_CHANNEL_IDS` / `CORVIDINHO_GITHUB_ALLOW_REPOS` → `from env`; file + `CORVIDINHO_DISCORD_ALLOW_CHANNELS` / `CORVIDINHO_GITHUB_ALLOW_ORGS` → `2 … from file + env`. |
| `REQ-cli-003` (deny wins) | `tests/cli.doctor-truth.test.ts` | "deny wins": file channel + env `CORVIDINHO_DISCORD_DENY_CHANNELS`, and env repo + file `deny_repos` → both `[missing] … also deny-listed (deny wins)`, exit 1. |
| `REQ-cli-003` (broken file) | `tests/cli.doctor-truth.test.ts` | "a malformed allowlist file fails discord and github-watch even with env allowlists": `[fail] allowlist-file` plus `[missing] discord: … the allowlist file does not load … the bridge refuses to start` and `[missing] github-watch: … watch refuses to start`, exit 1 (main printed `[ok] discord` from env). |
| `REQ-cli-003` (empty lists unchanged) | `tests/cli.doctor-truth.test.ts` | "no allowlist anywhere still reports the empty channel / repo lists" passes on main and with the fix. |
| `REQ-cli-003` (llm, defect 8) | `tests/cli.doctor-truth.test.ts` | "no LLM key": `[warn] llm: no CORVIDINHO_LLM_API_KEY or OPENAI_API_KEY — task run uses the demo stub`, exit 0. "an LLM key (either name)": `[ok] llm: … present (value not shown)` for `CORVIDINHO_LLM_API_KEY` and `OPENAI_API_KEY`. |
| `REQ-cli-003` (data dir, defect 8) | `tests/cli.doctor-truth.test.ts` | `[ok] data-dir: <dir> exists and is writable`; missing dir under a writable parent → `[info] data-dir: … does not exist yet — created on first use`, exit 0, dir not created; under a regular file → `[fail] data-dir: … cannot be created (<file> is not a directory)`, exit 1; data dir is a file → `[fail] … is not a directory`, exit 1. |
| `REQ-cli-003` (default path) | `tests/cli.doctor-truth.test.ts` | "the default allowlist path … is read too": `HOME/.config/corvidinho/allowlist.toml`, no `CORVIDINHO_ALLOWLIST_FILE` → `[ok] discord … from file`, `[ok] github-watch … from file`, exit 0. |
| `REQ-cli-003` (blank token / login) | `tests/cli.doctor-truth.test.ts` | "a blank token or watch login is missing": `DISCORD_TOKEN="   "`, `GITHUB_TOKEN=" "` → `[missing] discord: missing DISCORD_TOKEN …`, `[missing] github-watch: WATCH needs GITHUB_TOKEN/GH_TOKEN`; blank `CORVIDINHO_WATCH_USERNAME` → `[missing] github-watch: set CORVIDINHO_WATCH_USERNAME`; exit 1. |
| `REQ-cli-003` (unusable repo entry) | `tests/cli.doctor-truth.test.ts` | "a repo entry WATCH cannot use (not OWNER/REPO) is not reported as deny-listed": `[missing] github-watch: no allowlisted repo/org entry is usable`, no "deny-listed" claim, the entry is not printed, exit 1. |
| `REQ-cli-003` (data dir edges) | `tests/cli.doctor-truth.test.ts` | Symlink to nothing (and a path under one) → `[fail] data-dir: … is a symlink to a path that does not exist`, exit 1. Non-root only (`skipIf` root): a `0555` data dir → `[fail] … is not writable (EACCES)`, exit 1, nothing left inside. "the writable probe leaves nothing behind": the data dir is empty after `[ok]`. |
| `REQ-cli-003` (no secrets) | `tests/cli.doctor-truth.test.ts` | Every run asserts the output holds none of the Discord / GitHub tokens, LLM key, channel ids, repo or org names. |
| `REQ-cli-042` (unchanged) | `tests/identity.owner.test.ts`, `tests/allowlist.toml-multiline.test.ts` | Owner, admin-lists and allowlist-file doctor lines and exit-code tests still pass. |
| `REQ-cli-098` (unchanged) | `tests/agent.spend.test.ts` | Doctor `spend` line tests still pass. |

## Automated coverage

- Regression proof: on `origin/main` 9973a27's `src/cli.ts` the new file
  fails 9 of 10 (only the empty-lists guard passes); with the fix all 10 pass.
- Review round (after merging `origin/main` cf8c676): on `origin/main`'s
  `src/cli.ts` the file fails 14 of 16 (empty-lists guard passes; the
  non-root EACCES test is skipped as root); with the first cut's
  `src/doctor.ts` the three review tests (blank token, bare repo entry,
  symlink to nothing) fail; with the review fix all 16 pass as an
  unprivileged user and 15 pass + 1 skip as root.
- Manual re-run of the report's repro (allowlist file with `[discord]
  channels` and `[github] repos`, fake tokens, `CORVIDINHO_WATCH_USERNAME`):
  `[ok] discord … from file`, `[ok] github-watch … from file`,
  `[warn] llm`, `[ok] data-dir`, exit 0. `CORVIDINHO_DATA_DIR=/proc/nope`
  → `[fail] data-dir: /proc/nope cannot be created (ENOENT)`.
