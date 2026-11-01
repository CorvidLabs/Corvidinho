---
change: release-0-0-48-safe-8-8-a-flat-priced-spend-card-436-autonomy-5-thin-words-and-emoji-437-and-identity-6-allowlist-file
artifact: plan
---

# Plan

1. Bump `package.json` to 0.0.48; update version fixtures.
2. Fold CHANGELOG into 0.0.48 (#436 / #437 / #435); refresh STATUS.
3. Add REQ-cli-440 to living cli requirements + SpecSync delta.
4. Approve → verify → review; the open SAFE-8 / AUTONOMY-5 / IDENTITY-6 changes are re-checked on the merged head and stay open until CorvidLabs/spec-sync#833 lets them archive (no finalize).
5. After CI tags v0.0.48: cut live checkout to the release SHA; restart bridge + github-watch; Discord announce.
