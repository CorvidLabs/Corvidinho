---
change: web-fetch-htmltotext-strips-tags-to-a-capped-fixpoint-so-split-tags-cannot-reassemble-codeql-incomplete-multi-character
artifact: context
---

# Context

CodeQL (js/incomplete-multi-character-sanitization) flagged `htmlToText` on #148: one `replace(/<[^<>]*>/g, "")` pass lets split tags such as `<<b>script>` reassemble. Output is plain text for the model, but the sanitizer should be complete.
