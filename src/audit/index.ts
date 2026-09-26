/**
 * SAFE-5 tamper-evident audit trail (src/audit/).
 */
export {
  appendAudit,
  argsDigest,
  auditContextFromEnv,
  auditKeyFromEnv,
  formatAuditLine,
  verifyAudit,
  type AuditEntryInput,
  type AuditOutcome,
  type AuditVerify,
} from "./log.ts";
