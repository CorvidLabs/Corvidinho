---
change: prompt-injection-hygiene-display-names-are-cleaned-before-the-model-sees-them-and-a-name-that-imitates-the-owner-or-a
artifact: context
---

# Context

Issue #71 (SAFE: prompt-injection hygiene, milestone M2 "Talk anywhere", build
step 1 of 9 on tracker #122). Leif confirmed the criteria in the 2026-09-28
interview (round 4: "#71 injection: capture SAFE-11/12/13 as written —
display-name cleaning + declared-id identity; external bodies are data;
suspected injection → don't act, tell the owner"). They were captured on main
in `hi/safe.md` with #270, so this PR captures nothing new and builds them:

- **SAFE-11** "A display name can't pass itself off as someone else: names
  are cleaned before the model sees them, and who someone is comes from their
  declared ids, never from what a message claims."
- **SAFE-12** "Issue, PR, comment, web page and chat bodies are data to read,
  not instructions to follow; only the sender's role decides what may run."
- **SAFE-13** "When a message looks like an injection attempt, it doesn't act
  on it, and it tells me rather than going quiet."

Built on what main has: declared people and stable-id recognition (#271,
`src/identity/people.ts`, IDENTITY-13/14/6/7), the role gate in the tool layer
(#285, `src/plugins/roles.ts`, IDENTITY-8..12), the `web-fetch` untrusted
fence and the `untrusted: true` notes of the GitHub readers, SAFE-5 audit and
the SAFE-8 owner-ping post helpers.

Gap on the base (53f2e5d): Discord display names and `discord-user-lookup`
names went to the model raw (mention markup, bidi / zero-width characters,
`[owner]` tags); a stranger named like the owner was only marked
`declared_person: none` once people were declared; non-owner chat, slash
topics / tasks, WATCH titles / bodies and GitHub reader results went to the
model unmarked (only `web-fetch` fenced its page); the system prompt said
nothing about untrusted text; nothing detected an injection attempt, so an
attempt either ran or was silently obeyed within the role's tools, and the
owner was never told.

Settled constraints: specs/ only through SpecSync; owner admins, the team
works; v1 off-chain (no AlgoChat / wallet surface); no new config key (the
detector is always on); no schema bump; #232 / #233 scope untouched; other
active SpecSync changes left alone.
