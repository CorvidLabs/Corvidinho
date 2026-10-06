---
change: it-can-merge-its-own-corvidinho-pr-when-i-ask-and-every-gate-is-green-never-its-gates-never-someone-else-s-github-7
artifact: research
---

# Research

- Sources: issue #124 (body and comments: GITHUB-7 limited to Corvidinho,
  "its own green PRs merge only on Corvidinho, where repo rules allow"), the
  interview record `/home/user/coord/interview-2026-09-28.md` (round 4:
  capture GITHUB-7 Corvidinho-only; round 13: merges only when asked, no
  merge while CI runs, gate PRs wait for a human; round 16: "safe defaults",
  the text captured as GITHUB-7.a), and the self-merge rows of
  `/home/user/coord/m34-defaults.md` (conservative defaults, not Leif
  decisions: only author id == token id from a same-repo `talk/…` branch;
  refuse a changed-file list that touches a gate or is truncated; an
  outstanding CHANGES_REQUESTED blocks; `smoke` + `spec-sync` present and
  passed at the head with the verdict green and no warning; no GITHUB-9 /
  scan gate). One default is not followed: requiring the caller's checkout
  at the head (round 16 and the brief name no local checkout; CI's two jobs
  run every verify-lane step at the head).
- Live check names on main (`checks.listForRef` at e1a24ed2, rechecked at 86d68cd0): `smoke`,
  `spec-sync`, `Analyze (javascript-typescript)`, `Analyze (actions)`,
  `release`, all from `github-actions`. The job ids in `ci.yml` and
  `spec-sync.yml` are the check names. Branch protection is not readable with
  this session's token (403), so the gate reads GitHub's own
  `mergeable_state` instead of the protection settings.
- GitHub REST: `pulls.merge` takes `sha` (409 when the head moved),
  `merge_method` and `commit_title` and has no bypass parameter; an admin
  token can still merge past unmet protection when admins are not enforced,
  so `mergeable_state` must be `clean` (or `has_hooks`) first — `blocked`,
  `unstable`, `behind`, `dirty`, `draft` and `unknown` refuse.
- Corvidinho's own talk branches come only from `generateTalkBranchName`
  (`talk/<16-char id prefix>-<16 hex>`) for chat, `/session`, `/work`,
  schedule and CLI talks; coordinator branches are `claude/…` / `chore/…`.
- The must-ask engine (#316) binds one class per card kind and the bridge
  registers `MUST_ASK_CARD_KINDS` generically, so a new kind needs no bridge
  change. The SAFE-3.a gate's building blocks (`actingSurface`,
  `SAFE3A_SURFACES`, `TOOL_CHILD_ENV`) already define "the owner's own
  interactive run".
- #374 (IDENTITY-12.a, merged before this rebuild): WATCH runs carry
  `CORVIDINHO_ACTING_SURFACE=watch` plus `CORVIDINHO_WATCH_SESSION_ID`, and
  the owner's own one resolves owner (`resolveActingIsAdmin`), so the role
  gate passes for it; `isWatchRunEnv` (src/plugins/roles.ts) is the shared
  test for the stamp.
