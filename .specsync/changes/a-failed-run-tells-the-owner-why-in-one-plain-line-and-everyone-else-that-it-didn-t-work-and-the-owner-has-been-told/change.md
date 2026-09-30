---
id: a-failed-run-tells-the-owner-why-in-one-plain-line-and-everyone-else-that-it-didn-t-work-and-the-owner-has-been-told
state: draft
type: feature
base_commit: c5a37b32f21ba40f6a7d6b3c50f10900afe7c713
---

# A failed run tells the owner why in one plain line, and everyone else that it didn't work and the owner has been told (DISCORD-3.b)

## Intent

A failed run tells the owner why in one plain line, and everyone else that it didn't work and the owner has been told (DISCORD-3.b)

## Affected Canonical Specs

- `discord`
- `agent`

## Acceptance Criteria

- DISCORD-3.b (captured with hi in this PR from Leif's 2026-09-28 interview, round 15 on 2026-09-30) holds on every surface that posts a failed run (chat, an ask pick or Answer form resuming a talk, /session start, /work, a schedule's result post): the owner's own run (the DISCORD-15.a owner check; a schedule the owner created) gets one plain line saying why; anyone else gets 'That didn't work — the owner has been told.' only once the owner has been DMed the reason with the surface and channel (one DM per reason per hour), else 'That didn't work.'; every failure logs '[discord] run failed (<surface>, exit N): <reason>' ('[scheduler] …' for schedules); the reason is harness text only (the task run result's new optional error: the no-provider notice, which model call failed as status and host never the provider body, which verify failed; else the tier's AGENT-10 notice; else the last meaningful stderr line; else the exit code), SAFE-6 scrubbed before it is cut to one line of at most 200 characters with stack frames and host paths stripped, no spend amounts (SAFE-14.a), and the state/verified/attempts plumbing stays in the embed footer (DISCORD-3.a); tests/discord.failed-reply.test.ts fails on the base sources and passes on the branch

## No-spec Rationale

Not applicable
