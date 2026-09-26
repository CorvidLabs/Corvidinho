/**
 * IDENTITY — durable owner record (IDENTITY-1 / IDENTITY-3 owner path).
 */

export {
  OWNER_DISPLAY_MAX,
  OWNER_ENV,
  formatOwnerDoctorDetail,
  formatOwnerStatus,
  getOwner,
  isOwnerDiscord,
  isOwnerGithub,
  loadOwnerConfig,
  normalizeDisplay,
  normalizeGithubLogin,
  ownerFieldsFromEnv,
  ownerFieldsFromJson,
  parseOwnerToml,
  readOwnerFile,
  resolveOwner,
  type LoadOwnerOptions,
  type OwnerFields,
  type OwnerLoadResult,
  type OwnerRecord,
} from "./owner.ts";
