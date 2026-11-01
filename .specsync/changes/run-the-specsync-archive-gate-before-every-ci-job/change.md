---
id: run-the-specsync-archive-gate-before-every-ci-job
state: approved
type: operations
base_commit: 49273ff4a95fafcad87cde66492e3a8dd2c6c3f4
---

# Run the SpecSync archive gate before every CI job

## Intent

Run the SpecSync archive gate before every CI job

## Affected Canonical Specs

- None

## Acceptance Criteria

- ci.yml and spec-sync.yml each start with a job named Archive that runs the archive gate through CorvidLabs/spec-sync pinned at 106aaa43d0bcf049f19b173ddb63815a25c3f931 with archive-gate-only, and every other job in those workflows needs it, so a pull request with an open SpecSync change runs nothing else until the change is archived

## No-spec Rationale

CI workflow ordering only; no canonical spec owns .github/workflows
