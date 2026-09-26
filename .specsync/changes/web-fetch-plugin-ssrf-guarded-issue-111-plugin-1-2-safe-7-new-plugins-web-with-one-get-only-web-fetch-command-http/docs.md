---
change: web-fetch-plugin-ssrf-guarded-issue-111-plugin-1-2-safe-7-new-plugins-web-with-one-get-only-web-fetch-command-http
artifact: docs
---

# Docs

Operators: `corvidinho plugins run web-fetch -- https://example.com/` (add `--json` for the structured payload). The agent tool loop offers `web-fetch` at tool/code tier. No new env vars or slash commands.

The plugin connects directly (no HTTP proxy) so the checked IP is the one dialed; on a host that can only egress through a proxy, `web-fetch` fails with a network error rather than bypass the pin. Compressed responses are refused (the request asks for identity encoding).

Spec: `specs/plugins/plugins.spec.md` Purpose / Public API / Invariants / Error Cases / Dependencies plus a SAFE-7 scenario; `specs/plugins/testing.md` line for REQ-plugins-111.
