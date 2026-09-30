---
change: updater-changelog-extraction-stays-linear-on-a-large-utf-8-section-the-release-notes-check-no-longer-takes-seconds
artifact: tasks
---

# Tasks

- [x] Replace the `${out// }` emptiness check with the equivalent linear regex `[[ "$out" =~ [^\ ] ]]`: true when the section has any character other than a space, as before.
- [x] Add a regression test: a 400 KB multibyte section under `LC_ALL=C.UTF-8` extracts in under 2 s.
- [x] Prove the test fails with the old helper (it times out at 5 s) and passes with the fix.
