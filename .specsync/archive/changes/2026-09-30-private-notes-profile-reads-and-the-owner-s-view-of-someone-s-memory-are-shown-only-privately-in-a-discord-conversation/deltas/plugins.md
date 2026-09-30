---
module: plugins
change: private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation
---

# Delta — plugins (private reads shown only privately)

## Added

### REQUIREMENT REQ-plugins-710

Private notes, profile reads and the owner's view of someone's memory are
shown only privately (MEMORY-7.a, #101). A private read is
`memory-recall --category private` (the acting person's own, or the owner's
`--person`), the owner's `memory-recall --person <someone else>` view and
`memory-profile` (own or the owner's `--person`). Where it may be shown
SHALL be decided at the call from the bridge-set env only: a GitHub run
(`CORVIDINHO_ACTING_GITHUB_*` with no Discord actor) has no private place;
no role session (`CORVIDINHO_ACTING_IS_ADMIN` unset: the local CLI) is the
operator's own terminal; a role session with the bridge's reply channel set
(`CORVIDINHO_DISCORD_REPLY_CHANNEL_ID`: chat, a button pick or Answer form
resume, `/session start`, `/work`) is a Discord conversation; any other
role session (a schedule) has no private place.

In a Discord conversation a private read SHALL return `ok: true` with its
human-readable text only in the result's `privateText` (private notes and
the owner's view as a heading plus one line per row — category, key, content
up to 500 characters, id; a profile as `formatMemoryProfile`, private notes
counted only), `data` exactly `{ sentPrivately: true, what }` (`what`:
`private-notes` | `person-view` | `profile`) and `message` exactly
`SENT_PRIVATELY_MESSAGE`, so nothing the tool loop gives the model holds
it. Where there is no private place (a schedule or other run with no
conversation, a GitHub thread) the owner's `--person` view and
`memory-profile` SHALL be refused (exit 2, naming MEMORY-7.a, no content);
private notes keep their existing refusals there. The local CLI SHALL show
them as before (no `privateText`). Everything else is unchanged: the acting
person's own non-private recall, `--project`, the ACL (`--person`
owner-only, opaque refusal), and the refusals of REQ-plugins-067 /
REQ-plugins-101. This narrows REQ-plugins-067 (a declared GitHub commenter's
`memory-profile` is now refused: a GitHub thread is public) and
REQ-plugins-101 (private notes and the owner's view in a conversation are
returned privately, not to the model); every other rule of both stands.

`PluginHandlerResult.privateText` (`src/plugins/types.ts`) SHALL be kept
off `data` and `message`. The `memory-recall` and `memory-profile`
descriptions SHALL tell the model that these reads go to the person who asked
by direct message, that it gets only a "sent privately" result, and to tell
them to check their DMs; `memory-profile` SHALL say it is refused on GitHub
and in schedules.

Acceptance Criteria
- In a Discord-conversation env, own private notes, own profile, the owner's `--person` recall (by id or Discord id), the owner's `--person` private notes and `--person` profile each return the content only in `privateText`, with `data` = `{ sentPrivately: true, what }` and the placeholder `message`; the person's own non-private recall still returns rows.
- In a schedule env the owner's `--person` view and profile and a person's own profile are refused (MEMORY-7.a) with no content; in a GitHub env a declared commenter's `memory-profile` is refused with no content, while their everyday recall still works.
- With no role session (the local CLI) a profile is shown inline with no `privateText`.
- `tests/memory.private-view.test.ts` covers each and fails on main; `tests/memory.profiles.test.ts` and `tests/memory.recall-github.test.ts` are updated to the private delivery.
