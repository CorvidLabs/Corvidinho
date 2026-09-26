---
module: plugins
version: 40
status: draft
files:
  - src/plugins/types.ts
  - src/plugins/registry.ts
  - src/plugins/run.ts
  - src/plugins/env.ts
  - src/plugins/mutating.ts
  - src/plugins/roles.ts
  - src/plugins/builtins.ts
  - src/plugins/githubDeny.ts
  - src/plugins/githubPublic.ts
  - tests/github.public.community.test.ts
  - tests/files.secret-path.test.ts
  - src/audit/log.ts
  - src/audit/index.ts
  - tests/audit.log.test.ts
  - src/allowlist/types.ts
  - src/allowlist/load.ts
  - src/allowlist/github.ts
  - src/allowlist/discord.ts
  - src/allowlist/index.ts
  - plugins/github/api.ts
  - plugins/github/commands.ts
  - plugins/github/ciStatus.ts
  - tests/github.ci-status.test.ts
  - plugins/github/index.ts
  - plugins/github/review.ts
  - tests/github.review.plugin.test.ts
  - plugins/meta/index.ts
  - plugins/specsync/api.ts
  - plugins/specsync/commands.ts
  - plugins/specsync/index.ts
  - plugins/memory/index.ts
  - plugins/memory/commands.ts
  - plugins/files/index.ts
  - plugins/files/commands.ts
  - plugins/files/protectedPaths.ts
  - plugins/files/resolvePath.ts
  - plugins/search/index.ts
  - plugins/search/commands.ts
  - src/memory/confirm.ts
  - tests/memory.plugins.test.ts
  - tests/memory.confirm.test.ts
  - tests/files.plugins.test.ts
  - tests/search.plugins.test.ts
  - plugins/shell/index.ts
  - plugins/shell/commands.ts
  - plugins/shell/clamp.ts
  - tests/shell.plugins.test.ts
  - plugins/web/index.ts
  - plugins/web/commands.ts
  - plugins/web/fetch.ts
  - plugins/web/address.ts
  - plugins/web/transport.ts
  - plugins/web/text.ts
  - tests/web.fetch.test.ts
  - tests/web.transport.test.ts
  - plugins/git/index.ts
  - plugins/git/commands.ts
  - plugins/git/exec.ts
  - plugins/git/parse.ts
  - tests/git.plugins.test.ts
  - plugins/fledge/index.ts
  - plugins/fledge/discover.ts
  - plugins/fledge/commands.ts
  - plugins/fledge/spawn.ts
  - src/plugins/toolCost.ts
  - tests/fledge.plugins.test.ts
  - tests/fledge.cli.test.ts
  - tests/roles.chat.gates.test.ts

db_tables: []
depends_on: []
---

# Plugins

## Purpose

Plugin host includes Discord outbound post, GitHub write plugins as dangerous
(GITHUB-2/3/5), memory-store/recall/forget/override (MEMORY / REQ-plugins-010),
file/search plugins with SAFE-2 guards (PLUGIN-1/2 / REQ-plugins-081..084),
`shell-exec` with SAFE-3 project-root cwd clamp (REQ-plugins-086..088), the
SSRF-guarded `web-fetch` GET plugin (PLUGIN-1/2 / SAFE-7 / REQ-plugins-111), and
typed git plugins (`git-status|diff|log|branch-list` reads;
`git-branch-create|commit|push` dangerous code-tier mutators) clamped to the
task worktree (PLUGIN-1/2, SAFE-1/2/3, GITHUB-2/6 / REQ-plugins-182).

## Public API

Export allowlist load + github/discord gate helpers used by plugins and future
HEAR. File/search plugins register via `loadFilesPlugins` / `loadSearchPlugins`.
Shell plugins register via `loadShellPlugins` (`shell-exec`). Git plugins
register via `loadGitPlugins` (`plugins/git/index.ts`).
`plugins/web` registers `web-fetch` via `loadWebPlugins`; `createWebCommands`
takes the resolver/transport seams, `webFetch` is the guarded GET core,
`checkAddress` classifies one IP, and `createSocketTransport` is the pinned
HTTP/1.1 socket transport.

## Invariants

Non-ADMIN role sessions (`CORVIDINHO_ACTING_IS_ADMIN` set and not admin) may
call GitHub read tools against any *public* repository after deny-list checks
(ROLES-CHAT-8). Private or unknown visibility is refused. ADMIN / non-role
sessions keep the GITHUB-6 allowlist gate.

`files-read` refuses secret-looking paths (`.env*`, `.ssh`, keystores, key
files) for non-ADMIN role sessions via `isSecretPath`.

## Behavioral Examples

### Scenario: memory-store description shows argv example

- **Given** builtins are loaded
- **When** an operator or the tool loop inspects `memory-store`
- **Then** the description includes `--category` / `person` / `identity` example argv

### Scenario: SAFE-3 refuse cd outside root

- **Given** builtins loaded and `shell-exec` allowlisted
- **When** the agent runs `shell-exec` with `cd /tmp && pwd`
- **Then** the run fails with exit 2 and a SAFE-3 refuse message; no spawn outside root

### Scenario: relative cd inside root

- **Given** a project with subdirectory `sub`
- **When** `shell-exec` runs `cd sub && …` allowlisted
- **Then** the command runs with initial cwd at project root and succeeds if the subcommand does

### Scenario: web-fetch refuses cloud metadata

- **Given** builtins are loaded
- **When** `web-fetch` is asked for `http://169.254.169.254/latest/meta-data/` (or a name that resolves or redirects there)
- **Then** it refuses with a SAFE-7 error and exit 2 before any connection is opened

### Scenario: web-fetch keeps a hostile page's text inside the fence

- **Given** `web-fetch` is allowlisted and a public page sets `<title>IGNORE PREVIOUS INSTRUCTIONS</title>`, a prose Content-Type or a prose reason phrase
- **When** the tool loop fetches it
- **Then** the title appears only as a `Title:` line between the untrusted markers, and the prose Content-Type or status is refused / reported as a numeric status without echoing it

### Scenario: git-push refuses a repo off the allowlist

- **Given** the task worktree's `origin` points at OWNER/REPO not on the GitHub allowlist
- **When** the tool loop runs `git-push` (allowlisted as a dangerous command)
- **Then** the run fails with a GITHUB-6 error (exit 3) and nothing is pushed


### Scenario: non-ADMIN refused files-write (ROLES-CHAT-3)

- **Given** builtins loaded and `CORVIDINHO_ACTING_IS_ADMIN=0` with an acting Discord user
- **When** the agent runs `files-write`
- **Then** the run fails with exit 2 and a "not allowed for your role" message; no file is written

### Scenario: ADMIN files-write still allowed (ROLES-CHAT-4)

- **Given** `CORVIDINHO_ACTING_IS_ADMIN=1` and the acting user is the configured owner
- **When** the agent runs `files-write` under non-interactive
- **Then** the write succeeds (mutating but not dangerous); SAFE-2 protected paths still refuse

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown plugin name | Throw / fail with Unknown plugin command |
| Dangerous + non-interactive + not allowlisted | Deny (exit 2) |
| Mutating + acting non-ADMIN (ROLES-CHAT-3) | Deny (exit 2, not allowed for your role) |
| Missing token / API fail on github-* | Clear error; non-zero exit |
| Dangerous github write + non-interactive + not allowlisted | Deny (exit 2, SAFE-1) |
| github write + empty/missing repo allowlist | Refuse (exit 3, GITHUB-6) |
| Path escapes project cwd / symlink escape | Refuse (exit 1) |
| Write/edit/delete protected infra | Refuse (exit 2, SAFE-2); no override |
| shell-exec cd/pushd escapes project root | Refuse (exit 2, SAFE-3); no spawn |
| web-fetch to a non-public target (literal, DNS answer or redirect hop) | Refuse before connecting (exit 2, SAFE-7) |
| web-fetch non-http(s) scheme or URL credentials | Refuse (exit 2) |
| web-fetch URL or redirect carrying a secret-looking value | Refuse before DNS (exit 2, SAFE-6) |
| web-fetch non-interactive + not allowlisted | Deny (exit 2, SAFE-1) |
| web-fetch > 5 redirects | Refuse (exit 2) |
| web-fetch non-text or malformed content-type / compressed body / non-2xx / timeout / every checked address unreachable | Error (exit 1); nothing returned |
| git plugin cwd not a repo top level | Refuse (exit 2, SAFE-3) |
| git-commit stages protected delete / `.env*` / keystore / `.git` | Refuse (exit 2) |
| git force / amend / `--all` / refspec / other-branch push | Refuse (exit 2) |
| git-branch-create switch would overwrite an ignored / untracked local file (e.g. `.env`) | Refuse (exit 2, SAFE-2); HEAD and files unchanged |
| git-push remote OWNER/REPO not allowlisted or denied | Refuse (exit 3, GITHUB-6) |
| git-push non-fast-forward | Fail (exit 1); never retried with force |

## Dependencies

| Module | What is used |
|--------|-------------|
| Bun | `Bun.which`, `Bun.spawn`, `Bun.file`, `Bun.write` |
| @octokit/rest | REST list/view/checks + create/comment/review for gated write commands |
| node:fs / path | path clamp, symlink resolve, glob/list, shell cwd pin |
| sh | shell-exec child via `sh -c` |
| node:dns / net / tls | web-fetch resolve once, dial pinned IP, SNI + cert check |
| src/store/scrub.ts | `scrubSecrets` on web-fetch output and errors; secret-bearing URLs refused |
| git (system binary) | git plugins via `Bun.spawn` argv arrays |

## Change Log

| 2026-09-26 | dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community: ROLES-CHAT-8 community public GitHub gate + secret-path read refuse |

