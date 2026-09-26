---
change: plugin-file-and-search-tools-with-protected-paths-plugin-1-2-safe-2-issue-81
artifact: design
---

# Design

In-process Bun plugins (same host as memory/github). Shared `resolveProjectPath`
+ `isProtectedPath` used by write/edit/delete. Spec edits stay out of file tools
(SAFE-2); SpecSync plugins remain the path for specs. No shell/git in this slice.
