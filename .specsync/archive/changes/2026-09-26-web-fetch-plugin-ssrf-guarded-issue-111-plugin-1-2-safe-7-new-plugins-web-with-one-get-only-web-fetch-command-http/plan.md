---
change: web-fetch-plugin-ssrf-guarded-issue-111-plugin-1-2-safe-7-new-plugins-web-with-one-get-only-web-fetch-command-http
artifact: plan
---

# Plan

1. Address classifier (`plugins/web/address.ts`).
2. Pinned socket transport (`plugins/web/transport.ts`).
3. Guarded fetch core with redirects, caps and content-type rules (`plugins/web/fetch.ts`); HTML to text + untrusted fence (`plugins/web/text.ts`).
4. `web-fetch` command + loader; register in `src/plugins/builtins.ts`.
5. Tests: `tests/web.fetch.test.ts` (seams), `tests/web.transport.test.ts` (loopback + TLS), plugins list smoke.
6. Spec text + files list; delta REQ-plugins-111; SpecSync check; fledge verify; draft PR.
