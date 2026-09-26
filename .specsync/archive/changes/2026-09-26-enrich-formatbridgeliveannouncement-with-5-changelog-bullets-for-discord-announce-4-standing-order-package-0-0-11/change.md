---
id: enrich-formatbridgeliveannouncement-with-5-changelog-bullets-for-discord-announce-4-standing-order-package-0-0-11
state: archived
type: feature
base_commit: 8747a9abb99c2322ea67c40da96fb60bc69172bc
---

# Enrich formatBridgeLiveAnnouncement with ≤5 CHANGELOG bullets for DISCORD-ANNOUNCE-4 standing order; package 0.0.11

## Intent

Enrich formatBridgeLiveAnnouncement with ≤5 CHANGELOG bullets for DISCORD-ANNOUNCE-4 standing order; package 0.0.11

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- formatBridgeLiveAnnouncement returns version header plus ≤5 CHANGELOG bullets for the package version; falls back to package description or tip when CHANGELOG missing; posts still only via postAnnouncement to configured announce channel; package 0.0.11; fixture tests + fledge verify green

## No-spec Rationale

Not applicable
