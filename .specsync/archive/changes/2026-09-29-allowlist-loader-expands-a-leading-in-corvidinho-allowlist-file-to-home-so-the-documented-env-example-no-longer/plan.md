---
change: allowlist-loader-expands-a-leading-in-corvidinho-allowlist-file-to-home-so-the-documented-env-example-no-longer
artifact: plan
---

# Plan

1. Add `tests/allowlist.tilde-path.test.ts`: resolver unit cases, loader /
   owner / doctor / `/admin` path cases, and an end-to-end case that writes the
   `.env.example` line into a temp project `.env` and runs the GITHUB-6 gate in
   a child `bun` with a temp HOME. Confirm the new cases fail on `main`.
2. Expand a leading `~` / `~/` in `resolveAllowlistPath`.
3. `.env.example` comment; plugins spec Public API note and files list; delta
   modifies REQ-plugins-006.
4. `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.
