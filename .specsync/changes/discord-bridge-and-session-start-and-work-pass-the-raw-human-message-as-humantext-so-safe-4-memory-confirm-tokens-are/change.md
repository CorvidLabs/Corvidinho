---
id: discord-bridge-and-session-start-and-work-pass-the-raw-human-message-as-humantext-so-safe-4-memory-confirm-tokens-are
state: approved
type: bug_fix
base_commit: cbff8ea4646451b42d58fc1145091f55a9532ea4
---

# Discord bridge and /session start and /work pass the raw human message as humanText so SAFE-4 memory confirm tokens are extracted only from what the human typed, never from recalled memory injected into the spawn prompt (PR #128 follow-up after #131)

## Intent

Discord bridge and /session start and /work pass the raw human message as humanText so SAFE-4 memory confirm tokens are extracted only from what the human typed, never from recalled memory injected into the spawn prompt (PR #128 follow-up after #131)

## Affected Canonical Specs

- None

## Acceptance Criteria

- Bridge message path, /session start and /work pass the raw human message as humanText; the spawn env carries only tokens found in humanText; a token present only in the memory-enriched prompt is not treated as human-supplied (fixture); tests + SpecSync + fledge verify green

## No-spec Rationale

Behavior is specified by REQ-discord-021 (confirm tokens only from the human's message) in the companion memory-hardening change; this change only threads the raw text through the call sites
