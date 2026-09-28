---
module: plugins
change: harden-admin-and-github-pr-diff-edges-admin-mutations-fail-closed-when-no-audit-trail-is-wired-allowlist-json-toml
---

# Delta — plugins (github-pr-diff edge cases)

## Modified

### REQUIREMENT REQ-plugins-093

The system SHALL register read-only typed plugins `github-pr-diff` and
`github-pr-files` (GITHUB-3 read half, GITHUB-1) that call GitHub through
Octokit, never shell `gh`. Both SHALL declare `dangerous: false` and
`minTier: 0` and SHALL apply the same `--repo OWNER/REPO` GITHUB-6 repo gate as
the other github-* commands before any API call (default-deny, deny wins,
exit 3).

`github-pr-diff <number> --repo OWNER/REPO [--file PATH]` SHALL return the PR's
unified diff, capped at 200 KiB of UTF-8 cut on a line boundary, with a clear
`[corvidinho: diff truncated …]` marker when capped. `--file PATH` SHALL return
only that file's diff section (matching the new or previous path) and SHALL
fail with a clear error when the file is not in the PR. The `--file` value
SHALL be trimmed and stripped of leading `./`; a `--file` that is empty after
that (for example `./` or whitespace) SHALL be a usage error (exit 1, no API
call), never a fallback to the whole-PR diff. A file section rebuilt from
`pulls.listFiles` SHALL carry `rename from`/`rename to` lines for a renamed
file and `copy from`/`copy to` lines for a copied file. When GitHub returns no
patch and reports no changed lines for a renamed, copied, or mode/type-changed
(`changed`) file, the section SHALL say the content is unchanged (a pure
rename, copy, or mode change; for rename/copy, unless the file is binary) and
SHALL NOT describe it as a binary file or a diff that is too large.

`github-pr-files <number> --repo OWNER/REPO [--limit N]` SHALL list changed
files with status, additions and deletions (and the previous name for
renames), paginated up to `--limit` (default 300, max 3000) with a `truncated`
flag when more files exist.

Returned diff text and file names SHALL be passed through `scrubSecrets`
(SAFE-6) before capping, and payloads SHALL label the content as untrusted PR
data, not instructions. Because the diff is written by whoever opened the PR,
the scrub's work SHALL be bounded: diff text SHALL first be cut to a hard
limit of 800 KiB (4 × the cap) on a line boundary, dropping a private-key
block left without its END line, and the scrub patterns SHALL run in time
linear in their input. `totalBytes` SHALL report the uncut size.

Acceptance Criteria
- `plugins list` shows `github-pr-diff` and `github-pr-files` with dangerous=false and minTier=0.
- Empty or deny-listed repo refuses with exit 3 before any Octokit call.
- A diff over 200 KiB returns at most 200 KiB plus the truncation marker; `--file` returns one file's section.
- `--file ./`, `--file "   "`, `--file=./` and `--file " ././ "` each fail with a usage error and make no API call.
- A pure rename, pure copy, or `changed` (mode) entry with no patch and 0 lines says content unchanged, not binary or too large; a copied file's section has `copy from`/`copy to` lines; entries with line changes but no patch keep the binary/too-large note.
- `github-pr-files` pages `pulls.listFiles`, honours `--limit`, and sets `truncated`.
- Vendor-token-looking strings in diff text are redacted, including one straddling the cap.
- A hostile diff far over the cap (many private-key openers, no closer) returns quickly; a private key split by the hard cut is not returned.
- Tests mock Octokit (no network, no token).
