/**
 * MEMORY SQLite + ACL (MEMORY-1..7 / MEMORY-ACL-1..6).
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
  memorySubjectForRef,
  personScopeId,
  projectKeyFor,
  projectScopeFor,
  projectScopeId,
  sameSubject,
  subjectLabel,
  type LoadedPeople,
  type MemorySubject,
} from "./scope.ts";
export {
  PROFILE_SECTION_LIMIT,
  buildMemoryProfile,
  formatMemoryProfile,
  type MemoryProfile,
} from "./profile.ts";
export {
  FORGET_REQUEST_TTL_MS,
  ForgetRequestStore,
  forgetMemoryTargets,
  forgetTargets,
  type ForgetRequest,
  type ForgetRequestStatus,
} from "./forget.ts";
