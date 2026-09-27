---
change: safe-2-file-tools-refuse-any-keystore-file-or-directory-inside-the-project-and-specsync-s-specsync-config-registry-and
artifact: docs
---

# Docs

- `specs/plugins/requirements.md`: REQ-plugins-083 text and acceptance criteria match the delta.
- `specs/plugins/plugins.spec.md`: the SAFE-2 protected list in Invariants now names `.specsync/` state (outside `.specsync/changes/`) and keystore files or directories instead of "keystore basenames".
- The refusal message (`protectedRefuseMessage`) lists `.specsync`.
- No operator doc named the old basename-only rule; no CHANGELOG/STATUS edit (bug-fix slice, no version section).
