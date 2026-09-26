# Lesson bundle — roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: ROLES-CHAT tool gates: non-ADMIN read/chat catalog + refuse mutating at run time; ADMIN still behind SAFE; tests ROLES-CHAT-7; bump 0.0.13
- **Kind**: Feature
- **Specs**: plugins, agent
- **Paths**: src/plugins, src/agent, plugins/files, tests, package.json, CHANGELOG.md, STATUS.md
- **Acceptance**: Non-ADMIN acting sessions: catalog omits mutating tools; runPlugin refuses files-write/edit/delete, shell-exec, github-pr-create, memory-forget with not-allowed-for-your-role. ADMIN (CORVIDINHO_ACTING_IS_ADMIN=1 + owner re-check) can reach mutating paths still gated by SAFE-1. Channel allowlist still required. Automated tests cover ROLES-CHAT-7 a/b/c. Package 0.0.13 + CHANGELOG.

## Evidence

- Verification commit: `f504d46d5abec092d12dc8347483d64d84221702`
- Base commit: `70ce3bb4a7a557c5cafec7844a08d60f819a9906`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

Leif confirmed ROLES-CHAT-1..7 (HI capture PR). Gap: Discord sets
NON_INTERACTIVE so `dangerous:true` tools are blocked, but
`files-write` / `files-edit` are `dangerous:false` with minTier=code —
non-ADMIN users can mutate files when tier is code.

Order: HI capture → this gates PR → then #43 ADMIN slash (do not start #43 yet).

## From the change's design.md

# Design

- Add `mutating?: boolean` on PluginCommand; `isMutatingPlugin` = dangerous OR mutating flag.
- Mark `files-write` / `files-edit` as `mutating: true` (keep dangerous:false so SAFE-1 allowlist is not required for ADMIN file edits).
- Role session when `CORVIDINHO_ACTING_IS_ADMIN` is set (bridge always sets 0|1). Unset ⇒ local CLI, no role gate.
- Shared `resolveActingIsAdmin(env)` reuses owner re-check (IDENTITY-2); memory `actingIsAdmin` calls it.
- `buildOpenAiTools`: when role session && !admin ⇒ omit mutating.
- `runPlugin`: when role session && !admin && mutating ⇒ refuse exit 2 with role message (before SAFE-1).
- ADMIN + dangerous still SAFE-1 (non-interactive need allowlist).

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-roles-001` | `tests/roles.chat.gates.test.ts`, `tests/files.plugins.test.ts` | files-write/edit marked mutating; list entries expose mutating. |
| `REQ-plugins-roles-002` | `tests/roles.chat.gates.test.ts` | Non-admin refuses files-write/shell/github-pr-create/memory-forget with "not allowed for your role"; admin files-write ok; shell still SAFE-1 without allowlist. |
| `REQ-agent-roles-001` | `tests/roles.chat.gates.test.ts` | Non-admin catalog omits mutating; admin catalog includes files-write at code tier. |

## Automated coverage

- `bun test tests/roles.chat.gates.test.ts`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/plugins/context.md`
- `specs/agent/context.md`
