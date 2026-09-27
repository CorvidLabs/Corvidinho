---
id: specsync-read-and-specsync-brief-refuse-module-names-that-are-not-a-plain-module-name-and-never-read-a-file-whose-real
state: approved
type: bug_fix
base_commit: 642a843e0dee50df6cb9376f9e772dd28688ca2f
---

# Specsync-read and specsync-brief refuse module names that are not a plain module name and never read a file whose real path is outside the project specs dir; coverage, change-list and ship-status refuse --root

## Intent

specsync-read and specsync-brief refuse module names that are not a plain module name and never read a file whose real path is outside the project specs dir; coverage, change-list and ship-status refuse --root

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- specsync-read and specsync-brief accept only a plain module name (letters, digits, _ or -, the registry form; the optional name= prefix stays) and refuse with exit 1 and a clean one-line error, reading nothing, an absolute path, a .. segment, a path separator, a NUL byte or any other character. Every file they read (module spec, legacy flat spec, companions) must realpath inside the real project specs dir, which must itself realpath inside the project root, so a symlinked specs dir, module dir, spec file or companion that points outside the project is refused and its content is never returned (companions: the whole brief refuses). specsync-coverage, specsync-change-list and specsync-ship-status refuse a forwarded --root or --root=VALUE (exit 1, specsync not spawned) so they cannot report on another directory; specsync-list and specsync-check take no path input and are unchanged. Registered modules still read and brief as before. Regression tests for each vector (traversal, absolute, separator, NUL, symlink escape of spec, module dir, companion and specs dir, --root) fail on main and pass with the fix; tsc --noEmit and bun test green.

## No-spec Rationale

Not applicable
