---
change: before-a-pr-opens-a-second-model-reviews-the-diff-in-bounded-rounds-and-the-pr-lists-what-it-raised-and-what-changed
artifact: context
---

# Context

Tracked under issue #92 (WORK: buddy review by a second model before the PR,
draft GITHUB-9) and the M3 "Real dev teammate" tracker #123 (slice
second-review-1 of the M3/M4 plan). GITHUB-9 is captured on main from Leif's
2026-09-28 interview (round 3: "capture as written"): "Before the PR, a
second model reviews the diff in bounded rounds, and the PR lists what it
raised and what changed." Leif's round 13 decision (2026-09-30, record of the
2026-09-28 interview) is captured in this change with `hi` as GITHUB-9.a:
"The reviewer is the first other model I've configured that didn't write the
change; there's no reviewer setting, and with no second model there's no PR
and the reply says why."

What was wrong on main (9ea766b): `github-pr-create` opened a PR from any
caller with no review at all, so a chat, slash, button or CLI run, a delegate
worker and the /work PR step could each open an unreviewed PR.

Constraints: specs only through SpecSync; v1 off-chain; #232/#233 scope
untouched; no new config key or env var a person sets (the reviewer comes
from the existing AGENT-13 model keys; `CORVIDINHO_DELEGATE_AUTHORS` is an
internal lead-to-worker value like `CORVIDINHO_DELEGATE_DEPTH`); no schema
version bump (main is v15; the new table is created on first use). The
parallel providers-4 build owns the turn cap / idle watchdog regions of
`src/agent/execute.ts`; this change does not touch `chatCompletions` or the
round loop's caps, only the tool dispatch and the run's hooks. The /work
round driver is the later second-review-2 change: until it lands, /work (no
run model) opens only a tree an agent run already had reviewed, so GITHUB-9
is partial for /work. Where the captured text leaves a question open, the
conservative defaults in `/home/user/coord/m34-defaults.md` (second-review
rows) and the slice entry `/home/user/coord/pr-second-review-1.json` are used
and listed in the PR under "Design choices pending Leif".
