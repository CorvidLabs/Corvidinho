---
module: plugins
change: on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a
---

# Delta — plugins (memory plugins on GitHub match the commenter's numeric id only)

## Modified

### REQUIREMENT REQ-plugins-067

Memory plugins in GitHub conversations, filed by person or project, and a
ranked search (MEMORY-8 / MEMORY-9, #67). When a run has no Discord actor
and the WATCH spawn set a GitHub commenter (`CORVIDINHO_ACTING_GITHUB_LOGIN`
/ `CORVIDINHO_ACTING_GITHUB_ID`, the thread's `CORVIDINHO_ACTING_GITHUB_REPO`;
env only, never argv, REQ-watch-067), the acting subject SHALL be the
commenter's declared person: their GitHub numeric id matched in the
owner's people list re-read at the call (`memorySubjectForGithub`, stable
ids only, IDENTITY-7; the numeric id only, never the login, IDENTITY-7.a,
REQ-discord-367 — a login alone, or with another numeric id, matches
nobody), the same `person:<id>` profile and read scopes as on Discord; the
configured owner not declared under `[people]` (recognised by `[owner]
github_id`) SHALL use their Discord-id scope. A Discord actor SHALL always win over the
GitHub keys.

For a declared commenter `memory-store` / `memory-recall` /
`memory-profile` SHALL act on their own profile as on Discord. An undeclared
commenter SHALL get community scope: `memory-store` (own or `--project`)
SHALL be refused with nothing saved, a personal `memory-recall` /
`memory-profile` SHALL be refused, and `memory-recall --project` SHALL read
the thread repo's project memory (`project:<owner/repo>` lowercased,
`projectScopeForRepo`; refused when the run names no valid repo). In every
GitHub run project memory SHALL be read-only (`memory-store --project` keeps
the role refusal), `--person` SHALL get the opaque `not authorized` for any
ref but the commenter's own, private notes SHALL be refused (the thread is
public, MEMORY-7), and `memory-forget-me` SHALL be refused (a forget request
comes from a Discord conversation, MEMORY-ACL-6). With neither a Discord
actor nor a GitHub commenter the plugins SHALL refuse as before (no acting
user), except `--project` for the local CLI. This narrows, for GitHub runs
only, REQ-plugins-101's role refusal of `--project` for WATCH to writes:
reads of the thread repo's project memory are allowed (Leif's 2026-09-28
interview, #67); every other REQ-plugins-101 rule stands (#101's change is
still active, so REQ-plugins-101 is not modified here).

`memory-recall --query` SHALL be a ranked search (`MemoryStore.recall`,
REQ-discord-067): rows holding the query or any of its terms, most relevant
first, newer first among near-equals. The `memory-recall` description SHALL
tell the model to search with `--query` and the key words before claiming it
does not know (MEMORY-9), and the `memory-store` / `memory-recall`
descriptions SHALL say how they work on GitHub.

Acceptance Criteria
- In a GitHub-shaped env a declared commenter (by numeric id, under any login) stores into `person:<id>`, recalls with a plain-words `--query` and reads `memory-profile`; the same rows are read from Discord; the `[owner] github_id` recalls the owner's Discord-id memory and the `[owner]` login alone recalls nothing.
- On GitHub private notes, `memory-forget-me` and `--person` (any other ref) are refused and another person's rows never show; a login whose numeric id differs, or with no id, saves nothing.
- An undeclared commenter saves nothing (own or `--project`), has no personal recall and reads only the thread repo's project memory with `--project`.
- A Discord actor wins over stale GitHub keys.
- `tests/memory.recall-github.test.ts` covers each and fails on the stacked base sources.
