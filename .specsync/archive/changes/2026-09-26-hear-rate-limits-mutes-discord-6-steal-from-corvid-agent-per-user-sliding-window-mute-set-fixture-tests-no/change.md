---
id: hear-rate-limits-mutes-discord-6-steal-from-corvid-agent-per-user-sliding-window-mute-set-fixture-tests-no
state: archived
type: feature
base_commit: 435556dcaedb9817bef4466404825147c9da817e
---

# HEAR rate limits + mutes (DISCORD-6) — steal from corvid-agent; per-user sliding window + mute set; fixture tests; no ProcessManager; STATUS Done for #12

## Intent

HEAR rate limits + mutes (DISCORD-6) — steal from corvid-agent; per-user sliding window + mute set; fixture tests; no ProcessManager; STATUS Done for #12

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Per-user sliding-window rate limit and in-memory mute set refuse only that user on mention/reply/slash (DISCORD-6); other users unaffected; rateLimitByLevel override optional; env knobs for window/max + muted seed; fixture tests no live token; allowlists stay default-deny; no ProcessManager; STATUS Done for #12 when merged

## No-spec Rationale

Not applicable
