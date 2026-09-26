---
change: shell-exec-cd-pushd-clamp-skips-options-and-before-taking-the-target-so-cd-p-etc-cd-etc-and-cd-cannot-escape-the
artifact: requirements
---

# Requirements

Serves SAFE-3 (`hi/safe.md`): shell commands cannot `cd` their way out of the project root. Added REQ-plugins-341: the `shell-exec` cd/pushd clamp skips option words and a terminating `--` before taking the target, refuses a lone `-` (OLDPWD), options with no target (home) and words it cannot resolve lexically, and still allows option forms whose target stays under root. REQ-plugins-087 (existing clamp) is unchanged.
