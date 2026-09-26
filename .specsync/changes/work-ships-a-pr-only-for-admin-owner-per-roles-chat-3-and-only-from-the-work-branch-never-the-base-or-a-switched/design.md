---
change: work-ships-a-pr-only-for-admin-owner-per-roles-chat-3-and-only-from-the-work-branch-never-the-base-or-a-switched
artifact: design
---

# Design

Hoist the ADMIN resolution in the /work handler; non-ADMIN gets a plain line and the PR step never runs. In openWorkPr, before any mutating step, require `symbolic-ref HEAD` == work branch and != base (new skip reason `wrong-branch`).
