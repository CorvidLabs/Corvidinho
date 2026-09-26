---
change: work-ships-a-pr-only-for-admin-owner-per-roles-chat-3-and-only-from-the-work-branch-never-the-base-or-a-switched
artifact: context
---

# Context

Review of #166 found /work had no ADMIN check before shipping a PR: any allowlisted non-admin could make the bridge commit, push and open a PR with the operator credentials, bypassing ROLES-CHAT-3. git-push also pushed whatever branch HEAD was on.
