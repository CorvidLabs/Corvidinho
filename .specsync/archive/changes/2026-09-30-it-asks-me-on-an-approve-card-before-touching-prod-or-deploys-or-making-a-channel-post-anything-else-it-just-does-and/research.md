---
change: it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and
artifact: research
---

# Research

- Steal notes (#97): corvid-agent `docs/decisions/001-autonomous-scheduler.md`
  / `server/scheduler/` (approval policy auto / owner / council → a class per
  command, owner-only cards, council voices refused), `server/permissions/
  governance-tier.ts` (a "human only" layer → the gate in the tool layer, not
  the prompt), Merlin `dangerous` markings in `plugins/*/plugin.toml`
  (classification in plugin metadata → `PluginCommand.mustAsk`).
- Planned scope: `/home/user/coord/pr-must-ask-gate.json` (M3/M4 synthesis)
  and the must-ask rows of `m34-defaults.md` (git push to a remote's default
  branch is a deploy; fixed-text system posts are not gated; CLI with no
  bridge: the card lapses = no and the CLI prints why).
- Reused: the #316 engine (`storedApprovalKind`, `ApprovalStore.request` /
  `waitForDecision` / `consume`, `approvalActionHash`), `scheduleRunnerId` for
  the waiter, `auditContextFromEnv` for requester and surface, `appendAudit`
  via `runPlugin`'s `recordAudit`, `getOwner`, `delegateDepthFromEnv`, the
  SAFE-3 clamp walker (`forEachSimpleCommand`, `commandChain`), SAFE-21
  `firstFootgun`, `scrubSecrets`, `Bun.TOML`.
- `src/doctor.ts` `laneStepParts` shows the Fledge step forms (`"task"`,
  `{ run }`, `{ task }`, `{ parallel }`) and that fledge.toml wins over lane
  imports; fledge 1.8 refuses to run with no fledge.toml.
