---
change: web-fetch-plugin-ssrf-guarded-issue-111-plugin-1-2-safe-7-new-plugins-web-with-one-get-only-web-fetch-command-http
artifact: requirements
---

# Requirements

1. `web-fetch` is a registered builtin with `dangerous: false`, `minTier: 1`; offered at tool/code tier, never at read tier. No `web-search`.
2. Only `http:` / `https:` URLs without embedded credentials; everything else is refused before DNS.
3. Every address the fetch would use (IP literal or every DNS answer) is checked; loopback, private, CGNAT, link-local (incl. 169.254.169.254), unique-local, multicast, unspecified, 0.0.0.0/8, reserved/documentation and IPv4-mapped / NAT64 / compatible forms of those are refused before any connection (SAFE-7).
4. The connection dials the checked IP literal only; the Host header and TLS SNI keep the original name and the certificate is verified against it.
5. Redirects are followed manually, max 5, with the full check on every hop.
6. Body capped at 1 MiB (truncated + flagged); the whole call capped at 15 s.
7. Non-text content types and compressed bodies are refused; HTML is reduced to text.
8. Output text, URLs, title and errors pass `scrubSecrets`; content is fenced as untrusted data with a random per-call marker id.
