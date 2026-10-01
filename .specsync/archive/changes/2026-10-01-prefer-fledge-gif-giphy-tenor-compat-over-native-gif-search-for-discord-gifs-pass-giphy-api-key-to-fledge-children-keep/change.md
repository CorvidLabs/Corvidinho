---
id: prefer-fledge-gif-giphy-tenor-compat-over-native-gif-search-for-discord-gifs-pass-giphy-api-key-to-fledge-children-keep
state: accepted
type: feature
base_commit: 3f760e0b5bb1722b885ab8a4ea40fe1ada9f1829
---

# Prefer fledge-gif (GIPHY Tenor-compat) over native gif-search for Discord GIFs; pass GIPHY_API_KEY to Fledge children; keep gif-search secondary

## Intent

prefer fledge-gif (GIPHY Tenor-compat) over native gif-search for Discord GIFs; pass GIPHY_API_KEY to Fledge children; keep gif-search secondary

## Affected Canonical Specs

- `plugins`
- `agent`
- `discord`
- `cli`

## Acceptance Criteria

- fledge gif search without GIPHY_API_KEY prints not-configured (no hardcoded Tenor key); with the key set, fledgeChildEnv passes GIPHY_API_KEY through so discovered fledge-gif can search while workers and verify still drop it; gif-search stays registered with a Secondary / Prefer fledge-gif description; docs/DISCORD-GO-LIVE.md E.3.b prefers fledge-gif and keeps gif-search as secondary without removing #331; allowlisting fledge-gif at CORVIDINHO_LLM_TIER=code offers the preferred tool and the persona tip prefers fledge-gif for Discord GIF asks.

## No-spec Rationale

Owner already chose prefer fledge-plugin-gif over GIPHY gif-search; Tenor API shutdown forces GIPHY Tenor-compat behind the Fledge CLI. No new PLUGIN HI — wiring, docs, and env pass-through only; gif-search stays for team/tool-tier (#331).
