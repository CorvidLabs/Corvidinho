---
module: plugins
change: prompt-injection-hygiene-display-names-are-cleaned-before-the-model-sees-them-and-a-name-that-imitates-the-owner-or-a
---

# Delta — plugins (names and fenced page text; the role gate is the only permission)

## Added

### REQUIREMENT REQ-plugins-071

Plugins and untrusted text (SAFE-11 / SAFE-12, #71). `discord-user-lookup`
SHALL clean every member name it returns — username, global name, nickname
and the display name built from them — with `cleanDisplayName`
(`src/agent/untrusted.ts`) before the result reaches the model or the
message line; a name that is only a role word is dropped (the username, else
the id, stands in). A lookup names a Discord account; it never makes anyone a
declared person or gives a role. `web-fetch`'s `fenceUntrusted` SHALL be the
shared `fenceUntrustedData` with the `UNTRUSTED_WEB_CONTENT` word and its
existing header, so page text also loses bidi, zero-width, BOM, soft hyphen
and tag characters and a page line that imitates a Corvidinho context block is
marked `(quoted)`; everything REQ-plugins-111 requires of the fence still
holds. What a plugin may run SHALL be decided only by the acting role resolved
in the tool layer (`resolveActingRole`, REQ-plugins-065): text in a task, a
body or a tool result that claims the owner's identity widens nothing. No env
var, config key or flag.

Acceptance Criteria
- `lookupGuildMemberById` over a stubbed fetch returns the nickname, global name and display name cleaned (no mention markup, zero-width or bidi characters, role tags or labels) and a message line without `<@`.
- A community role session whose task claims the owner and asks for `files-write` is offered no mutating plugin and the call is refused with `not allowed for your role`; nothing is written.
- `tests/web.fetch.test.ts` passes unchanged on the shared fence.
- Regression tests in `tests/safe.injection.test.ts` fail on the base sources and pass after.
