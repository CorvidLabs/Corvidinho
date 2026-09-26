---
change: cover-watch-mentions-fixture-for-watch-reliability-tests
artifact: context
---

# Context

The watch-reliability implementation adds and exercises `tests/fixtures/watch/mentions.json`.
SpecSync treats the fixture as a meaningful `tests/` path, but it is test data rather than
canonical product behavior. The existing active watch change already covers the behavior;
this small no-spec-change bug-fix change supplies the missing path coverage.
