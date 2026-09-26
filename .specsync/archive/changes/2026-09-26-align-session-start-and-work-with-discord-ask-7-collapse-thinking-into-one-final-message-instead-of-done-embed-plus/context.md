---
change: align-session-start-and-work-with-discord-ask-7-collapse-thinking-into-one-final-message-instead-of-done-embed-plus
artifact: context
---

# Context

After ASK-6/7 (v0.0.24) collapsed mention/button thinking into one message, slash
`/session start` and `/work` still posted a ✅ Done thinking embed **and** filled
the deferred interaction reply with the full body — two public messages for one
result (dogfood pain).

HI DISCORD-ASK-7 already said "normal done"; REQ-discord-048 only named mention
and button pick. This change extends the same collapse to slash and amends the
REQ/HI wording. No schema change. Do not touch the live `Corvidinho-run` tree
until bridge restart after merge.
