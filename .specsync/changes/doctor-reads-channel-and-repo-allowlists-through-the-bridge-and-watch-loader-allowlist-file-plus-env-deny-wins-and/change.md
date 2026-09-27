---
id: doctor-reads-channel-and-repo-allowlists-through-the-bridge-and-watch-loader-allowlist-file-plus-env-deny-wins-and
state: approved
type: bug_fix
base_commit: 9973a2753d922d3b9871c381d650e0374f0ee8d9
---

# Doctor reads channel and repo allowlists through the bridge and watch loader (allowlist file plus env, deny wins) and names the source, warns when no LLM key is set (task run uses the demo stub) and checks the data dir is writable

## Intent

Doctor reads channel and repo allowlists through the bridge and watch loader (allowlist file plus env, deny wins) and names the source, warns when no LLM key is set (task run uses the demo stub) and checks the data dir is writable

## Affected Canonical Specs

- `cli`

## Acceptance Criteria

- corvidinho doctor loads the Discord channel and GitHub repo allowlists through the same loader as the bridge and watch (allowlist file plus env overlays; a channel or repo that is also deny-listed does not count, deny wins): channels and repos only in the allowlist file give [ok] discord and [ok] github-watch naming the source (file, env or file + env) and exit 0 when everything else is set; every allowlisted entry deny-listed, or an allowlist file that does not load, gives [missing] with exit 1. Doctor prints [warn] llm naming the demo stub when neither CORVIDINHO_LLM_API_KEY nor OPENAI_API_KEY is set (exit code unchanged) and [ok] llm when one is. Doctor prints a data-dir line: [ok] when the data dir exists and is writable, [info] when it does not exist yet but can be created (doctor does not create it), [fail] with exit 1 when it is not a directory, cannot be created or is not writable. No token, key, channel id or repo name is printed. tests/cli.doctor-truth.test.ts covers each case, fails on main and passes with the fix.

## No-spec Rationale

Not applicable
