---
change: gif-search-through-giphy-plugin-8-plugin-9-issue-318-slice-b-a-dangerous-mintier-1-gif-search-command-in-a-new-plugins
artifact: research
---

# Research

Sources read on 2026-09-30: developers.giphy.com (API endpoint docs, optional
settings, the Tenor migration guide), the #318 orc comment, and the
read-only clones of `CorvidLabs/corvid-agent` and
`corvid-agent/fledge-plugin-gif`.

- **Tenor is gone.** It stopped new keys and integrations on 2026-01-13 and
  every API agreement ended on 2026-06-30 (Google support, cited on #318).
  fledge-plugin-gif calls Tenor v2 and ships a hardcoded Google API key in a
  public repo; the key was not copied, quoted or used here, and the docs tell
  the operator the plugin is not a working path.
- **GIPHY native search:** `GET https://api.giphy.com/v1/gifs/search` with
  `api_key`, `q` (up to 50 characters), `limit` (default 25, beta max 50),
  `offset`, `rating` (`g`, `pg`, `pg-13`, `r`; every rating when unset),
  `lang`, `bundle`; results in `data[]` with `images.*` renditions. The
  docs do not say whether `rating=pg` also returns G.
- **GIPHY Tenor-compatible search (chosen):** `GET
  https://api.giphy.com/v2/search` with `key`, `q`, `client_key`
  (recommended), `limit` (default 20, max 50), `pos`, `contentfilter`
  (default `off`), `media_filter`, `country`, `locale`; the docs give the
  mapping "off - G, PG, PG-13, R; low - G, PG, PG-13; medium - G, PG; high -
  G". Results are `results[]` with `title`, `content_description`,
  `content_rating`, `url` / `itemurl` (the GIPHY page) and
  `media_formats.{gif,tinygif,…}.url`; known errors can come back as HTTP 200
  with an `error` field. Chosen because PLUGIN-8's "safety filter at
  medium" is `contentfilter=medium` word for word, with a documented G and
  PG meaning; `limit` 1-10 and `media_filter=gif,tinygif` follow the #318
  brief.
- **Media hosts:** GIPHY serves media from `media.giphy.com`,
  `media0.giphy.com` to `media4.giphy.com` and `i.giphy.com`; links are
  validated against that exact list (no suffix match).
- **Terms and limits:** GIPHY's standard terms forbid caching or re-hosting
  media and require "Powered By GIPHY"; posting a GIPHY link, which Discord
  unfurls from GIPHY, is the compliant shape (no download, no attachment). A
  new key is a beta key limited to 100 calls an hour; the API is free-tier,
  so a search is recorded at $0 against the SAFE-8 cap.
- **Key placement:** both GIPHY APIs take the key as a URL query parameter
  (no header), so the request URL itself is secret: never returned, shown,
  logged or audited, and scrubbed by name if anything echoes it.
- **corvid-agent:** has no GIF or image search (only attachment handling);
  its web-search gaps (silent `[]` without a key, unfenced results,
  swallowed errors, unchecked counts) are not repeated here either.
