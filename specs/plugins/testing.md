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

## files-read image mode (REQ-plugins-427, DISCORD-9)

`tests/files.plugins.test.ts` ("files-read image mode") — real 1x1 PNG in a
mkdtemp cwd: image metadata with no `content`, `result.image` base64
round-trips, stringified result < 1 KB with no U+FFFD; JPEG / GIF / WebP heads
sniffed whatever the name, a text `.png` stays text; > 20 MB refused (sparse
file), exactly 20 MB read; text read unchanged; path clamp and ROLES-CHAT-8
secret gate still refuse first. No network.
