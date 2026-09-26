---
change: web-fetch-plugin-ssrf-guarded-issue-111-plugin-1-2-safe-7-new-plugins-web-with-one-get-only-web-fetch-command-http
artifact: testing
---

# Testing

- `tests/web.fetch.test.ts` (no sockets; injected resolver + transport): classification of every blocked IPv4/IPv6 range, allowed public neighbours, fail-closed non-IPs; each blocked range as a DNS answer (no transport call); mixed public+private answer; IP-literal / numeric-form / localhost URLs refused without DNS; non-http schemes; credentials; DNS failure; pinning (transport gets the checked IP + original hostname, identity encoding); IPv6 pin; rebinding (public then loopback across a redirect hop, resolver called once per hop); redirect to metadata, to a private name, to `file:`; relative redirects; max 5 redirects; 1 MiB cap with the stream not drained; exact-cap edge; 15 s default plus short timeouts for a hanging transport, a stalled body and a hanging resolver; non-text content types refused before the body; text types accepted; missing content-type sniff; gzip refused; non-2xx; charset; HTML to text; linear-time hostile markup; plugin registration (dangerous=true, minTier=1, no web-search), default catalog leaves it out, tool/code tier only with dangerous tools, SAFE-1 non-interactive deny, fenced + scrubbed output, exit 2 refusals through `runPlugin` (allowlisted).
- Same file, hardening: hostile `<title>` only as a `Title:` line inside the fence (JSON and text mode), prose / over-long / control-character Content-Type refused without echo, valid media type reported as a token, reason phrase never echoed (numeric status only), unknown Content-Encoding and long redirect schemes not echoed, transport error text one line / control-free / capped; URLs carrying `ghp_` / `sk-` values (raw, percent-encoded, in the host) and redirect Locations carrying them refused before DNS and the transport; ordinary query strings still pass; connect-error fallback (IPv6 ENETUNREACH then IPv4, dead A record skipped, all-failed error counts tries, TLS error not retried, unchecked address never dialed); 100,000-char text cap (default, command summary, surrogate pair kept whole); control-character stripping (`&#27;` / `&#7;` entities, raw ESC / C1 / CR in text/plain, titles, the command's text output, the fence).
- `tests/web.transport.test.ts` (loopback only): pinned dial with `Host: pinned.invalid:<port>`, chunked, close-delimited + 1xx, oversized head / malformed status / bad transfer-encoding (value not echoed), hostname refused as dial target, header control characters, abort, end-to-end size cap and stalled-body timeout through `webFetch`, TLS with an openssl-generated CA: SNI and Host = `pinned.test`, wrong name and untrusted CA rejected (skipped when openssl is absent).
- `tests/plugins.list.smoke.test.ts`: `web-fetch` listed.

## Requirement evidence

| Requirement | Test | Evidence |
|-------------|------|----------|
| REQ-plugins-111 | `tests/web.fetch.test.ts` | Guard, pinning + fallback, redirects, caps (bytes, chars, time), content types, secret-URL refusal, fence-only title, no echo of server text, control stripping, dangerous=true / SAFE-1 deny, tier catalog |
| REQ-plugins-111 | `tests/web.transport.test.ts` | Pinned loopback socket + TLS SNI / cert-name fixtures; transfer-encoding refusal without echo |
| REQ-plugins-111 | `tests/plugins.list.smoke.test.ts` | `web-fetch` in `plugins list` |
