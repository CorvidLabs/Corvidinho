---
id: web-fetch-plugin-ssrf-guarded-issue-111-plugin-1-2-safe-7-new-plugins-web-with-one-get-only-web-fetch-command-http
state: archived
type: feature
base_commit: 20fb34ff8db5759a2aad968e74d1d21b4c344b83
---

# Web-fetch plugin, SSRF-guarded (issue #111, PLUGIN-1/2, SAFE-7): new plugins/web with one GET-only web-fetch command; http/https only; DNS resolved and every address checked against loopback, private, CGNAT, link-local/metadata, unique-local, multicast, unspecified, reserved and IPv4-mapped/NAT64 forms; the checked IP is pinned for the socket while Host and SNI keep the original name; redirects followed manually (max 5) and re-checked per hop; 1 MiB body and 15s total caps; text content types only; output control-stripped, scrubbed and fenced as untrusted data (title inside the fence, no echo of server text); URLs carrying secrets refused; 100k-char text cap; dangerous true (SAFE-1 consent), minTier 1; web-search left for HI capture

## Intent

web-fetch plugin, SSRF-guarded (issue #111, PLUGIN-1/2, SAFE-7): new plugins/web with one GET-only web-fetch command; http/https only; DNS resolved and every address checked against loopback, private, CGNAT, link-local/metadata, unique-local, multicast, unspecified, reserved and IPv4-mapped/NAT64 forms; the checked IP is pinned for the socket while Host and SNI keep the original name; redirects followed manually (max 5) and re-checked per hop; 1 MiB body and 15s total caps; text content types only; output control-stripped, scrubbed and fenced as untrusted data (title inside the fence, no echo of server text); URLs carrying secrets refused; 100k-char text cap; dangerous true (SAFE-1 consent), minTier 1; web-search left for HI capture

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- web-fetch is registered as a typed builtin plugin (dangerous true so SAFE-1 consent applies, minTier 1) that only GETs http/https URLs; loopback, RFC1918, CGNAT, link-local incl 169.254.169.254, fe80::/10, fc00::/7, multicast, unspecified, 0.0.0.0/8, reserved and IPv4-mapped/NAT64 forms of those are refused after DNS resolution, before any connection; the connection goes to the checked IP while Host and SNI use the original name so DNS rebinding cannot swap it; redirects are followed manually (max 5) and each hop is re-checked; body is capped at 1 MiB and the whole fetch at 15s; non-text content types are refused; URLs carrying secret-looking values are refused; returned text is control-stripped, capped at 100k chars, secret-scrubbed and fenced as untrusted data with the page title inside the fence and no server-chosen text echoed outside it; fixture tests with injected resolver/transport and loopback-only socket tests cover every blocked range, redirect-to-private, rebinding, caps and non-http schemes; SpecSync + fledge verify green

## No-spec Rationale

Not applicable
