---
change: specsync-read-and-specsync-brief-refuse-module-names-that-are-not-a-plain-module-name-and-never-read-a-file-whose-real
artifact: docs
---

# Docs

- `specs/plugins/plugins.spec.md`: new test file in the files list; Public
  API names `MODULE_NAME_RE` / `invalidModuleName`, `refuseRootArg`,
  `readModuleSpec`'s `refused` flag and `readCompanions`'s `error`; a SpecSync
  containment invariant; a behavioral scenario; two error-table rows.
- `specs/plugins/requirements.md` REQ-plugins-008 is updated from the delta
  when the change is materialized.
- No operator docs change: command names, usage and happy-path output are
  unchanged. No CHANGELOG / STATUS / package.json edit (bug-fix slice).
