---
id: every-cap-on-the-way-to-a-post-keeps-the-closing-roles-chat-3-not-allowed-for-your-role-note-the-watch-summary-comment
state: accepted
type: bug_fix
base_commit: 0f2e2c2774635d1dcbdff599cba92dbecf8eebd9
---

# Every cap on the way to a post keeps the closing ROLES-CHAT-3 (not allowed for your role) note: the WATCH summary comment, scheduled-run posts and run rows, /work and /session start answers, and the SAFE-8 80% warning append

## Intent

Every cap on the way to a post keeps the closing ROLES-CHAT-3 (not allowed for your role) note: the WATCH summary comment, scheduled-run posts and run rows, /work and /session start answers, and the SAFE-8 80% warning append

## Affected Canonical Specs

- `discord`
- `watch`

## Acceptance Criteria

- A summary that ends with the ROLES-CHAT-3 note (not allowed for your role) keeps it through every later cap on its way to a post: the WATCH summary comment's 1200-char clip (after the SAFE-6 scrub), the scheduled run's 1500-char run-row summary and its channel post, the /work and /session start answers (summary at most 1500 chars and no more than fits after the answer's head within 1900, so the gateway cut never reaches it), and the SAFE-8 80% warning append (appendPostLine); the body loses its end, never the note; a summary without the note is capped exactly as before; one regression test per surface fails on main and passes on the branch; no env var, config key, flag, slash command, table or schema change

## No-spec Rationale

Not applicable
