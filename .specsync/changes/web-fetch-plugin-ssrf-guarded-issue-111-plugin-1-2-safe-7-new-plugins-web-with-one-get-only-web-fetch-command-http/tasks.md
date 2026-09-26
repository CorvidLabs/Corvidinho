---
change: web-fetch-plugin-ssrf-guarded-issue-111-plugin-1-2-safe-7-new-plugins-web-with-one-get-only-web-fetch-command-http
artifact: tasks
---

# Tasks

- [x] Address classifier with fail-closed parsing
- [x] Pinned HTTP/1.1 socket transport (net/tls, SNI + cert name, no proxy)
- [x] Guarded fetch core: scheme/userinfo, DNS check of every answer, pin, manual redirects (max 5), 1 MiB / 15 s caps, text-only content types
- [x] HTML to text and untrusted fence; secret scrub on output and errors
- [x] `web-fetch` command (dangerous=true, minTier=1) registered in builtins
- [x] Tests: every blocked range, redirect-to-private, rebinding, caps, schemes, loopback socket + TLS fixtures, list smoke
- [x] Review hardening: title inside the fence, media-type token check, no echo of reason phrase / header values, secret-bearing URLs refused, connect-error fallback across checked addresses, 100k-char text cap, control characters stripped, SAFE-1 danger marking
- [x] Spec text + files list, delta REQ-plugins-111, SpecSync check, fledge verify
