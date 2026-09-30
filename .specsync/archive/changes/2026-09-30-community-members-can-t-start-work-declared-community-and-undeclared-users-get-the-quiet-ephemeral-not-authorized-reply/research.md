---
change: community-members-can-t-start-work-declared-community-and-undeclared-users-get-the-quiet-ephemeral-not-authorized-reply
artifact: research
---

# Research

- Refusal UX for an allowlisted non-owner on owner / team commands:
  `/announce channel` and `/schedule create|pause|resume|delete` reply
  `interaction.reply({ content: NOT_AUTHORIZED, ephemeral: true })` inside
  the handler; `/admin` does the same after its dispatcher floor
  (`minPermission: ADMIN`) and handler re-check. Channel / actor deny
  (DISCORD-DENY-3) uses the zero-width ack instead, which is for callers
  outside the allowlist, not for an allowlisted caller without the role.
  `/work` matches the owner-command refusal: ephemeral `not authorized`.
- Role resolution already happens in `handleWorkCommand` before anything is
  created: `loadDeclaredPeople({ allowlist, owner })` re-reads the people
  file at the time of the command and `resolveDiscordActingRole` gives
  owner / team / community (muted or deny-listed ⇒ community). Only
  `inboundInjection` (SAFE-13) runs between it and `deferReply` /
  `createWithWorktree`.
- A role floor in the dispatcher (`minPermission`) cannot express team: the
  permission level is BLOCKED / STANDARD / ADMIN; team comes from the people
  list. So the gate belongs in the handler, as the brief says.
- Slash registration keeps `/work` visible to everyone (Discord shows it to
  every member); the handler refusal is the gate, as for `/schedule` and
  `/announce` mutations.
- Other entry points to a work task: none (`workStore.create` and
  `workTask: true` appear only in `work.ts`); restart recovery only marks
  interrupted tasks.
- With no owner configured nobody is owner (IDENTITY-3) and, with nobody
  declared team, nobody can start `/work` any more; 39 existing tests in 17
  files drove `/work` as an undeclared non-owner and needed the invoker
  declared team (or the owner) to keep testing what they test, or now expect
  the refusal.
