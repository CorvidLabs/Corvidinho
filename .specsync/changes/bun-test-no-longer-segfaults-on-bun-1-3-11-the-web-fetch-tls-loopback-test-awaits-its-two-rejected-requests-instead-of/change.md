---
id: bun-test-no-longer-segfaults-on-bun-1-3-11-the-web-fetch-tls-loopback-test-awaits-its-two-rejected-requests-instead-of
state: approved
type: bug_fix
base_commit: dbe37ce53abf815e39aa7a614b0361d9332bc0d4
---

# Bun test no longer segfaults on Bun 1.3.11: the web-fetch TLS loopback test awaits its two rejected requests instead of expect().rejects, which ran the event loop inside a TLS socket callback (Bun 1.3.11 use-after-free, fixed in 1.4.2)

## Intent

bun test no longer segfaults on Bun 1.3.11: the web-fetch TLS loopback test awaits its two rejected requests instead of expect().rejects, which ran the event loop inside a TLS socket callback (Bun 1.3.11 use-after-free, fixed in 1.4.2)

## Affected Canonical Specs

- None

## Acceptance Criteria

- On Bun 1.3.11, bun test --rerun-each 40 tests/web.transport.test.ts no longer segfaults (10/10 crashed before the change, 0/20 after), and full bun test runs finish without the Bun panic; the TLS test still asserts that a wrong host name and an untrusted CA are both rejected with an Error.

## No-spec Rationale

Test-only workaround for a Bun 1.3.11 runtime crash: the web-fetch TLS loopback test captures its two expected rejections with a plain await instead of expect(promise).rejects. No product code or REQ behavior changes; the same rejections are still asserted.
