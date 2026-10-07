---
change: every-working-day-the-owner-and-each-teammate-get-a-short-briefing-dm-about-their-own-work-in-their-own-hours-and
artifact: research
---

# Research

- Steal-from (#102): corvid-agent's daily review (`server/improvement/daily-review.ts`)
  and scheduled handlers ("blockers immediately, routine work batched"); the
  notes' "recall each person's goals before writing about them; one turn =
  one message". Taken: one message per person per day, built from that
  person's own items; not taken: saving the review to memory (MEMORY-ACL and
  the interview's "that person's data only" keep the briefing out of memory),
  nightly health reports (out of scope per Leif).
- Existing Corvidinho pieces reused instead of parallel systems: the
  scheduler tick (`SchedulerServiceOpts`, like the OPS-1/2 backup ticker and
  its once-per-night claim), the declared people reader and
  `resolvePerson` (roles, stable ids), the `/admin people` writer and its
  audit, the GitHub allowlist gate (`isRepoAllowed`), Octokit with
  `GITHUB_TOKEN` / `GH_TOKEN` (as the `link github:` lookup), the read
  tier's model chain and the no-tools `chatCompletions` call (as the GITHUB-9
  reviewer), `createSpendGuard` over the shared ledger, the persona block,
  `fenceUntrustedData`, `scrubSecrets` / `SCRUB_TARGETS`,
  `defangMassMentions`, the gateway `sendDm` and the owner's spend DM.
- Time zones: Bun's `Intl.DateTimeFormat` with a `timeZone` resolves IANA
  names (canonical spelling via `resolvedOptions`) and also accepts raw
  offsets (`+02:00`), which are refused here so a person's hours follow
  daylight saving.
- GitHub search: issue / PR search needs an `is:issue` or `is:pr`
  qualifier; results carry `user.id` and `assignees[].id` (numeric), but not
  requested reviewers, so a review request is confirmed with
  `pulls.listRequestedReviewers` (numeric ids) before it counts
  (IDENTITY-7.a).
