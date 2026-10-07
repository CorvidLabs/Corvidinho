/**
 * WATCH ingress types — GitHub mention/review/assignment → session stub (#19/#48).
 */

import type { HumanAsk, TaskStopReason } from "../agent/types.ts";
import type { InjectionNotice } from "../agent/untrusted.ts";
import type { CondenseReport } from "../store/conversation.ts";

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
   * IDENTITY-12.a / SAFE-13 (REQ-watch-1202): the GitHub numeric user ids of
   * everyone who edited the text that triggered the event (the comment, or
   * the issue / PR body) after it was posted — `[]` when it was never
   * edited; absent when that could not be read. GitHub keeps `user` (the
   * `sender`) as the original author when someone with write access edits
   * it, so only a text nobody but `senderId` edited gives the run the
   * sender's role or the owner's SAFE-13 exemption (fail closed).
   */
  textEditorIds?: number[];
  /**
   * SAFE-13 (REQ-watch-1202): GitHub numeric user id of the thread's author
   * (who wrote its title), when the API gave it.
   */
  threadAuthorId?: number;
  /**
   * SAFE-13 (REQ-watch-1202): the GitHub numeric user ids of everyone who
   * renamed the thread's title — `[]` when never renamed; absent when that
   * could not be read. The title is the thread author's own only when every
   * renamer is `threadAuthorId`.
   */
  titleEditorIds?: number[];
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
  /**
   * SESSION-5.a (REQ-watch-472): what the run's condensing did to the
   * thread's replayed conversation (validated against it); the poller keeps
   * that summary and drops the folded turns when it saves the thread.
   */
  conversation?: CondenseReport;
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
