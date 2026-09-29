---
id: discord-rich-final-replies-answer-footer-with-model-tokens-cost-and-time-tokens-and-cost-owner-only-and-fence-safe
state: verifying
type: feature
base_commit: d589638c38f27503373601bb256ee6207fb822f9
---

# Discord rich final replies: answer footer with model, tokens, cost and time (tokens and cost owner-only) and fence-safe splits at 2000 (DISCORD-15/15.a/16)

## Intent

Discord rich final replies: answer footer with model, tokens, cost and time (tokens and cost owner-only) and fence-safe splits at 2000 (DISCORD-15/15.a/16)

## Affected Canonical Specs

- `discord`
- `agent`

## Acceptance Criteria

- Every Discord answer (chat reply, button-pick resume, /work, /session start, and their reply fallbacks) carries a footer embed with the model and the time, plus tokens and cost only when the acting user is the configured owner; an owner run with no provider usage or no known model price shows tokens unknown / cost unknown, never $0; the live thinking status shows token use on owner runs only; an answer over 2000 characters is split into messages of at most 2000 characters that never break a fenced code block (closed at a part end, reopened with the same language), keep the ROLES-CHAT-3 role note whole in the last part, are secret-scrubbed before the split, carry the footer on the last part, and long plain prose with no code or mention that fits one embed goes out as one embed; the Discord spawn client passes the whole answer (result frame cap 4000) and the last usage frame while WATCH keeps its 1800 cap; tests/discord.rich-replies.test.ts fails on the base sources and passes on the branch

## No-spec Rationale

Not applicable
