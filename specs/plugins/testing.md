# Testing — plugins

See `tests/plugins.*.test.ts` and `tests/github.*.test.ts`. Prefer fixtures over live `gh`.
- memory-* plugin list + forget ACL fixtures (REQ-plugins-010).
- files-* / search-grep happy path + SAFE-2 deny + path escape (REQ-plugins-081..084).
- web-fetch SAFE-7 guard: every blocked range, DNS answers, redirect/rebinding, caps, content types via injected resolver/transport; loopback-only socket + TLS SNI fixtures (REQ-plugins-111).
- git-* plugins against temp repos (`git init` in mkdtemp, isolated git config)
  and a local bare remote at `<tmp>/acme/widget.git` gated via
  `CORVIDINHO_GITHUB_ALLOW_REPOS` / a temp allowlist file (REQ-plugins-182).
- `delegate` autonomous plugin against sh / `.ts` fake bins in mkdtemp dirs:
  refusals spawn nothing, argv / env of the worker, failure, spawn failure, timeout, abort,
  drain, `.env` isolation, worker env without bridge / GitHub tokens or the
  audit key (`tests/autonomous.delegate.test.ts`, REQ-plugins-117); `delegate`
  mutating ⇒ non-ADMIN role session catalog omits it and `runPlugin` refuses it
  (`tests/autonomous.enabled.test.ts`, ROLES-CHAT-2/3).
- `council` autonomous plugin against a `.ts` fake bin in a mkdtemp dir:
  declaration, SAFE-9 catalog, refusals spawn nothing (incl. a depth 1
  delegated worker), voice argv / env (read
  tier, empty allowlist, `CORVIDINHO_ACTING_IS_ADMIN=0`, stripped tokens),
  tier clamp, long decision kept past the chat-body cap, failed chair, council time cap, one-at-a-time limiter, non-ADMIN
  `runPlugin` refusal (`tests/autonomous.council.test.ts`, REQ-plugins-118).

## discord-user-lookup (REQ-plugins-312)

`tests/discord.user-lookup.test.ts` — see also discord testing companion.

## Language runners (REQ-plugins-313..314)

`tests/runners.plugins.test.ts` — stub `node` / `python3` / `cargo` /bin/sh
scripts in a mkdtemp PATH dir: registration and danger/tier markings, python3
before python, relative PATH entries ignored, a `node` symlink to Bun skipped
(also under `bun run corvidinho plugins list`), argv verbatim (no shell) and cwd
= project root, non-zero exit, usage error, scrubbed child env, SAFE-1 deny,
code-tier / dangerous / ADMIN-only catalog, abort and timeout kill the tree;
an empty PATH registers nothing and `plugins list` (CLI spawn) exits 0 naming
each missing runner; a deleted binary returns exit 127. Real `node`, `python3`
and `cargo` smoke tests are skipped where the toolchain is not installed.
