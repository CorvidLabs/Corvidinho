---
change: files-edit-single-occurrence-replace-writes-new-literally-so-dollar-replacement-patterns-cannot-corrupt-the-file
artifact: context
---

# Context

A bug sweep (plugins-exec-5) found that `files-edit` without `--replace-all` called `original.replace(oldStr, newStr)` with the model-supplied `--new` string as the replacement. JavaScript expands replacement patterns in that argument (`$$` becomes `$`, `$&` the match, `$'` the text after the match, `` $` `` the text before the match), so an edit to a Makefile, shell script or JS/regex source containing `$$` or `$'` wrote different bytes than requested while the tool still reported `Edited <path>`. The `--replace-all` path (split/join) was already literal, so the two modes disagreed.

Repro before the fix: `Makefile` = `run:\n\techo OLD\n`; `files-edit Makefile --old "echo OLD" --new "echo $$HOME and $' tail"` returned ok and wrote `run:\n\techo $HOME and \n tail\n`.
