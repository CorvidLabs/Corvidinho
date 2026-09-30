---
change: if-it-only-plans-or-says-done-without-changing-anything-it-gets-one-nudge-to-the-same-model-a-second-stall-stands-with
artifact: testing
---

# Testing

The fake LLM only (`tests/fixtures/fake-llm.ts`: `fakeLlmFetch` in process,
`startFakeLlm` on localhost for the real CLI in a scratch non-git project;
it can now script tool calls), test plugins registered in process, and a
stubbed `workspaceDiff` for `runTask`. No network, no real key or token,
and no test runs the repo's own verify lane.

Fail-on-base proof (base 81ceb4a): with the base's `src/agent/execute.ts`,
`src/agent/loop.ts` and `src/agent/types.ts` swapped in (the branch's
`src/agent/loop-guards.ts` kept so the imports resolve), `bun test
tests/agent.stall-nudge.test.ts tests/agent.safe3a-owner-shell.test.ts
tests/scheduler.owner-role.test.ts` gave 88 pass, 8 fail: every nudge case
(tool loop "Done.", plan, empty reply, second stall, one per run, the empty
diff; runTask's empty diff; the CLI) fails, with no second request and no
operator line. The cases that pass on the base are the pure units of the
new helpers and the "never nudged" / "no nudge" cases, which the base also
never nudges, plus the two fixture files. With only the base's
`src/agent/loop.ts` swapped in, runTask's "an edit no tool reported is in
the diff" case fails (the loop never sees the diff and nudges). With the
base's `loop-guards.ts` too, the file cannot load (`Export named
'createStallNudgeGuard' not found`). Restored: 69 pass, 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-087` | `tests/agent.stall-nudge.test.ts` ("stallKind: a narrow heuristic") | `done-claim` for "", whitespace, "Done.", "done", "All done!", "Done! ✅", "✔️ Done", "Task complete.", "It's done now.", "Okay, that’s fixed now.", "I've done it.", "I have finished the task.", "Changes made."; `plan` for "I'll update src/cli.ts …, then run the tests.", "Let me look at the failing test first.", "Okay, I'm going to fix …", "Sure! I’ll open a PR …", "First, I'll read the file. Then I'll fix it.", a "Plan:" numbered list and a "**My plan:**" bullet list; null for Q&A answers (incl. "Let me check the file. It has 3 functions.", "Let me check… yes: …", "Yes, it's done.", "I'll explain: …"), social replies, a deferral, clarifying questions, "let me know" and offers, AUTONOMY-7 declines (witty too) and toy demos, "Done. I updated the README.", "Let me think about it." and the fake LLM's default reply; the 60 / 600 caps. |
| `REQ-agent-087` | `tests/agent.stall-nudge.test.ts` ("nothingChanged, the catalog check, the nudge text and the guard") | `nothingChanged` false for a change seen, an unreported edit, a non-empty, null or throwing diff, and for a change with an empty diff; true otherwise. `isStateChangingTool` true for every `STATE_CHANGING_TOOLS` builtin and a `fledge:` command, false for reads, `web-fetch`, `council`, `ask-human`, `memory-recall`. Nudge text starts with the mark, names the plan or the done claim, mentions `ask-human` only when offered; exact operator lines; the guard nudges once then stands. |
| `REQ-agent-087` | `tests/agent.stall-nudge.test.ts` ("tool loop …") | Code tier (`files-write` offered): "Done." → 2 requests to the same model, the 2nd ending with the stalled reply then the `[Corvidinho harness — AGENT-17]` user message; the answer stands; one `nudged once (same model)` line. A plan → nudge → a real write → files and reply kept. An empty reply is nudged. Always "Done." → 2 requests, summary "Done.", no ask or error, the `the reply stands` line. Attempt 2 of the same run stalls → no second nudge. Q&A, social, a clarifying question, "let me know", an AUTONOMY-7 decline and a toy demo → 1 request, no AGENT-17 line. A tool-reported file change or a Fledge command's success before "Done." → no nudge. `workspaceChanged` `["README.md"]` or null → no nudge, `[]` → nudge; not read for a non-stall. Tool tier (no state-changing tool), read tier, and a SAFE-13 trip (stand-in `github-issue-list`) → no nudge. Fail on base. |
| `REQ-agent-087` | `tests/agent.stall-nudge.test.ts` ("runTask: the verify gate's real diff reaches the tool loop") | A stubbed diff `["README.md"]` (an edit no tool reported): 1 request, the gate verifies (`LANE_PASS_OUTPUT`), `done` + verified. An empty diff: the nudge, no verify, the answer. Fails with the base's `loop.ts`. |
| `REQ-agent-087` | `tests/agent.stall-nudge.test.ts` ("task run CLI …") | Real `bun src/cli.ts task run --output ndjson` at code tier in a scratch non-git dir against `startFakeLlm` always saying "Done.": exit 0, exactly 2 requests (the 2nd ends with the nudge), both `[operator] AGENT-17` Text frames, result `done` with summary "Done.". Fails on base. |
| `REQ-agent-087` | `tests/agent.stall-nudge.test.ts` (review fixes) | `planWanted` and `stallKind(plan, task)` null for "What's your plan …?", "How would you fix …", "Outline the approach first.", "… don’t change anything yet.", "… without editing any files." ("Done." still a claim there); "I'll make sure to run the tests next time." null; `changedForStall` true for a successful `memory-store` / `memory-forget-me` (not in the catalog check); the guard remembers a change; the plan nudge says to change nothing when only a plan was asked for. Loop: stand-in `memory-store` ok → "Done!" → 2 requests, stored once, no AGENT-17 line; an answer beside a `files-read` call then "" → 2 requests, the answer is the summary; "Let me read README.md first." beside a read then "" → nudged (3 requests); a plan to a "What's your plan …? Don't change anything yet." task → 1 request; a failing `fledge:` command in attempt 1 (no git tree), "Done." in attempt 2 → no nudge; a stop while the diff is read → no nudge. runTask: a stop while the nudge round's request is in flight → 2 requests, cancelled, no verify. The first four fail on the first head (9e93cda); the stop cases pass on both. |
| `REQ-agent-087` | `tests/agent.safe3a-owner-shell.test.ts`, `tests/scheduler.owner-role.test.ts` | Their fake model ended on a plain "done" after changing nothing, which is now nudged (an extra request); the fake reply is now "ran it" / "The post was not approved, so nothing went out." so each test's request counts and summaries mean what they did. |
