---
id: schedule-result-and-ask-posts-name-the-project-never-its-absolute-host-path-a-tampered-unkeyed-audit-chain-reads-chain
state: accepted
type: bug_fix
base_commit: 5366fff96501327ad3bcc30f55105f2c16884b0b
---

# Schedule result and ask posts name the project, never its absolute host path; a tampered unkeyed audit chain reads chain BROKEN at #N without an HMAC key

## Intent

Schedule result and ask posts name the project, never its absolute host path; a tampered unkeyed audit chain reads chain BROKEN at #N without an HMAC key

## Affected Canonical Specs

- `discord`
- `plugins`

## Acceptance Criteria

- Every schedule channel post (the result line and every ask post, including the pre-run stuck ask of REQ-discord-353 and a daemon run's ask posted by the bridge's delivery pass) starts with Schedule **<name>** (<id>) on <project name>, the project shown by projectLabel (last segment of an absolute path, a relative name as given) and never the absolute host path; the run row keeps the full error and the model's prompt keeps the stored project; without CORVIDINHO_AUDIT_HMAC_KEY a tampered unkeyed audit row found before any keyed row reads Audit: N entries · chain BROKEN at #n (the same line as with a key) on the bridge start log and /status, while stopping at a keyed row without the key still reads cannot verify keyed rows (CORVIDINHO_AUDIT_HMAC_KEY not set); regression tests fail on main and pass here; no new env var, config key, command, option, table or schema change

## No-spec Rationale

Not applicable
