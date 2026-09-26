/**
 * WATCH ingress types — GitHub mention/review → session stub (#19).
 */

export const NOT_AUTHORIZED = "not authorized";

export type DetectedEventType =
  | "issue_comment"
  | "issues"
  | "review_request"
  | "pull_request_review_comment";

export type DetectedEvent = {
  /** Unique id for dedup (e.g. comment-123, reviewreq-owner/repo#8). */
  id: string;
  type: DetectedEventType;
  body: string;
  sender: string;
  repo: string; // OWNER/REPO
  number: number;
  title: string;
  htmlUrl: string;
  createdAt: string;
  isPullRequest: boolean;
};

export type SessionStub = {
  id: string;
  repo: string;
  number: number;
  userId: string;
  topic?: string;
  createdAt: number;
  lastActivityAt: number;
};

export type RouteAction =
  | { kind: "start_session"; session: SessionStub; prompt: string; event: DetectedEvent }
  | { kind: "continue_session"; session: SessionStub; prompt: string; event: DetectedEvent }
  | { kind: "refuse"; reason: string; reply?: string; event: DetectedEvent }
  | { kind: "ignore"; reason: string; event?: DetectedEvent };

export type AgentSpawnResult = {
  ok: boolean;
  sessionId: string;
  summary: string;
  exitCode: number;
};

export type WatchConfig = {
  token: string;
  /** GitHub login we listen for (@mentions / review requests). */
  mentionUsername: string;
  /** Explicit repos to poll (from allowlist expansion). */
  repos: string[];
  allowlist: import("../allowlist/types.ts").AllowlistConfig;
  intervalMs: number;
  /** Max new triggers per poll cycle. */
  maxTriggersPerCycle: number;
  dryRun: boolean;
  projectRoot: string;
  corvidinhoBin: string;
};
