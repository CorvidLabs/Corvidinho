---
change: web-fetch-plugin-ssrf-guarded-issue-111-plugin-1-2-safe-7-new-plugins-web-with-one-get-only-web-fetch-command-http
artifact: design
---

# Design

`plugins/web/`:

- `address.ts`: pure IPv4/IPv6 parsing (strict dotted quad; `::`, zone ids, IPv4 tails) and `checkAddress(ip)`. Blocks 0.0.0.0/8, 10/8, 100.64/10, 127/8, 169.254/16 (metadata labelled), 172.16/12, 192.0.0/24, 192.0.2/24, 192.88.99/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4; IPv6 `::`, `::1`, IPv4-compatible `::/96`, IPv4-mapped and NAT64 `64:ff9b::/96` (checked on the embedded IPv4), 64:ff9b:1::/48, 100::/64, 2001::/23 (Teredo), 2001:db8::/32, 2002::/16, 3fff::/20, fc00::/7, fe80::/10, fec0::/10, ff00::/8, and anything outside 2000::/3. Unparseable input fails closed.
- `fetch.ts`: `webFetch(url, deps)`. http/https only, no userinfo, fragment dropped. IP literals are checked without DNS; `localhost` / `*.localhost` and non-canonical numeric names are refused before DNS; otherwise resolve once, refuse if ANY answer is non-public, pin the first. The transport gets the pinned IP + original URL. Redirects (301/302/303/307/308) are read manually, max 5, and each hop re-runs the full check. One deadline (15 s) covers DNS, all hops and the body; the body is read up to 1 MiB and then the stream is dropped (truncated flag). Non-text content types (anything but `text/*`, JSON/XML families, JS, YAML, TOML) and non-identity `Content-Encoding` are refused before the body is read; a missing content type is sniffed for NUL bytes. HTML becomes text with linear-time scans (no backtracking regex over the page).
- `transport.ts`: `createSocketTransport()`. `net.connect` / `tls.connect` to the IP literal only (throws on a hostname), `servername` = original host (omitted for IP hosts) with `rejectUnauthorized`, `Host` = `url.host`, `Connection: close`, HTTP/1.1 parsing (status line, head at most 64 KiB, 1xx skipped, chunked / content-length / close-delimited). No proxy: a proxy would re-resolve the name.
- `text.ts`: `htmlToText`, `extractTitle`, `fenceUntrusted` (per-call random id; marker words inside the page are defanged).
- `commands.ts`: `createWebCommands(deps)` builds `web-fetch` (dangerous=false, minTier=1). Output and errors pass through `scrubSecrets`; SAFE refusals exit 2, other failures exit 1.

Danger decision (PLUGIN-2 / SAFE-1): `dangerous: false`. It is a read-only GET that cannot write or delete anything and cannot reach private targets; the SSRF guard lives in the tool layer, per the SAFE intent. `minTier: 1` (tool): it is network egress, so it is never offered at the read tier.
