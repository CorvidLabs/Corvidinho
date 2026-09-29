---
change: persona-one-editable-persona-md-in-corvid-agent-s-voice-loaded-into-the-system-prompt-on-every-turn-and-every-surface
artifact: design
---

# Design

- **Where the file lives.** `persona.md` at the root of Corvidinho's own
  checkout: `CORVIDINHO_ROOT = import.meta.dir/../..` from
  `src/agent/persona.ts`, i.e. the checkout whose `src/cli.ts` is running.
  Bridges, WATCH and the daemon spawn that same bin, so every surface reads
  the same file; a run's project folder (`cwd`, a session worktree, another
  repo) never supplies it. No path override for operators (none was needed);
  `CreateTaskExecuteOpts.personaRoot` is a test seam.
- **How it is read.** `loadPersona(root)` calls
  `loadProjectInstructions(root, { fileNames: ["persona.md"], maxBytes: 8
  KiB, exactRoot: true })`. `exactRoot` skips `findProjectRoot`'s walk up to
  the nearest `.git`, so a parent repo never becomes the persona root. The
  rest is the AGENT-1 loader unchanged: HEAD-committed blob through
  read-only git in a git checkout (working-tree edits not loaded, untracked
  refused), working-tree read otherwise, UTF-8-safe cap with a marker,
  symlink / binary / non-UTF-8 refusal, SAFE-6 scrub, never throws.
- **When.** `createTaskExecute` loads it once per run. Every surface spawns a
  fresh `task run`, so every turn reads it again; verify retries in one run
  share the one load.
- **Prompt order (PERSONA-3).** Tool loop: `PERSONA_HEADER` +
  `<persona file="persona.md">…</persona>`, then "You are Corvidinho…",
  `PERSONA_RULES_SYSTEM_INSTRUCTIONS`, the MEMORY / IDENTITY / public Q&A /
  Discord chat / ask blocks and the finishing rules, then project
  instructions. Read tier: persona block, then the read-tier line and
  `PERSONA_RULES_SYSTEM_INSTRUCTIONS`, then project instructions. The header
  says the persona is tone only (not facts, tools or permissions) and the
  rules win; the rules text says the persona never overrides them. With no
  persona the prompt starts with "You are Corvidinho" and still carries the
  PERSONA-3 rules. A close tag in the file (`</persona`, any case or
  spacing) is escaped so the file cannot end its own block.
- **Notes.** `personaWarning` gives one `Text` event per run (like the
  AGENT-1 note) for a missing, empty, refused, truncated or uncommitted
  file, naming only `persona.md`, never a host path. A clean load adds no
  event, so ordinary event streams are unchanged.
- **Voice (PERSONA-1).** The shipped file uses corvid-agent's composed
  persona shape (`Archetype:`, `Personality traits:`, `Background:`,
  `Communication style:`, `Example messages (match this tone and style):`)
  and the finishing rule asks for "one concise plain-text message … in the
  persona's voice — never a flat changelog (PERSONA-1)" instead of "a
  concise plain-text summary of what you did".
- **Unchanged:** NDJSON protocol, spawn argv and env, the SpecSync briefing
  (user message), tool catalog, roles, verify gate, schema, package
  version. Templated bot posts that never reach the model (announce, status,
  error lines) keep their text.
- **Chosen conservatively (pending Leif):** the voice text itself is drafted
  in corvid-agent's shape (its live persona row was in its SQLite DB and is
  not reachable here); only the committed copy loads, so an edit needs a
  commit / PR, not a hand edit on the VM; no path override env var; PERSONA-3
  is enforced by prompt precedence on top of the existing code gates (the
  bridges' reply handling, DISCORD-6 rate limits, the verify gate), with no
  new code-level message limiter; templated posts are not rewritten in the
  persona voice.
- **Review follow-up (after main's #270).** DISCORD-17 lets the model post a
  file with `discord-send-file`, which is its own Discord message. The
  PERSONA-3 rule (a) now reads "your whole answer is one final reply; never
  split it across several posts or send extra chat messages through tools
  (attaching a file to the conversation when it helps is fine, DISCORD-17)",
  and the attach block sits after the persona like every other rule.
