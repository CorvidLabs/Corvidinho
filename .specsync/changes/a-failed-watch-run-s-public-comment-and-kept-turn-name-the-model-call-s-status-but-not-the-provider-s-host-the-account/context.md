---
change: a-failed-watch-run-s-public-comment-and-kept-turn-name-the-model-call-s-status-but-not-the-provider-s-host-the-account
artifact: context
---

# Context

Found in the adversarial review of PR #343 (branch
`claude/fix-watch-failed-comment`, head 58c327f). That PR stopped a failed
WATCH run's public GitHub comment from posting `LLM HTTP <status>: <provider
body>` and posts #340's DISCORD-3.b reason line instead. The reason line for a
model failure is `modelCallFailedLine` (`src/agent/providers.ts`): `The model
call failed (429 Too Many Requests from <host>)`, where `<host>` is
`providerId(provider)` — the host of `CORVIDINHO_LLM_BASE_URL` or
`OLLAMA_HOST`.

On Discord only the owner ever sees that line (anyone else gets "That didn't
work — the owner has been told.", #340). A WATCH thread is public, and the
docs invite any OpenAI-compatible gateway as the base URL, so the host can be
the account's own resource name (`<resource>.openai.azure.com`), a private
gateway's name or an Ollama server's address (Ollama takes no key). Main
never put the host on the thread (`LLM HTTP …` has none); #343 would.

Ruled out: carrying a second, host-free `error` in the result frame (a
protocol change for every surface); stripping every configured provider host
from any text (needs the child's exact env and still words lines oddly). The
line's shapes are fixed harness text, so WATCH drops the host from them.
