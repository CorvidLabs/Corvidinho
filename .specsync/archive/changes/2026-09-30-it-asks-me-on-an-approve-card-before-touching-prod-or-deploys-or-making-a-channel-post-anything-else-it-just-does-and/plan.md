---
change: it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and
artifact: plan
---

# Plan

1. Capture AUTONOMY-9.a and AUTONOMY-10.a with `hi` (own commit).
2. `src/plugins/types.ts`: `MustAskClass`, `MustAskAsk`, `MustAskVerdict`,
   `MustAskClassifier`, `PluginCommand.mustAsk`.
3. `src/plugins/must-ask.ts`: policy table, card kinds, prod tables and text
   scan, `mustAskVerdict`, `mustAskGate`, notifier and test seams;
   `src/plugins/run.ts` calls the gate.
4. Classifiers: `plugins/shell/must-ask.ts` (+ `shell-exec`), runners,
   `plugins/fledge/must-ask.ts` (+ core and discovered commands), `git-push`,
   `discord-post-message` (shared `preparePost`).
5. `src/discord/approval-cards.ts` `mustAskApprovalKinds`; the bridge
   registers them.
6. `src/agent/ask.ts` AUTONOMY-11 sentence; `src/cli.ts` notifier in
   `task run`.
7. Tests (gate, classifiers, boundary, regression; existing post and push
   tests approve the card), docs, specs, deltas; verify.
