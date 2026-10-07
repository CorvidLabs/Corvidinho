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
  MEMORY_CARD_CLASS,
  MEMORY_CARD_KIND,
  MEMORY_CARD_NOTHING_DONE,
  MEMORY_CARD_POLL_MS,
  MEMORY_CARD_TTL_MS,
  askMemoryCard,
  memoryCardFields,
  setMemoryCardTestHooks,
  type MemoryCardAnswer,
  type MemoryCardFields,
  type MemoryCardOp,
  type MemoryCardTestHooks,
} from "./card.ts";
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
