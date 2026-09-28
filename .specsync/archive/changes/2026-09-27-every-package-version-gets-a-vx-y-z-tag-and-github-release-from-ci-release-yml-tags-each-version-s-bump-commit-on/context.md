---
change: every-package-version-gets-a-vx-y-z-tag-and-github-release-from-ci-release-yml-tags-each-version-s-bump-commit-on
artifact: context
---

# Context

Twelve package versions had no tag and no GitHub Release: 0.0.12, 0.0.13, 0.0.16, 0.0.18,
0.0.21 and 0.0.23–0.0.29. The old `release.yml` only ran on a hand-pushed `v*` tag, and agent
sessions cannot push tags: the session git proxy answers 403, which is an org policy, not a
fault to work around. Leif asked for tagging to be sure ("make sure ur tagging!!").

The fix tags from CI with `GITHUB_TOKEN`. A tag pushed that way starts no other workflow run,
so the same job creates the Release. Existing remote tags match each version's bump commit,
except v0.0.9, which sits 4 commits after its bump (#140). The workflow never moves an
existing tag, so it only warns about v0.0.9.
