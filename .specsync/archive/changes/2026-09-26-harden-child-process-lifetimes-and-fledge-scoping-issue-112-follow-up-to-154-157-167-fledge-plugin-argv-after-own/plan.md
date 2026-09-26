---
change: harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own
artifact: plan
---

# Plan

1. Probe fledge 1.8.0 `--` handling and Bun `detached` semantics.
2. Add `src/plugins/proc-group.ts` + `tests/proc-group.test.ts`.
3. Fledge: `--` argv, detached spawn with tree kill and abort, project-root
   binding and rebinding; `registry.unregister`; `tests/fledge.hardening.test.ts`;
   existing fakes consume one `--` like fledge.
4. Delegate: detached worker, tree SIGTERM / SIGKILL sweep, tracked; two
   regression tests.
5. Spawn client `signal` + detached + tracked; scheduler per-run abort;
   remove `markRunStarted`; daemon doc; scheduler + daemon regression tests.
6. Deltas for plugins / agent / discord / cli; spec files list; verify.
