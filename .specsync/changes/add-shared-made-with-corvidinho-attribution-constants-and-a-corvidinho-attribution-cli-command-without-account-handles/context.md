---
change: add-shared-made-with-corvidinho-attribution-constants-and-a-corvidinho-attribution-cli-command-without-account-handles
artifact: context
---

# Context

Issue #20 requires Corvidinho-authored PR bodies to carry one consistent
attribution footer. The repository currently has no PR-body formatter or write
helper, so this change provides the shared forms and a safe CLI surface for
future callers. The footer must use only the project name and repository link,
never an account handle.
