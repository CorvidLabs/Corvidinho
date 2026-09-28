# Lesson bundle — bun-test-no-longer-segfaults-on-bun-1-3-11-the-web-fetch-tls-loopback-test-awaits-its-two-rejected-requests-instead-of

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Bun test no longer segfaults on Bun 1.3.11: the web-fetch TLS loopback test awaits its two rejected requests instead of expect().rejects, which ran the event loop inside a TLS socket callback (Bun 1.3.11 use-after-free, fixed in 1.4.2)
- **Kind**: BugFix
- **Paths**: tests/web.transport.test.ts
- **Acceptance**: On Bun 1.3.11, bun test --rerun-each 40 tests/web.transport.test.ts no longer segfaults (10/10 crashed before the change, 0/20 after), and full bun test runs finish without the Bun panic; the TLS test still asserts that a wrong host name and an untrusted CA are both rejected with an Error.

## Evidence

- Verification commit: `207d3f51f209ac22f973c24ec8837e9c67aa36fa`
- Base commit: `dbe37ce53abf815e39aa7a614b0361d9332bc0d4`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

`bun test` on Bun 1.3.11 sometimes crashed the whole run about 20 s in with
`panic(main thread): Segmentation fault at address 0x0` (exit 132). It also
happened on `main`. Roughly 1 run in 5 crashed, more often with two suites
running side by side. The crash happens in `tests/web.transport.test.ts`,
in the test "SNI and Host carry the original name; the cert is checked against
it" (REQ-plugins-111). `tests/discord.ask-ephemeral.test.ts` was only the last
file that printed output before the crash.

## Root cause (a Bun 1.3.11 bug, not a Corvidinho bug)

- Core dumps of the suite crash all show the same fault: Bun's TLS read handler
  (`ssl_on_data` in its uSockets layer) calls a socket close on a socket whose
  memory was already freed and reused. The freed memory holds unrelated data,
  so the "is closed" check reads garbage.
- The handler had just delivered 70 bytes to JS. That is exactly the size of
  the fixture reply `HTTP/1.1 200 OK … Content-Length: 6 … secure`, which
  arrives together with the TLS close_notify.
- Inside that JS callback, the test's continuation runs: it reads the body,
  calls `res.close()`, then `await expect(promise).rejects.toThrow()`. In
  bun:test, `expect(promise).rejects` runs the event loop synchronously until
  the promise settles, on both 1.3.11 and 1.4.2 (checked with a probe test).
  That loop run frees the just-closed socket while the native TLS frame still
  holds it. On return, Bun 1.3.11 uses the freed socket and segfaults.
- The second `.rejects` (untrusted CA) runs inside the callback of the first
  rejected TLS socket and crashes the same way. A standalone reproducer
  crashed 5/5 with only the first `.rejects` replaced.
- A plain `await promise.then(ok, err)` never runs a nested event loop, so the
  native frame gets back a socket that is closed but not yet freed.

## Why it was intermittent

The crash needs the freed socket memory to be reused before Bun reads it
again. That is rare in a small heap and more likely in the full suite, so the
file alone passed 40/40 times. `bun test --rerun-each 40
tests/web.transport.test.ts` grows the heap and crashed 10/10 on 1.3.11.

## Bun 1.4.2 (the CI pin)

CI pins Bun 1.4.2 (`.github/workflows/ci.yml`). There, the reproducer, the
`--rerun-each 40` run and 12 full-suite runs never crashed. The local
container and the fledge verify lane still use 1.3.11, so this change is a
workaround for that runtime. No product code is affected: `plugins/web/transport.ts` never
re-enters the event loop inside a socket callback. Only bun:test's
`.rejects` / `.resolves` do that here.

## Ruled out

- The plain-TCP `.rejects` in the same file ("refuses oversized heads…"),
  which also runs inside a socket callback, did not crash in 2000 reproducer
  iterations on 1.3.11. It is left unchanged to keep the change minimal.
- Timers, SQLite handles and subprocesses are not the cause. Every captured
  crash (4 full-suite runs, 3 core dumps) has the same TLS stack.

## From the change's testing.md

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

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
