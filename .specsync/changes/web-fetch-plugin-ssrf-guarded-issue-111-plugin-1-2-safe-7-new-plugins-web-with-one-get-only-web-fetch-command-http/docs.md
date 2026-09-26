---
change: web-fetch-plugin-ssrf-guarded-issue-111-plugin-1-2-safe-7-new-plugins-web-with-one-get-only-web-fetch-command-http
artifact: docs
---

# Docs

Operators: `corvidinho plugins run web-fetch -- https://example.com/` (add `--json` for the structured payload). `web-fetch` is marked dangerous (SAFE-1): in non-interactive mode it is denied unless `CORVIDINHO_ALLOWLIST` names `web-fetch`, every run is on the SAFE-5 audit trail, and the agent tool loop leaves it out of the default catalog. No new env vars or slash commands.

The plugin connects directly (no HTTP proxy) so the checked IP is the one dialed; on a host that can only egress through a proxy, `web-fetch` fails with a network error rather than bypass the pin. When a name has several public answers and one cannot be reached (for example broken IPv6 egress), the next checked answer is tried. Compressed responses are refused (the request asks for identity encoding). URLs that carry vendor-key-shaped values are refused. Returned text is capped at 100,000 characters; `truncatedBy` says whether the byte or the char cap cut it.

Spec: `specs/plugins/plugins.spec.md` Purpose / Public API / Invariants / Error Cases / Dependencies plus SAFE-7 and fence scenarios; `specs/plugins/testing.md` line for REQ-plugins-111.
