---
id: at-a-spend-cap-a-flat-priced-tool-call-web-search-gif-search-waits-on-the-owner-s-spend-approve-card-like-a-model-call
state: implementing
type: bug_fix
base_commit: 49273ff4a95fafcad87cde66492e3a8dd2c6c3f4
---

# At a spend cap a flat-priced tool call (web-search, gif-search) waits on the owner's spend Approve card like a model call instead of stopping at once; Approve plus the one-time code lets only that call through at the amount shown, the next one asks again, and any no keeps today's spend-cap ask (SAFE-8, SAFE-8.a)

## Intent

At a spend cap a flat-priced tool call (web-search, gif-search) waits on the owner's spend Approve card like a model call instead of stopping at once; Approve plus the one-time code lets only that call through at the amount shown, the next one asks again, and any no keeps today's spend-cap ask (SAFE-8, SAFE-8.a)

## Affected Canonical Specs

- `agent`
- `plugins`

## Acceptance Criteria

- Where a model call past a cap waits on the owner's spend card today (an owner configured, the run's spend guard given approval: createTaskExecute), a web-search whose flat price would pass the total cap is not sent: it waits on the same owner DM spend card (kind spend, class money, so Approve also needs the SAFE-19 one-time code) showing the action 'send one web-search via api.search.brave.com', the target total and the amount (SAFE-18). Approve plus the code lets exactly that one search through, recorded once at the amount shown; the next search past the cap raises a new card and code (SAFE-8.a). Deny, expiry, a late code or the run's stop sends nothing, records nothing and ends the attempt with the spend-cap ask (SAFE-20). With no owner, no approval hook (corvidinho plugins run), an invalid cap setting or an unavailable ledger, the flat call keeps today's spend-cap ask with no card. gif-search behaves the same through the shared reserveFlatSpend path. No amount or cap setting reaches the model, a tool message, the ToolResult or a non-owner post (SAFE-14.a). A run's flat and model cards share its one-open-card turn. The new tests fail on main's sources and pass on the branch; no schema bump, no new table, config key or env var.

## No-spec Rationale

Not applicable
