---
id: planning-picks-spec-modules-from-the-request-not-the-bridge-wrapper-and-the-briefing-fence-and-cap-are-hardened
state: archived
type: bug_fix
base_commit: 984332fba8490435d9d3da4fcdb29a10e42d857e
---

# Planning picks spec modules from the request not the bridge wrapper, and the briefing fence and cap are hardened

## Intent

Planning picks spec modules from the request not the bridge wrapper, and the briefing fence and cap are hardened

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- A Discord chat whose request names no module gets no SpecSync briefing even though the identity and memory blocks say Discord, and a WATCH run whose header says WATCH gets no watch briefing; a request that names a module still gets its briefing; a spaced close tag such as </ specsync-briefing > in a spec cannot end the fence; the 8000-char cap never leaves half a surrogate pair

## No-spec Rationale

Not applicable
