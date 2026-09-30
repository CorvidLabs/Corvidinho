---
id: a-non-owner-s-picked-choose-label-reaches-the-resumed-run-inside-the-untrusted-data-fence-like-their-typed-words-source
state: archived
type: bug_fix
base_commit: dea6565c9e1a9cffdc65f061f81fa6e7581e07c0
---

# A non-owner's picked Choose label reaches the resumed run inside the untrusted-data fence like their typed words (source=ask-pick, the presser's role resolved at press time with their Discord role ids); the owner's pick prompt is byte-identical; a pressed option id that matches none of the ask's options is refused as expired and never reaches the run raw (SAFE-12.a, DISCORD-ASK-3/5/8)

## Intent

A non-owner's picked Choose label reaches the resumed run inside the untrusted-data fence like their typed words (source=ask-pick, the presser's role resolved at press time with their Discord role ids); the owner's pick prompt is byte-identical; a pressed option id that matches none of the ask's options is refused as expired and never reaches the run raw (SAFE-12.a, DISCORD-ASK-3/5/8)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Through startBridge with a memory DB (the SAFE-11/12/13 bridge harness): a community user's pick of a Choose option resumes the session with the picked label inside the UNTRUSTED_DATA fence (header role: community, source=ask-pick) after the button prior-question block; a declared team member's pick (and a team member allowlisted only by a Discord role, whose role ids are passed at press time) is fenced with role: team; humanText and the recorded thread turn stay the plain label; the owner's pick prompt is byte-identical to before (Human answer:\n<label>, no fence); a pick whose option id matches none of the ask's options (a forged or stale id, or a pick id on a free-text ask) gets the ephemeral ASK_CHOICE_EXPIRED, starts no run, leaves the ask pending and never puts the raw id in a prompt, while a real pick afterwards still resumes; DISCORD-ASK-3/5/8 resume, expiry and button clearing are unchanged. The new tests fail on main and pass on the branch; no env var, config key, table, column or schema version.

## No-spec Rationale

Not applicable
