---
change: allowlist-loader-expands-a-leading-in-corvidinho-allowlist-file-to-home-so-the-documented-env-example-no-longer
artifact: design
---

# Design

One change in `resolveAllowlistPath` (`src/allowlist/load.ts`): after trimming
the explicit value, `~` returns `home` and `~/rest` returns `join(home, rest)`;
anything else (`~user…`, absolute, relative, a `~` later in the path) is
returned as before. `home` is the parameter every caller already passes for
the default path, so the explicit `~/…` value and the default path agree.

No other module changes: the loader, owner loader, `/admin` writer and doctor
all call the resolver. The existing "exists ⇒ read (fail closed on parse
errors); missing ⇒ env overlays only" logic is untouched, so a broken file
behind `~/` now fails closed like any other path, and a missing one stays
env-only (REQ-plugins-253's test preload depends on that).

`.env.example` gains one comment line saying how `~` is read. The plugins spec
Public API notes the resolver's behaviour and lists the new test file.
