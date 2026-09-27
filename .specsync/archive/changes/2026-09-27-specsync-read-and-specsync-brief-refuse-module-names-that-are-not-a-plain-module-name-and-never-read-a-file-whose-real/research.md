---
change: specsync-read-and-specsync-brief-refuse-module-names-that-are-not-a-plain-module-name-and-never-read-a-file-whose-real
artifact: research
---

# Research

- Repro on `origin/main` 642a843 (this box): `specsync read ../../../..$T/outside`
  printed the outside file with a "spec at flat path" warning; `specsync brief
  ../../../..$T` returned `# Companion: ../../../..$T/other.md` and
  `.../outside.md` bodies; `plugins run files-read -- ../../../..$T/outside.md`
  refused with "Path traversal denied".
- `specsync` 6.0.0 help: `--root <ROOT>` is accepted by `coverage`, `change
  list` and `change ship-status`; `specsync coverage --root <outproj>` and
  `--root=<outproj>` both reported the outside project's `src/hidden.ts`.
  Clap does not infer prefixes (`--roo`, `--ro=` error), and `-- --root` makes
  it a positional (error), so exact `--root` / `--root=` match is sufficient.
  `specsync change ship-status ../../../../tmp` already fails with `invalid
  change ID`.
- Callers of the read helpers: `plugins/specsync/commands.ts` (read, brief)
  and `src/agent/specLoader.ts` (planning), which only passes registry names
  (`[A-Za-z0-9_-]+`) and treats a failed read as "skip".
- Reusable containment: `isInsideRoot` from `plugins/files/resolvePath.ts`
  (already shared by the search and git plugins).
