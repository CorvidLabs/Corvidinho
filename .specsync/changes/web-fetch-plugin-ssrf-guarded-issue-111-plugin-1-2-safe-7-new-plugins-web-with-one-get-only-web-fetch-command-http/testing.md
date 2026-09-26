---
change: web-fetch-plugin-ssrf-guarded-issue-111-plugin-1-2-safe-7-new-plugins-web-with-one-get-only-web-fetch-command-http
artifact: testing
---

# Testing

- `tests/web.fetch.test.ts` (no sockets; injected resolver + transport): classification of every blocked IPv4/IPv6 range, allowed public neighbours, fail-closed non-IPs; each blocked range as a DNS answer (no transport call); mixed public+private answer; IP-literal / numeric-form / localhost URLs refused without DNS; non-http schemes; credentials; DNS failure; pinning (transport gets the checked IP + original hostname, identity encoding); IPv6 pin; rebinding (public then loopback across a redirect hop, resolver called once per hop); redirect to metadata, to a private name, to `file:`; relative redirects; max 5 redirects; 1 MiB cap with the stream not drained; exact-cap edge; 15 s default plus short timeouts for a hanging transport, a stalled body and a hanging resolver; non-text content types refused before the body; text types accepted; missing content-type sniff; gzip refused; non-2xx; charset; HTML to text; linear-time hostile markup; plugin registration (dangerous=false, minTier=1, no web-search), tier catalog, fenced + scrubbed output, exit 2 refusals through `runPlugin`.
- `tests/web.transport.test.ts` (loopback only): pinned dial with `Host: pinned.invalid:<port>`, chunked, close-delimited + 1xx, oversized head / malformed status / bad transfer-encoding, hostname refused as dial target, header control characters, abort, end-to-end size cap and stalled-body timeout through `webFetch`, TLS with an openssl-generated CA: SNI and Host = `pinned.test`, wrong name and untrusted CA rejected (skipped when openssl is absent).
- `tests/plugins.list.smoke.test.ts`: `web-fetch` listed.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-111 | `tests/web.fetch.test.ts`, `tests/web.transport.test.ts`, `tests/plugins.list.smoke.test.ts` |
