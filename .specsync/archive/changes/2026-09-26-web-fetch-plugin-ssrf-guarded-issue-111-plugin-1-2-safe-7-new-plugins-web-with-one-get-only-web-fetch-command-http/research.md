---
change: web-fetch-plugin-ssrf-guarded-issue-111-plugin-1-2-safe-7-new-plugins-web-with-one-get-only-web-fetch-command-http
artifact: research
---

# Research

- Merlin `plugins/fledge-plugin-web` / `fledge-plugin-http`: typed web commands; resolve, then pin the IP so the connection cannot be re-resolved.
- corvid-agent `server/lib/ssrf-guard.ts` (ca#479): private-range blocking list; extended here with RFC 6890 / IANA special-purpose ranges, IPv4-mapped, NAT64, 6to4 and Teredo.
- Bun 1.4 checks: `tls.connect({ host: <ip>, servername })` sends SNI = servername and verifies the certificate against it (wrong name gives an altname error). The WHATWG URL parser canonicalises `2130706433`, `0x7f.1`, `0177.0.0.1`, `127.1` to `127.0.0.1` and `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]`. Bun's `fetch` / `node:http` honour `HTTPS_PROXY`, which would re-resolve the name, so the transport uses raw `net` / `tls` sockets.
- corvid-agent `server/lib/fetch-detector.ts` (detect fetches that route around the tool) is out of this slice.
