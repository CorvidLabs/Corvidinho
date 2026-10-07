---
change: named-personas-are-their-own-files-in-personas-with-name-model-and-skill-tags-the-owner-can-run-a-task-as-one-and-a
artifact: research
---

# Research

- `persona.md` is protected by the loader, not by a file-tool refusal: in a git checkout
  only the committed copy loads, so a non-dangerous file tool cannot plant a persona; a
  commit needs the consented `git-commit`. Named persona files reuse that loader as is
  (`loadProjectInstructions(root, { fileNames, exactRoot: true })`); the only new piece is
  listing the folder (`listInstructionDir`: HEAD's tree plus the working tree, so an
  untracked file is reported as not committed instead of silently missing).
- Model selection: every model call goes through `modelChain(env, tier)` /
  `loadLlmEnv(env, tier)` and the spend guard's `env`, all from `createTaskExecute`'s
  `env`. Putting the persona's model at the head of the run tier's key in that env (not
  `process.env`) gives fallback, notices and spend per model with no new path, and a
  delegate worker of a persona run still inherits the owner's real config.
- `delegate` already passes internal facts to its worker only through spawn env set or
  deleted on every spawn and read only at depth > 0 (`CORVIDINHO_DELEGATE_AUTHORS`);
  the persona pick follows the same pattern.
- `/session start` has optional `project`; an optional `persona` option is the smallest
  Discord surface (no new command). `task run` had no option that names a persona, so
  `--persona` is added.
