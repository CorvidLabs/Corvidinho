---
change: updater-changelog-extraction-stays-linear-on-a-large-utf-8-section-the-release-notes-check-no-longer-takes-seconds
artifact: context
---

# Context

The v0.0.34 release PR (#298) failed CI's smoke job: `update-helpers.sh > extract_changelog_section finds 0.0.34` timed out after 5000 ms. The 0.0.34 CHANGELOG section is 68 KB, the first over 64 KB. On the runner the smaller 0.0.29–0.0.33 sections already took 130–620 ms. That is not a flake: the time grows with the square of the section size.

Root cause: `extract_changelog_section` in `scripts/lib/update-helpers.sh` checked emptiness with `[[ -n "${out// }" ]]`. Bash's pattern substitution is quadratic, and far slower in a UTF-8 locale. Measured locally with bash 5.2.21 on the 68 KB section: 15 ms under `LC_ALL=C` and 7040 ms under `LC_ALL=C.UTF-8`. CI runners and systemd boxes use a UTF-8 locale, so the updater's release-notes step on a box was slow too.
