---
change: release-0-0-48-safe-8-8-a-flat-priced-spend-card-436-autonomy-5-thin-words-and-emoji-437-and-identity-6-allowlist-file
artifact: context
---

# Context

Release after landing SAFE-8 / SAFE-8.a flat-priced spend card (#436), AUTONOMY-5 thin words and emoji (#437) and IDENTITY-6 allowlist file (#435) on main. Live remains on v0.0.47 until this bump lands and cutover runs. No HI invented: all three PRs fix gaps against criteria already captured in `hi/safe.md`, `hi/autonomy.md` and `hi/identity.md`. Their SpecSync changes stay open on main (state `verifying`) until CorvidLabs/spec-sync#833 lets them archive; this release refreshes their verification evidence after merging main and does not finalize or archive them. Brave stays off; GIPHY keeps existing env.
