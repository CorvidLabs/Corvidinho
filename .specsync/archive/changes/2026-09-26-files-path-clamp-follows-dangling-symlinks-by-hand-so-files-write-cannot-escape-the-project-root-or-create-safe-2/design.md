---
change: files-path-clamp-follows-dangling-symlinks-by-hand-so-files-write-cannot-escape-the-project-root-or-create-safe-2
artifact: design
---

# Design

- The walk-up loop uses `lstat` existence (`entryExists`) instead of `existsSync`, so it stops at a dangling link instead of walking past it.
- When the stop point exists by `lstat` but not by `stat`, it is a dangling or looping link. The clamp resolves the link's parent with `realpath` and its text with `readlink`, re-attaches any remaining path segments, and refuses the path if either the link's own directory or the target is outside the root. Otherwise it re-runs the same clamp on the target (`clampUnderRoot`, recursive).
- Hops are capped at 40 (Linux SYMLOOP_MAX). Past that the clamp throws `PathEscapeError` "Symlink loop denied". A link that cannot be read throws "Symlink escape denied".
- The returned path is the resolved target, as for existing links. `refuseProtected` therefore sees the path the write would create (for example `<root>/.env`), and the write goes to that checked path rather than through the link.
- No API, env, or command surface changes. Error type stays `PathEscapeError` (exit 1). The SAFE-2 refusal stays exit 2.
