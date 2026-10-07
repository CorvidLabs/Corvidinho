---
change: on-github-a-text-someone-else-edited-never-gets-its-author-s-role-the-safe-13-owner-exemption-covers-only-text-the
artifact: testing
---

# Testing

`tests/watch.github-roles.postreview.test.ts` (12 tests): temp allowlist
file, data dir and git checkout; a real `startWatchPoller` over the fixture
search client; `createOctokitSearchClient` over a stubbed `fetch` (search,
comments, `POST /graphql`); the real WATCH spawn client over a fake bin that
dumps its env, applied to this process for the tool-layer cases; a registered
mutating `prod` must-ask command answered through the must-ask test hooks.
No token, no network. `textEditorIdsFromNode` is read through the module
namespace so the base sources fail on behaviour, not on import.

Fail-on-base proof (`origin/main` 86d68cd): with main's `src/` swapped in,
11 of 12 fail; the one that passes is the control (the owner's Discord run
still writes a file). Per finding, swapping in only main's file:
`src/plugins/{run,roles}.ts` → the checkout case fails (1);
`src/audit/log.ts` → both audit / card cases fail (2);
`src/watch/router.ts` → the 7 role and SAFE-13 cases fail;
`src/watch/searcher.ts` → the 4 searcher / poller cases fail. Restored: 12
of 12 pass.

Updated tests (they built events with no edit info, or expected `local`):
`tests/watch.github-roles.test.ts` (`ev()` and `watchTriggerRole` cases
carry `textEditorIds: []`), `tests/safe.injection.test.ts` (the owner-exempt
case), `tests/identity.recognise.test.ts` (the owner role line),
`tests/audit.log.test.ts` (WATCH actor `github:(unknown)`).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-watch-1202` | `tests/watch.github-roles.postreview.test.ts` "a text someone else edited never gets its author's role" (5 tests), "SAFE-13 exempts only what the owner wrote" (3 tests) | edited owner comment / body → community with the edited role line; unedited and self-edited → owner; unknown edits → community; GraphQL lookups only where needed; parser cases; SAFE-13 scans edited owner text and non-owner titles; a stranger's injected title on the owner's comment is refused before any run. Fail on base. |
| `REQ-watch-1201` (modified) | same file; `tests/watch.github-roles.test.ts` (updated) | an edited text is community; every #374 case still passes with never-edited events. |
| `REQ-watch-071` (modified) | same file; `tests/safe.injection.test.ts` (updated) | owner exemption only for owner-written, unedited text and owner-opened threads. |
| `REQ-plugins-1202` | "a WATCH run never writes the watcher's own checkout" (2 tests) | the owner's WATCH checkout writes refused, checkout unchanged; the owner's Discord run still writes. Fail on base. |
| `REQ-plugins-1203` | "a WATCH run's audit rows and must-ask cards name its GitHub trigger" (2 tests); `tests/audit.log.test.ts` (updated) | team `github-pr-review` rows `github:4242`; owner card `github:8268288`; a WATCH deny never refuses the local CLI call. Fail on base. |
| `REQ-plugins-1201` (modified) | same file | no `git-push` / checkout writes on WATCH; cards name `github:<id>`. |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | run on this branch before push. |
