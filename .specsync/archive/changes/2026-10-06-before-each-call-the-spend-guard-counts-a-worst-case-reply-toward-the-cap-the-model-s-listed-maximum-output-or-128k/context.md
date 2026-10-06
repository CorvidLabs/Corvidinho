---
change: before-each-call-the-spend-guard-counts-a-worst-case-reply-toward-the-cap-the-model-s-listed-maximum-output-or-128k
artifact: context
---

# Context

Tracked under issue #98 (M4 "Safe autonomy", spend caps). AUTONOMY-8 ("It
asks before any spend that would go over a cap") is on main. Leif's
2026-09-28 interview record, round 16 (2026-10-06): "AUTONOMY-8 spend:
**reserve the worst case** — count a larger worst-case reply before each
call so the card comes earlier; replies are never cut." This change captures
that decision as AUTONOMY-8.a with the `hi` CLI (its own commit, first) and
builds it.

What was wrong on main (e1a24ed): the spend guard's pre-call estimate was
request bytes / 3 plus a fixed 4096-token reply reserve, and replies are
never capped (no `max_tokens` is sent). One long reply (say 16K tokens of
gpt-4o, or 128K of a Claude Opus model) could take spend past a cap after
the check had passed, with no ask; only the next call would stop.

Constraints: specs only through SpecSync; v1 off-chain; #232/#233 scope
untouched; no new config key, env var or schema; the spend card text and the
#316/#335 card paths are reused as they are; unpriced models keep their
SAFE-16 / SAFE-16.a behaviour.
