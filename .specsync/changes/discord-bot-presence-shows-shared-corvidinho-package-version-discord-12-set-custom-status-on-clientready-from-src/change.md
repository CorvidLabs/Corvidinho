---
id: discord-bot-presence-shows-shared-corvidinho-package-version-discord-12-set-custom-status-on-clientready-from-src
state: implementing
type: feature
base_commit: 186620b64e25a2cf6bb41d460c6ddecf20bec240
---

# Discord bot presence shows shared Corvidinho package version (DISCORD-12): set Custom Status on ClientReady from src/version.ts; short string e.g. v0.0.3; fixture test; STATUS note; no slash/allowlist churn

## Intent

Discord bot presence shows shared Corvidinho package version (DISCORD-12): set Custom Status on ClientReady from src/version.ts; short string e.g. v0.0.3; fixture test; STATUS note; no slash/allowlist churn

## Affected Canonical Specs

- `discord`
- `cli`

## Acceptance Criteria

- On ClientReady (and after restart), Discord presence/custom status shows short version string from shared src/version.ts/package.json (e.g. v0.0.3); prefer ActivityType.Custom; fixture test covers presence payload without live token; slash registration and allowlists unchanged; STATUS notes DISCORD-12; SpecSync+fledge verify green

## No-spec Rationale

Not applicable
