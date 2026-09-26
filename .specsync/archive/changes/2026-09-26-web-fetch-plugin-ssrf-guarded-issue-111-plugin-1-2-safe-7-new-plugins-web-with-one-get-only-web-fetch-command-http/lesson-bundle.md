# Lesson bundle — web-fetch-plugin-ssrf-guarded-issue-111-plugin-1-2-safe-7-new-plugins-web-with-one-get-only-web-fetch-command-http

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Web-fetch plugin, SSRF-guarded (issue #111, PLUGIN-1/2, SAFE-7): new plugins/web with one GET-only web-fetch command; http/https only; DNS resolved and every address checked against loopback, private, CGNAT, link-local/metadata, unique-local, multicast, unspecified, reserved and IPv4-mapped/NAT64 forms; the checked IP is pinned for the socket while Host and SNI keep the original name; redirects followed manually (max 5) and re-checked per hop; 1 MiB body and 15s total caps; text content types only; output control-stripped, scrubbed and fenced as untrusted data (title inside the fence, no echo of server text); URLs carrying secrets refused; 100k-char text cap; dangerous true (SAFE-1 consent), minTier 1; web-search left for HI capture
- **Kind**: Feature
- **Specs**: plugins
- **Paths**: plugins/web/, src/plugins/builtins.ts, tests/web.fetch.test.ts, tests/web.transport.test.ts, tests/plugins.list.smoke.test.ts, specs/plugins/
- **Acceptance**: web-fetch is registered as a typed builtin plugin (dangerous true so SAFE-1 consent applies, minTier 1) that only GETs http/https URLs; loopback, RFC1918, CGNAT, link-local incl 169.254.169.254, fe80::/10, fc00::/7, multicast, unspecified, 0.0.0.0/8, reserved and IPv4-mapped/NAT64 forms of those are refused after DNS resolution, before any connection; the connection goes to the checked IP while Host and SNI use the original name so DNS rebinding cannot swap it; redirects are followed manually (max 5) and each hop is re-checked; body is capped at 1 MiB and the whole fetch at 15s; non-text content types are refused; URLs carrying secret-looking values are refused; returned text is control-stripped, capped at 100k chars, secret-scrubbed and fenced as untrusted data with the page title inside the fence and no server-chosen text echoed outside it; fixture tests with injected resolver/transport and loopback-only socket tests cover every blocked range, redirect-to-private, rebinding, caps and non-http schemes; SpecSync + fledge verify green

## Evidence

- Verification commit: `18bcb1569eb38ad92d2bd02fd08eb86079298521`
- Base commit: `20fb34ff8db5759a2aad968e74d1d21b4c344b83`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

Issue #111 (M6). Captured HI: **PLUGIN-1** (web is available as a plugin with typed commands), **PLUGIN-2** (every command declares danger + minTier and the runtime enforces it), **SAFE-7** (web fetch and search refuse private and link-local targets so the agent is not an SSRF helper). No web plugin existed before this change.

Scope is `web-fetch` only (GET). `web-search` needs a provider key and spend accounting whose provider choice is not captured in `hi/`, so it is left for HI capture. The general untrusted-content fence / injection tripwire (#71, draft SAFE-11..13) and community-role web gating (#65) are also draft and not built here; `web-fetch` fences only its own output. Because #65 is not captured and issue #111 says the community role gets no web tools unless Leif allows it, `web-fetch` is marked dangerous (SAFE-1 consent, non-interactive deny unless allowlisted, SAFE-5 audit) and URLs carrying secret-looking values are refused; Leif can relax the marking once #65 / #71 are captured.

Constraint: tests must not touch the network. Resolver and transport are injected seams; socket tests use loopback servers and never-resolving `.invalid` / `.test` names.

## From the change's design.md

# Design

`plugins/web/`:

- `address.ts`: pure IPv4/IPv6 parsing (strict dotted quad; `::`, zone ids, IPv4 tails) and `checkAddress(ip)`. Blocks 0.0.0.0/8, 10/8, 100.64/10, 127/8, 169.254/16 (metadata labelled), 172.16/12, 192.0.0/24, 192.0.2/24, 192.88.99/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4; IPv6 `::`, `::1`, IPv4-compatible `::/96`, IPv4-mapped and NAT64 `64:ff9b::/96` (checked on the embedded IPv4), 64:ff9b:1::/48, 100::/64, 2001::/23 (Teredo), 2001:db8::/32, 2002::/16, 3fff::/20, fc00::/7, fe80::/10, fec0::/10, ff00::/8, and anything outside 2000::/3. Unparseable input fails closed.
- `fetch.ts`: `webFetch(url, deps)`. http/https only, no userinfo, fragment dropped; a URL whose href (raw or percent-decoded) changes under `scrubSecrets` is refused before DNS, on the first hop and every redirect, so vendor-key-shaped values never leave the machine in a URL. IP literals are checked without DNS; `localhost` / `*.localhost` and non-canonical numeric names are refused before DNS; otherwise resolve once, refuse if ANY answer is non-public, and keep every checked answer (answer order, de-duplicated). The transport gets one checked IP + the original URL; only a socket-level connect error (`ECONNREFUSED`, `ENETUNREACH`, `EHOSTUNREACH`, `ENETDOWN`, `EHOSTDOWN`, `EADDRNOTAVAIL`, `ETIMEDOUT`) moves on to the next checked IP, inside the same deadline; the result reports the address that answered. Redirects (301/302/303/307/308) are read manually, max 5, and each hop re-runs the full check. One deadline (15 s) covers DNS, all hops and the body; the body is read up to 1 MiB and then the stream is dropped; the returned text is cut at 100,000 chars without splitting a surrogate pair (`truncated` + `truncatedBy: "bytes" | "chars"`). The Content-Type must be an RFC 6838 `type/subtype` restricted-name token (else refused as malformed, value not echoed); non-text types (anything but `text/*`, JSON/XML families, JS, YAML, TOML) and non-identity `Content-Encoding` are refused before the body is read (only known coding names are echoed); a missing content type is sniffed for NUL bytes. Non-2xx errors carry the numeric status only, never the reason phrase. HTML becomes text with linear-time scans (no backtracking regex over the page); plain text and titles have C0/C1 controls stripped.
- `transport.ts`: `createSocketTransport()`. `net.connect` / `tls.connect` to the IP literal only (throws on a hostname), `servername` = original host (omitted for IP hosts) with `rejectUnauthorized`, `Host` = `url.host`, `Connection: close`, HTTP/1.1 parsing (status line, head at most 64 KiB, 1xx skipped, chunked / content-length / close-delimited). An unsupported `Transfer-Encoding` is refused without echoing its value. No proxy: a proxy would re-resolve the name.
- `text.ts`: `htmlToText`, `extractTitle`, `stripControls` (CR/CRLF to LF, FF/VT to space, other C0/C1 dropped; newline and tab kept), `fenceUntrusted` (per-call random id; marker words inside the page are defanged; controls stripped again).
- `commands.ts`: `createWebCommands(deps)` builds `web-fetch` (dangerous=true, minTier=1). The title becomes a `Title:` line at the top of the fenced body; `data` has no title field; `contentType` is the validated token, scrubbed. Output passes through `scrubSecrets`; errors are scrubbed, control-stripped, collapsed to one line and capped at 300 chars. SAFE refusals exit 2, other failures exit 1.

Danger decision (PLUGIN-2 / SAFE-1): `dangerous: true`. The SSRF guard keeps the fetch away from private targets, but the command still sends a caller-chosen URL to a caller-chosen public host, and `files-read` can read `.env` (SAFE-2 only protects writes), so a prompt-injected run could exfiltrate in a query string. Issue #111 says the community role gets no web tools unless Leif allows it (#65, draft). Until #65 / #71 are captured, the conservative marking inside captured HI applies: SAFE-1 consent, non-interactive deny unless allowlisted, SAFE-5 audit, and the tool is left out of the default catalog. Leif can relax this later. `minTier: 1` (tool): it is network egress, so it is never offered at the read tier.

## From the change's testing.md

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

## Where these lessons go

- `specs/plugins/context.md`
