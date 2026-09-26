---
change: web-fetch-plugin-ssrf-guarded-issue-111-plugin-1-2-safe-7-new-plugins-web-with-one-get-only-web-fetch-command-http
artifact: context
---

# Context

Issue #111 (M6). Captured HI: **PLUGIN-1** (web is available as a plugin with typed commands), **PLUGIN-2** (every command declares danger + minTier and the runtime enforces it), **SAFE-7** (web fetch and search refuse private and link-local targets so the agent is not an SSRF helper). No web plugin existed before this change.

Scope is `web-fetch` only (GET). `web-search` needs a provider key and spend accounting whose provider choice is not captured in `hi/`, so it is left for HI capture. The general untrusted-content fence / injection tripwire (#71, draft SAFE-11..13) and community-role web gating (#65) are also draft and not built here; `web-fetch` fences only its own output.

Constraint: tests must not touch the network. Resolver and transport are injected seams; socket tests use loopback servers and never-resolving `.invalid` / `.test` names.
