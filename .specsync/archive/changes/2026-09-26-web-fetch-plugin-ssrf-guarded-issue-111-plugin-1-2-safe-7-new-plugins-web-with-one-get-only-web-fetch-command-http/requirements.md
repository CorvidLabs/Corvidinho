---
change: web-fetch-plugin-ssrf-guarded-issue-111-plugin-1-2-safe-7-new-plugins-web-with-one-get-only-web-fetch-command-http
artifact: requirements
---

# Requirements

1. `web-fetch` is a registered builtin with `dangerous: true`, `minTier: 1`: SAFE-1 consent applies (left out of the default tool catalog, non-interactive deny unless allowlisted, SAFE-5 audit); offered at tool/code tier only with dangerous tools included, never at read tier. No `web-search`.
2. Only `http:` / `https:` URLs without embedded credentials; everything else is refused before DNS. A URL (first hop or redirect) carrying a value `scrubSecrets` would redact, raw or percent-decoded, is refused before DNS.
3. Every address the fetch would use (IP literal or every DNS answer) is checked; loopback, private, CGNAT, link-local (incl. 169.254.169.254), unique-local, multicast, unspecified, 0.0.0.0/8, reserved/documentation and IPv4-mapped / NAT64 / compatible forms of those are refused before any connection (SAFE-7).
4. The connection dials checked IP literals only, in answer order, moving to the next checked address only after a socket-level connect error (same deadline); the Host header and TLS SNI keep the original name and the certificate is verified against it.
5. Redirects are followed manually, max 5, with the full check on every hop.
6. Body capped at 1 MiB, returned text at 100,000 chars (truncated + flagged with which cap); the whole call capped at 15 s.
7. Non-text content types, a Content-Type that is not an RFC 6838 `type/subtype` token, and compressed bodies are refused; HTML is reduced to text.
8. Output text, URLs and errors pass `scrubSecrets`; C0/C1 control characters are stripped (newline and tab kept); content is fenced as untrusted data with a random per-call marker id; the page title is a `Title:` line inside the fence, never a separate field; errors never echo the reason phrase or other server-chosen header values and are one line, control-free and length-capped.
