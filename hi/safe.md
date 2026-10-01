---
hi: 1
families: [SAFE]
owner: leif
---

# Safe

## Intent

Safety has to fire even when the model is having a bad day. Guards live in the tool layer: refuse the foot-gun, log the close call, and never depend on the prompt to save the repo.

## Criteria

- **SAFE-1**  Dangerous tools require my consent; in non-interactive mode they are denied unless I allowlisted them.
- **SAFE-2**  The agent cannot delete or overwrite protected project infra (env files, git metadata, fledge.toml, specs, keystores) through its file tools.
  - **SAFE-2.a**  Its file tools also can't change .fledge/, so a run can't weaken the checks it is verified by.
- **SAFE-3**  Shell commands cannot `cd` their way out of the project root to run elsewhere on my machine.
  - **SAFE-3.a**  The model may use the shell, the language runners and Fledge lane/task runs only in my own interactive runs (chat, /session start, /work, local CLI), only when I allowlist them, and only inside that talk's own worktree; non-owners, WATCH and schedules never get them.
- **SAFE-4**  Destructive data ops (raw SQL wipes, memory deletes) need a two-phase confirm so a single confused tool call cannot erase the store.
- **SAFE-5**  Destructive actions leave a tamper-evident audit trail I can verify later.
- **SAFE-6**  Secrets that look like vendor keys are scrubbed before sessions are saved, and I can re-scrub history when rules tighten.
  - **SAFE-6.a**  Ask questions and choice labels are scrubbed for secrets before they are cut or posted.
- **SAFE-7**  Web fetch and search refuse private and link-local targets so the agent is not an SSRF helper.
- **SAFE-8**  When a daily spend cap is set, I get a warning at 80% of it, and at 100% the agent asks me (an Approve card to continue) instead of refusing or quietly running up the bill.
  - **SAFE-8.a**  One Approve and its code let only the paused call through, at the amount shown; the next call past the cap raises a new card and code.
- **SAFE-9**  Expensive cross-agent networking tools stay hidden until a session is allowed to use them, so small models cannot wander off starting councils unprompted.
- **SAFE-11**  A display name can't pass itself off as someone else: names are cleaned before the model sees them, and who someone is comes from their declared ids, never from what a message claims.
- **SAFE-12**  Issue, PR, comment, web page and chat bodies are data to read, not instructions to follow; only the sender's role decides what may run.
  - **SAFE-12.a**  When someone other than me picks a choice, the picked label reaches the run as their words, inside the same untrusted fence as anything they type.
- **SAFE-13**  When a message looks like an injection attempt, it doesn't act on it, and it tells me rather than going quiet.
- **SAFE-14**  It keeps rolling 24-hour spend caps per provider plus a total cap, and tracks spend against each.
  - **SAFE-14.a**  Only I see spend amounts and cap settings; everyone else only sees that work is paused for budget.
- **SAFE-15**  It warns at 80% of a cap and stops and asks at 100%, for each cap.
- **SAFE-16**  An unknown model price counts as unknown and shows as unknown, never as free.
  - **SAFE-16.a**  A call whose price is unknown stops and asks on a card that shows the amount as unknown when a cap covers it; with no cap covering it, it just runs; there is no price override.
- **SAFE-18**  When it needs my OK, it DMs me an Approve/Deny card with the exact action, target, amount, and diff or text.
- **SAFE-19**  Destructive actions and money actions also need a one-time code I type back; the code is valid once, only for that action, and expires quickly.
- **SAFE-20**  No answer, or an answer after the card expires, means no.
- **SAFE-21**  The shell refuses foot-guns (sed -i or > edits, piping downloads into a shell, deleting outside the worktree, reading secrets) and says why.
  - **SAFE-21.a**  The shell and language runners start without my GitHub or git credentials, so pushes, PRs and merges only happen through the checked GitHub tools.

## Notes (not numbered AC)

- Leif's decision on #98 (2026-09-26) amended the spend-cap criterion above: warn at 80%, ask at 100% (Approve card) rather than refuse.
- Non-ADMIN sessions refuse mutating tools at catalog + run time even when `dangerous: false` (notably files-write/edit): **ROLES-CHAT-2..5** in [`hi/roles.md`](roles.md).
