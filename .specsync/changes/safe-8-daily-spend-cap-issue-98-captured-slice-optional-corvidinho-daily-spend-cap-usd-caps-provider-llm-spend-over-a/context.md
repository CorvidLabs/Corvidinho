---
change: safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a
artifact: context
---

# Context

Issue #98 (P2, M4 Safe autonomy, build step 4 of 7 in tracker #124). Today a
task run with an LLM key calls the provider as often as the tool loop wants;
nothing stops a runaway loop or a busy Discord channel from quietly running
up the bill.

Captured HI this change meets:

- **SAFE-8**  When a daily spend cap is set, provider calls that would break
  it are refused instead of quietly running up the bill.
- **AUTONOMOUS-8**  I can see credit/spend usage for autonomous runs against a
  budget I set (slice: a `doctor` line; spawned Discord/WATCH runs share the
  same ledger because they inherit the bridge env).

Not captured (left for HI capture, not implemented):

- Draft **SAFE-14** (rolling 24 h cap per provider and one for the total).
- Draft **SAFE-15** (warn at 80 %, stop and ask at 100 %). Leif's issue
  comment decides "ask at 100 %" and asks to amend SAFE-8, but hi/safe.md
  still says "refused"; this change builds the captured wording. Refusal is
  also the only safe answer for headless runs until an approval card (#96)
  exists.
- Draft **SAFE-16** (unknown price counted and shown as unknown). This change
  never counts an unpriced model as free: it refuses it while a cap is set.
- Caps set from Discord admin, the Discord footer (#75), `/status`,
  dashboard and briefing views, AlgoChat fees, councils/subagents.

Constraints:

- No cap set means no behavior change (no DB open, fetch untouched).
- SQLite: origin/main is at SCHEMA_VERSION 5 and #142 may take v6, so the
  ledger table is created by its own module with CREATE TABLE IF NOT EXISTS
  and no version bump.
- Free-text columns go through scrubSecrets and SCRUB_TARGETS (SAFE-6).
- Keep hot shared files (execute.ts, cli.ts) to small hooks.
