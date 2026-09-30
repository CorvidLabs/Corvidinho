/**
 * SESSION-WORKTREE — per-talk/project git worktree isolation.
 */

export {
  getWorktreeBaseDir,
  generateTalkBranchName,
  talkWorktreeId,
  resolveProjectDir,
  isGitRepo,
  pruneWorktrees,
  createWorktree,
  removeWorktree,
  parkWorktree,
  ensureTalkWorkspace,
  branchExists,
  cleanStaleWorktreeState,
  deleteBranch,
  forceRemoveWorktree,
  type WorktreeState,
  type CreateWorktreeOptions,
  type CreateWorktreeResult,
  type RemoveWorktreeOptions,
  type EnsureTalkWorkspaceOptions,
  type TalkWorkspace,
  type ResolveProjectOptions,
} from "./manager.ts";
export {
  resolveBase,
  settleTalkVerified,
  takeTalkVerified,
  talkWorktreeGitDir,
  TALK_VERIFIED_MARKER,
  type GitIn,
} from "./base.ts";
