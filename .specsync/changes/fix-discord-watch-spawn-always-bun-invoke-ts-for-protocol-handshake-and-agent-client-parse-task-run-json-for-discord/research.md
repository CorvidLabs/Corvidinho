---
change: fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord
artifact: research
---

# Research

- Live bridge log EACCES on posix_spawn of `src/cli.ts` during `--protocol-version`.
- Existing discord/watch agent-clients already attempted bun prefix for `.ts` but protocol-version did not.
- AGENT-5 allows provider pick; thin chat-completions hook is enough without inventing HI; full tool loop deferred.
