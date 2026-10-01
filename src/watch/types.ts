/**
 * WATCH ingress types — GitHub mention/review/assignment → session stub (#19/#48).
 */

import type { HumanAsk, TaskStopReason } from "../agent/types.ts";
import type { InjectionNotice } from "../agent/untrusted.ts";

export const NOT_AUTHORIZED = "not authorized";

export type DetectedEventType =
  | "issue_comment"
  | "issues"
  | "assignment"
  | "review_request"
  | "pull_request_review_comment";

export type DetectedEvent = {
  /** Unique id for dedup (e.g. comment-123, reviewreq-owner/repo#8). */
  id: string;
  type: DetectedEventType;
  body: string;
  /** Comment / mention author; for assignment and review_request, the thread author. */
  sender: string;
  /** GitHub numeric user id of `sender` when the API gave it (IDENTITY-7 stable id). */
  senderId?: number;
  /**
   * assignment / review_request only: the user who assigned the watch user or
   * requested its review. Both `sender` and `actor` must pass the user
   * allowlist, and a missing actor is refused (REQ-watch-302).
   */
  actor?: string;
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
  /**
   * SAFE-13: a tool result in the run looked like a prompt-injection attempt
   * (validated tool name + reason ids); the summary comment tells the owner.
   */
  injection?: InjectionNotice;
  /**
   * AUTONOMY-1/2 / AGENT-16: the question the run stopped on (from the result
   * frame, re-normalized); a "stuck" one pings the owner on Discord
   * (AGENT-16.a, src/watch/owner-ask.ts).
   */
  ask?: HumanAsk;
  /**
   * AGENT-12: a limit I set stopped the run (validated from the result
   * frame); a turn-capped run's summary comment gets a plain note.
   */
  stopReason?: TaskStopReason;
  /**
   * DISCORD-3.b on GitHub (REQ-watch-009): a failed run's reason from the
   * result frame's `error` (one line of harness text — which model call
   * failed as status and host, the no-provider notice, which verify failed —
   * scrubbed and capped); absent on success or when none was given. Shown
   * only through `watchFailureReason`, never the provider's reply body.
   */
  failureReason?: string;
  /**
   * DISCORD-3.b on GitHub: the end of a failed run's stderr, the last
   * fallback for its reason (`watchFailureReason`); never posted as is.
   */
  stderrTail?: string;
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
