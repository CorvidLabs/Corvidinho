---
hi: 1
families: [AGENT]
owner: leif
---

# Agent

## Intent

Corvidinho is the agent I actually run on a Linux box: it reads the project’s rules, does the work with tools, and only claims done when the verify lane says so. It should feel like a careful junior with a checklist, not a chat window that forgets what “finished” means.

## Criteria

- **AGENT-1**  I can give Corvidinho a task in a project folder and it works from that project’s own config and tools, not from some global sandbox of its own.
  - **AGENT-1.a**  In a project that isn't a git repo, my own runs work in the project folder itself (protected files and the verify gate still apply); other people's runs only read there.
- **AGENT-2**  Before it writes code, it loads the relevant specs so the work is constrained by what we already agreed, not by vibes.
- **AGENT-3**  It runs a tool loop I can interrupt, and when I interrupt it, it actually stops instead of finishing in the background.
  - **AGENT-3.a**  In Discord I can stop a run with a Stop button or by saying stop or cancel, and so can the person who asked; a message sent while a run is going waits for it instead of starting a second run.
- **AGENT-4**  It does not tell me the job is done until the project’s verify lane has passed, or it tells me plainly that verification failed.
  - **AGENT-4.a**  If verification fails and retries remain, it keeps working with the failure output instead of shrugging.
- **AGENT-5**  I can pick a provider and a capability tier so cheap models stay on read-shaped work and expensive ones are used when tools and code are required.
- **AGENT-6**  I can leave a session and come back to it later without losing the thread.
  - **AGENT-6.a**  A conversation's condensed summary and its recent turns are kept, scrubbed, for 30 days per thread, so a restart doesn't lose it (MEMORY-1); WATCH follow-ups pick up the issue or PR thread's summary; forgetting someone deletes theirs.
- **AGENT-7**  It remembers the small durable facts I asked it to keep for this project, without needing a blockchain to do so.
- **AGENT-8**  While it works I can see what state it is in — planning, calling a tool, verifying, or done — so bridges and the CLI are not guessing.
- **AGENT-9**  When the tool-round budget runs out, finish with the best prose so far or a brief clarifying ask — never dump internal stop reasons like Stopped after N tool rounds into the Discord channel body (thinking embed / operator plumbing may note it)
- **AGENT-13**  I configure its models (OpenAI-compatible, Ollama, Anthropic or a headless agent CLI), and there's no built-in default.
- **AGENT-10**  With no provider set, it says so at startup and in /status.
- **AGENT-11**  If a model fails or is retired, it falls back to my next configured model and tells me.
- **AGENT-12**  An idle timeout and a turn cap that I set stop stalled or endless runs, and it says so.
- **AGENT-14**  Verification can't be skipped, and chat, WATCH, scheduled and work runs share one gate.
- **AGENT-15**  The real git diff decides what changed, and 'verified' requires that tests ran and none were deleted.
  - **AGENT-15.a**  After a restart or retry, 'verified' still covers every edit made since the talk started, including ones an earlier attempt left.
- **AGENT-16**  When it repeats a failing call, it changes approach or asks me.
- **AGENT-17**  If it only plans, or says 'Done.' without changing anything, it gets one nudge, then moves to a stronger model I've configured.
- **AGENT-18**  It works each repo's own way: a SpecSync change where the repo uses SpecSync; where it uses hi, it drafts criteria and asks before capturing, never inventing them; and Trust where the repo uses Trust.

## Notes (not numbered AC)

- **Light agent.3md adopt (2026-09-26):** Leif — ship a root guidance-only `agent.3md` + `@corvidlabs/agent3md` dep and validate/route smoke. Does **not** replace hi/, SpecSync, MEMORY, sessions, or the SAFE plugin registry. **Do not invent AGENT-13** progressive-disclosure runtime HI from this packaging spike; wire into the agent loop only after separate confirm.
