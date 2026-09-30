/**
 * MEMORY SQLite + ACL (MEMORY-1..9 / MEMORY-ACL-1..6).
 */

export {
  MEMORY_CATEGORIES,
  MEMORY_CATEGORY_LIST,
  HISTORY_CATEGORIES,
  PRIVATE_NOTE_CATEGORY,
  MEMORY_ACL_DENIED,
  isMemoryCategory,
  MemoryAclError,
  MemoryNotFoundError,
  MemoryValidationError,
  type MemoryCategory,
  type MemoryRecord,
} from "./types.ts";
export {
  MemoryStore,
  type MemoryStoreOptions,
  type StoreMemoryInput,
  type RecallMemoryInput,
  type ForgetMemoryInput,
  type OverrideMemoryInput,
} from "./store.ts";
export {
  CONFIRM_TOKEN_TTL_MS,
  checkConfirmToken,
  currentConfirmTurn,
  extractConfirmTokens,
  isHumanSuppliedToken,
  issueConfirmToken,
  setConfirmTurnForTests,
  type ConfirmBinding,
  type ConfirmCheck,
  type ConfirmOp,
} from "./confirm.ts";
export {
  PERSON_SCOPE_PREFIX,
  PROJECT_SCOPE_PREFIX,
  isProjectScopeId,
  linkedDiscordIds,
  loadPeopleForMemory,
  memorySubjectFor,
  memorySubjectForGithub,
  memorySubjectForPerson,
  memorySubjectForRef,
  personScopeId,
  projectKeyFor,
  projectScopeFor,
  projectScopeForRepo,
  projectScopeId,
  sameSubject,
  subjectLabel,
  type LoadedPeople,
  type MemorySubject,
} from "./scope.ts";
export {
  RECALL_CANDIDATE_LIMIT,
  RECALL_MAX_TERMS,
  RECALL_RECENCY_HALF_LIFE_MS,
  RECALL_STOPWORDS,
  rankMemories,
  recallRelevantThenRecent,
  recallTerms,
  type RankedMemory,
} from "./rank.ts";
export {
  PROFILE_SECTION_LIMIT,
  buildMemoryProfile,
  formatMemoryProfile,
  type MemoryProfile,
} from "./profile.ts";
export {
  FORGET_REQUEST_TTL_MS,
  ForgetRequestStore,
  encodeForgetRequester,
  encodeGithubOrigin,
  forgetMemoryTargets,
  forgetRequesterActor,
  forgetTargets,
  githubOriginOf,
  parseForgetRequester,
  previewForgetTargets,
  type ForgetCounts,
  type ForgetGithubThread,
  type ForgetRequest,
  type ForgetRequester,
  type ForgetRequestStatus,
} from "./forget.ts";
