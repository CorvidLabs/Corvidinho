/**
 * AUTONOMY-9/10 test helper: answer the must-ask gate's Approve card
 * (src/plugins/must-ask.ts) as the owner would, for tests that exercise what
 * a must-ask command does once it is allowed (a real Discord post, a prod
 * shell command). Sets a configured owner (the gate refuses at once without
 * one) and a hook that decides each card as it is recorded.
 */
import type { Database } from "bun:sqlite";
import { ApprovalStore, type ApprovalRequest } from "../../src/approvals/store.ts";
import { setMustAskTestHooks, type MustAskTestHooks } from "../../src/plugins/must-ask.ts";

export const MUST_ASK_TEST_OWNER = "181969874455756800";

export type MustAskAnswer = "approved" | "denied" | "none";

/**
 * Decide every must-ask card with `answer` (`none`: let it lapse) and record
 * what was asked. Returns the recorded requests and a restore function.
 */
export function answerMustAsk(
  answer: MustAskAnswer | ((req: ApprovalRequest) => MustAskAnswer) = "approved",
  opts: { ttlMs?: number } = {},
): { requests: ApprovalRequest[]; restore: () => void } {
  const requests: ApprovalRequest[] = [];
  const prevOwner = process.env.CORVIDINHO_OWNER_DISCORD_ID;
  process.env.CORVIDINHO_OWNER_DISCORD_ID = MUST_ASK_TEST_OWNER;
  const hooks: MustAskTestHooks = {
    ttlMs: opts.ttlMs ?? 2_000,
    pollMs: 5,
    onRequest: (req: ApprovalRequest, db: Database) => {
      requests.push(req);
      const a = typeof answer === "function" ? answer(req) : answer;
      if (a === "none") return;
      new ApprovalStore({ db }).decide(req.id, a, { by: MUST_ASK_TEST_OWNER });
    },
  };
  const prevHooks = setMustAskTestHooks(hooks);
  return {
    requests,
    restore: () => {
      setMustAskTestHooks(prevHooks);
      if (prevOwner === undefined) delete process.env.CORVIDINHO_OWNER_DISCORD_ID;
      else process.env.CORVIDINHO_OWNER_DISCORD_ID = prevOwner;
    },
  };
}
