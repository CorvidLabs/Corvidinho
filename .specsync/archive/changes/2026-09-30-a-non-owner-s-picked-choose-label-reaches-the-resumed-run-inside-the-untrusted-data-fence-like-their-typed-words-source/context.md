---
change: a-non-owner-s-picked-choose-label-reaches-the-resumed-run-inside-the-untrusted-data-fence-like-their-typed-words-source
artifact: context
---

# Context

Issue #71 (SAFE-11/12/13, M2 "Talk anywhere"). The review of #299 (which
fenced and scanned an answer typed in the private Answer form) found that a
Choose pick still reached the resumed run unfenced: the bridge passed the
picked option's label straight into `Human answer:`. The model writes the
labels, but it can copy them from a non-owner's own (fenced) words, so a
community user could get their words back into the prompt as unfenced
`Human answer:` text by picking the option that repeats them. The bridge
also fell back to the raw option id from the pressed button
(`findOptionLabel(...) ?? parsed.optionId`) when no option matched, so a
forged or stale option id reached the run raw.

Leif's decision (interview 2026-09-28, round 13 on 2026-09-30,
/home/user/coord/interview-2026-09-28.md): "Non-owner button picks (SAFE-12):
a non-owner's picked label is passed to the run inside the untrusted fence,
like their typed words; the owner's picks unchanged." Captured in this change's
PR with `hi` as SAFE-12.a: "When someone other than me picks a choice, the
picked label reaches the run as their words, inside the same untrusted fence
as anything they type." (parent SAFE-12, already on main).

Out of scope: #232 / #233 (landed separately); the Answer form, chat, slash
and WATCH paths (already fenced by #295 / #299); schedule asks (text only, no
buttons).
