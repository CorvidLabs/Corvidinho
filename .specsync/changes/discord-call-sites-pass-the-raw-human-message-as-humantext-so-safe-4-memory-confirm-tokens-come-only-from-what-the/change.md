---
id: discord-call-sites-pass-the-raw-human-message-as-humantext-so-safe-4-memory-confirm-tokens-come-only-from-what-the
state: approved
type: bug_fix
base_commit: a2fff442b44fef198ec6f6a6246eb361c5a8d12b
---

# Discord call sites pass the raw human message as humanText so SAFE-4 memory confirm tokens come only from what the human typed (PR #128, after #131 memory inject)

## Intent

Discord call sites pass the raw human message as humanText so SAFE-4 memory confirm tokens come only from what the human typed (PR #128, after #131 memory inject)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Bridge message path, /session start and /work pass the raw human message as humanText; the spawn env carries only confirm tokens found in humanText; a token present only in the memory-enriched prompt is not treated as human-supplied (fixture in tests/memory.spawn-env.test.ts); tests + SpecSync + fledge verify green

## No-spec Rationale

Not applicable
