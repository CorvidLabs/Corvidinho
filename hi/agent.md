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
- **AGENT-2**  Before it writes code, it loads the relevant specs so the work is constrained by what we already agreed, not by vibes.
- **AGENT-3**  It runs a tool loop I can interrupt, and when I interrupt it, it actually stops instead of finishing in the background.
- **AGENT-4**  It does not tell me the job is done until the project’s verify lane has passed, or it tells me plainly that verification failed.
  - **AGENT-4.a**  If verification fails and retries remain, it keeps working with the failure output instead of shrugging.
- **AGENT-5**  I can pick a provider and a capability tier so cheap models stay on read-shaped work and expensive ones are used when tools and code are required.
- **AGENT-6**  I can leave a session and come back to it later without losing the thread.
- **AGENT-7**  It remembers the small durable facts I asked it to keep for this project, without needing a blockchain to do so.
- **AGENT-8**  While it works I can see what state it is in — planning, calling a tool, verifying, or done — so bridges and the CLI are not guessing.
