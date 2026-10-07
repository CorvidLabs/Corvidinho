---
id: session-5-a-each-configured-model-has-its-own-context-window-at-about-80-of-the-whole-prompt-a-model-writes-the-summary
state: implementing
type: feature
base_commit: 6a5abf862b0c8d102239afde563bc9b6073b70dd
---

# SESSION-5.a: each configured model has its own context window; at about 80% of the whole prompt a model writes the summary of older turns, the task and latest instruction stay word for word

## Intent

SESSION-5.a: each configured model has its own context window; at about 80% of the whole prompt a model writes the summary of older turns, the task and latest instruction stay word for word

## Affected Canonical Specs

- `agent`
- `cli`
- `discord`
- `watch`

## Acceptance Criteria

- SESSION-5.a (captured in this PR with hi from Leif's 2026-09-28 interview, round 16): each configured model has its own context window (kind:model=TOKENS on its AGENT-13 entry, never part of the model id; CORVIDINHO_LLM_CONTEXT_TOKENS, default 8192, for an entry with none); a Discord (chat, ask answer) or WATCH run gets its replayed conversation on stdin (task run --task-stdin, no 32,000-char argument ceiling) and, when the whole prompt it sends (system prompt, tools, persona, project instructions, memory and identity blocks, conversation, new message) reaches 80% of the current model's window, folds the oldest turns and that model writes their summary in one no-tools call through the run's spend guard (counts toward every cap, never failed over); the task and the latest instruction are never folded or sent to the summary call and stay word for word; a failed summary call keeps the extractive summary and says so in the run and the bridge log; the bridge stores the reported summary with the session (SESSION-6, SESSION-3.a resume) and drops the folded turns. Fake-LLM tests prove per-model window, whole-prompt trigger, model-written summary, pinned verbatim, fallback, spend; they fail on the base sources.

## No-spec Rationale

Not applicable
