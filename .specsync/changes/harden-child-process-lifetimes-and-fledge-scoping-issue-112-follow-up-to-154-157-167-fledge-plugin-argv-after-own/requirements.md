---
change: harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own
artifact: requirements
---

# Requirements

- REQ-plugins-154 (added): bounded children run in their own process group;
  timeout / abort / parent exit / unhandled SIGINT-SIGTERM-SIGHUP stop the
  whole tree; pid reuse guarded; bridge / daemon shutdown handlers keep
  precedence.
- REQ-plugins-112 (modified): Fledge commands bound to the project root they
  were discovered for; another root's load rebinds or removes them; a call
  from another cwd is refused (exit 2).
- REQ-plugins-113 (modified): argv `plugins run <command> -- <argv...>`;
  abort (exit 130); timeout / abort kill the plugin's tree.
- REQ-agent-117 (modified): delegate workers stop with their whole tree on
  timeout, abort, lead exit or unhandled lead signal.
- REQ-discord-108 (modified): `abandonInFlight` aborts the run's signal; the
  spawn client kills the agent's tree; `markRunStarted` removed.
- REQ-cli-108 (modified): daemon shutdown kills abandoned runs' process trees.

Unchanged: SAFE-1 deny / allowlist, ROLES-CHAT role gate, SAFE-5 audit, tier
filter, NDJSON protocol, schema version (no DB change).
