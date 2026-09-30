---
change: a-non-owner-s-picked-choose-label-reaches-the-resumed-run-inside-the-untrusted-data-fence-like-their-typed-words-source
artifact: research
---

# Research

Where a Choose pick's answer comes from and goes (`src/discord/bridge.ts`
`onComponent`, `parsed.kind === "pick"`):

| Step | Before | After |
|---|---|---|
| Gates (channel, actor, mute/rate, not-yours, expiry) | as REQ-discord-201/212/010/045 | unchanged |
| Presser's role | `resolveDiscordActingRole` with `interaction.roleIds`, at press time, before the branches (#299) | reused as is |
| Label lookup | `findOptionLabel(options, optionId) ?? optionId` — an unmatched id (forged, stale, or a pick id on a free-text ask) became the answer | unmatched id: ephemeral `ASK_CHOICE_EXPIRED`, return before the ask is claimed |
| Prompt answer (`spoken`) | the label, unfenced for everyone | `fenceSpeakerText(label, role, "ask-pick")`: fenced for team / community, unchanged for the owner |
| `humanText`, memory query, recorded turn, "Got it — **label**" ack | the label | unchanged (the plain label, as the form keeps the plain answer) |
| Claim / resume / button clearing (DISCORD-ASK-3/5/8) | as before | unchanged |

Only one call site maps a pressed option id to text (`findOptionLabel` in
`bridge.ts`); slash Choose stubs (`/work`, `/session start`) resume through
the same `onComponent` path, so they are covered by the same change.

Who can reach the pick path: only the ask's own requester (the not-yours
check), so the presser's role is the requester's role at press time; a team
member allowlisted only by a Discord role needs `interaction.roleIds` to pass
the actor gate and to resolve as team (#299 wired both).

Discord only sends component custom_ids of buttons the bot created, so an
unmatched option id normally means a stale button (an ask re-stored under the
same askId) — but the bridge should not rely on that for what reaches a
prompt.
