---
change: bun-test-no-longer-segfaults-on-bun-1-3-11-the-web-fetch-tls-loopback-test-awaits-its-two-rejected-requests-instead-of
artifact: testing
---

# Testing

Crash reproducer on the real file (Bun 1.3.11). It crashed 10/10 before this
change and 0/20 after:

```bash
bun test --rerun-each 40 tests/web.transport.test.ts
```

Full suite, run repeatedly, with two runs side by side. Before: 4 crashes in
20 runs. After: 0 crashes:

```bash
bun test
```

Gates:

```bash
bunx tsc --noEmit
specsync check --require-coverage 100
specsync change audit
fledge lanes run verify --non-interactive
```

The TLS test still asserts that a wrong host name (`other.test`) and the
default trust roots (untrusted fixture CA) both reject with an `Error`.
