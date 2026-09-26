---
module: plugins
change: web-fetch-plugin-ssrf-guarded-issue-111-plugin-1-2-safe-7-new-plugins-web-with-one-get-only-web-fetch-command-http
---

# Delta — plugins (web-fetch, SSRF-guarded)

## Added

### REQUIREMENT REQ-plugins-111

The plugin host SHALL provide a typed `web-fetch` builtin (PLUGIN-1) declared
`dangerous: false` and `minTier: 1` (PLUGIN-2) that performs one HTTP GET and
returns text. It SHALL accept only `http` and `https` URLs without embedded
credentials. Before any connection it SHALL check every address the fetch would
use (the IP literal, or every DNS answer) and SHALL refuse (SAFE-7) loopback,
private (RFC 1918), CGNAT (100.64.0.0/10), link-local (169.254.0.0/16 including
169.254.169.254, fe80::/10), unique-local (fc00::/7), multicast, unspecified,
0.0.0.0/8, reserved/documentation space and IPv4-mapped, IPv4-compatible and
NAT64 forms of those; one non-public answer SHALL refuse the name. The
connection SHALL dial only the checked IP while the Host header and TLS SNI
keep the original name and the certificate is verified against it, so DNS
rebinding cannot swap the target. Redirects SHALL be followed manually (at most
5) with the full check on every hop. The body SHALL be capped at 1 MiB and the
whole call at 15 seconds. Non-text content types and compressed bodies SHALL be
refused. Returned text SHALL be secret-scrubbed (SAFE-6 `scrubSecrets`) and
fenced as untrusted data with a per-call random marker id.

Acceptance Criteria
- `plugins list` shows `web-fetch` with dangerous=false, minTier=1; it is offered at tool/code tier and never at read tier; no `web-search` command exists.
- Each blocked range, as an IP literal, a DNS answer or a redirect target, is refused with exit 2 before the transport is called.
- A name that resolves public then private (rebinding) is dialed only at the checked public IP; the private answer on a later hop is refused.
- Non-http schemes, URL credentials and more than 5 redirects are refused.
- A body over 1 MiB is truncated and flagged; a stalled transport, body or resolver times out.
- Non-text content types are refused before the body is read.
- Output is fenced as untrusted data and vendor-key-looking secrets are redacted.
