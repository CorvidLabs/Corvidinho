---
change: discord-an-ask-button-press-passes-the-actor-gate-and-mute-rate-limit-like-chat-and-slash-so-a-muted-or-deny-listed
artifact: testing
---

# Testing

Regression test: `tests/discord.ask-button-gates.test.ts` (10 tests). The
bridge runs end to end (dry run, fake gateway, injected agent that asks with
buttons on every turn, memory thinking outbound, channel allowlist
`chan-on`, owner configured, missing allowlist file).

- Before the fix (origin/main `cf8c676`, bridge and gateway unchanged,
  test file as committed minus the `interactionRoleIds` unit): 7 of 9 fail.
  A muted owner's pick runs the agent (prompts 1 → 2) and a second press runs
  it again; a muted owner's open shows the choices; a deny-listed user, a
  deny-listed role, a deny-listed and muted user, and an unlisted user (with
  a non-empty user list) all resume the session; a pick over
  `DISCORD_RATE_LIMIT_MAX=1` resumes. The two that pass on main are guards:
  the owner not on the user list resumes, and the owner's pick with
  `DISCORD_RATE_LIMIT_BY_LEVEL={"3":100}` resumes.
- After the fix: 10 pass, 0 fail. Existing `forward-channel` (press channel
  gate), `ask-buttons`, `ask-ephemeral`, `actor-gate`, `rate-mute`,
  `collapsed-ping`, `inflight-replies`, `session-worktree` and `spend`
  tests pass unchanged.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-010` | `tests/discord.ask-button-gates.test.ts` | A muted session owner's pick gets exactly `[{ content: MUTED, ephemeral: true }]`, the agent does not run again, nothing is sent/edited/deleted, and the ask id stays pending; a second pick is refused the same way; after `unmuteUser` the same button resumes with the picked label. A muted owner's open gets `MUTED`, not the choices. With `DISCORD_RATE_LIMIT_MAX=1` a member's pick after their @mention gets `RATE_LIMITED` and the ask stays pending, while the owner's @mention is still served; with `DISCORD_RATE_LIMIT_BY_LEVEL={"3":100}` the owner's pick after their @mention resumes (level resolved for the press). |
| `REQ-discord-201` | `tests/discord.ask-button-gates.test.ts` | A session owner added to `denyUsers` gets only the zero-width ack on pick and on open; a presser with a role on `denyRoles` (role ids on the press) gets the zero-width ack; a deny-listed and muted presser gets the zero-width ack, not `MUTED`; with `users = ["someone-else"]` and `roles = ["role-a"]` the session owner's pick without roles gets the zero-width ack and with `roleIds: ["role-a"]` resumes; the owner not on the user list resumes. In every refusal the agent does not run, nothing is sent/edited/deleted, and the ask stays pending. `interactionRoleIds` reads a roles cache, raw API role ids, or nothing. |
