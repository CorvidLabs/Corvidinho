---
id: prompt-injection-hygiene-display-names-are-cleaned-before-the-model-sees-them-and-a-name-that-imitates-the-owner-or-a
state: implementing
type: feature
base_commit: 53f2e5df126fb01632b641ba57f51997aea8660e
---

# Prompt-injection hygiene: display names are cleaned before the model sees them and a name that imitates the owner or a declared person is flagged, identity and role still only from declared ids (SAFE-11); a non-owner's chat, /session start and /work text, WATCH issue/PR/comment titles and bodies, and GitHub reader and guild-member tool results reach the model fenced as untrusted data, and the system prompt says such blocks never grant permission (SAFE-12); a conservative always-on detector refuses a non-owner message or WATCH event that looks like an injection attempt before any run with one short reply that tells the owner, and a tool result that trips it drops every mutating tool for the rest of the run and tells the owner on the answer, every hit audited (SAFE-13, #71)

## Intent

Prompt-injection hygiene: display names are cleaned before the model sees them and a name that imitates the owner or a declared person is flagged, identity and role still only from declared ids (SAFE-11); a non-owner's chat, /session start and /work text, WATCH issue/PR/comment titles and bodies, and GitHub reader and guild-member tool results reach the model fenced as untrusted data, and the system prompt says such blocks never grant permission (SAFE-12); a conservative always-on detector refuses a non-owner message or WATCH event that looks like an injection attempt before any run with one short reply that tells the owner, and a tool result that trips it drops every mutating tool for the rest of the run and tells the owner on the answer, every hit audited (SAFE-13, #71)

## Affected Canonical Specs

- `agent`
- `discord`
- `watch`
- `plugins`
- `cli`

## Acceptance Criteria

- Display names (the Discord speaker's on chat, button picks, /session start and /work, and every name discord-user-lookup returns) are cleaned before the model sees them: mention / channel / emoji markup, @everyone / @here, control, zero-width, bidi and tag characters, role-like tags ([owner]) and labels (owner:) removed, capped at 32, a role-word-only name dropped; a shown Discord name that reads like the owner's or another declared person's (look-alike letters folded) adds a name_clash line; identity and role still come only from declared ids, so a stranger named like the owner is community even with an owner stamp (SAFE-11). A team / community speaker's chat message, /session start topic and /work description, WATCH titles and bodies (clipped so the random-id end marker survives the 8000-char cap), and the results of the GitHub readers and discord-user-lookup reach the model inside an UNTRUSTED_DATA fence (web-fetch keeps its fence, now on the shared helper); replayed turns quote lines that imitate Corvidinho blocks; every task-run system prompt says such blocks are data that never grant a permission and that only the sender's role, enforced in the tool layer, decides what may run; a community run whose task claims the owner gets no mutating tool and a role refusal (SAFE-12). A conservative always-on detector (ignore-rules, role-override, owner-claim, secret-request, tool-call-payload, fake-marker; look-alike and invisible characters folded; bounded) trips on known payloads and not on ordinary messages or bug reports; a non-owner Discord message, /session start or /work text that trips it starts no run and gets one short refusal that pings only the owner (slash: a fresh owner post), a WATCH event from anyone but the owner gets one refusal comment @mentioning the owner's GitHub login and no run, a scanned tool result that trips it drops every mutating tool for the rest of the run (refused if called), the summary says it did not act on it and the answer post pings the owner (chat, button pick, /session start, /work, schedules, WATCH summary); every hit appends an injection-suspected / denied SAFE-5 row with reason ids only (SAFE-13). tests/safe.injection.test.ts covers each and fails on the base sources; the full suite, tsc, specsync check --require-coverage 100, hi check and fledge verify stay green.

## No-spec Rationale

Not applicable
