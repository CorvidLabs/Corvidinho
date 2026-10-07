---
change: every-working-day-the-owner-and-each-teammate-get-a-short-briefing-dm-about-their-own-work-in-their-own-hours-and
artifact: docs
---

# Docs

- `docs/discord.md`: `/admin people add` row (the `timezone` / `hours`
  options); "Declared people" names the optional keys; the team role no
  longer says briefings are not built; new "Daily briefings (COS-1 / COS-2 /
  COS-2.a, #102)" section (what it says, that person only, when, once a
  day, the model call and spend caps, DM only, logs); source map line.
- `docs/DISCORD-GO-LIVE.md`: the people keys and a "Daily briefings" bullet
  (what is needed: a model, the running bridge, open DMs, GitHub ids).
- `docs/DAEMON.md`: the daemon does not send briefings.
- `README.md`: "Daily briefings" section.
- `allowlist.example.toml`: commented `timezone` / `working_hours` on the
  example person, with the defaults.
- `STATUS.md`: the HI row counts the new COS family.
- `AGENTS.md`: the `hi/*.md` family list names `cos` (the docs test requires every hi/ file there).
- `hi/cos.md` (new, captured with `hi`) and `INTENT.md` (index regenerated
  by `hi`).
- No CHANGELOG / package.json edit (the release PR writes them).
