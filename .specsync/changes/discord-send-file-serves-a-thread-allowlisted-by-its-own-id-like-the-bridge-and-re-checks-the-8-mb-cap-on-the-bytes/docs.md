---
change: discord-send-file-serves-a-thread-allowlisted-by-its-own-id-like-the-bridge-and-re-checks-the-8-mb-cap-on-the-bytes
artifact: docs
---

# Docs

- `docs/discord.md` (Files and images in replies): the gate bullet says a
  thread passes when it or its parent is listed, unless either is deny-listed
  (it said "a thread through its parent"); the 8 MB bullet says the cap is
  checked on the bytes read.
- `docs/DISCORD-GO-LIVE.md` step 4: the bot invite lists **Attach Files**
  (uploads need it, `discord-send-file`).
- `specs/discord/discord.spec.md`: Invariants and Error Cases wording;
  `specs/discord/testing.md`: the new tests.
