/**
 * Autonomous extras as plugins (PLUGIN-5): `delegate` (AUTONOMOUS-5, #117).
 *
 * Off until the project enables autonomous mode (AUTONOMOUS-1) and hidden
 * from the tool catalog unless the session is allowed (SAFE-9). The handler
 * re-checks every gate at run time, so `plugins run delegate` or a model
 * naming the tool cannot skip them. Not SAFE-1 dangerous: a worker adds no
 * power the lead lacks (same-or-lower tier, the lead's allowlist, forced
 * non-interactive); cost is bounded by the depth / fan-out caps. Mutating
 * (ROLES-CHAT-5): a worker runs tools, so non-ADMIN role sessions never see
 * or run `delegate` (ROLES-CHAT-2/3, enforced by the catalog and runPlugin).
 */

import { loadTierFromEnv, tierAllowsPlugin } from "../../src/agent/tier.ts";
import {
  DELEGATE_MIN_TIER,
  MAX_DELEGATE_DEPTH,
  buildDelegateTaskText,
  canDelegateAtDepth,
  clampChildTier,
  createDelegateLimiter,
  delegateDepthFromEnv,
  parseDelegateArgs,
  resolveDelegateBin,
  runDelegateChild,
  type DelegateLimiter,
} from "../../src/autonomous/delegate.ts";
import { isAutonomousEnabled } from "../../src/autonomous/enabled.ts";
import type {
  PluginCommand,
  PluginHandlerResult,
} from "../../src/plugins/types.ts";

export const DELEGATE_COMMAND_NAME = "delegate";

export type DelegateCommandDeps = {
  /** Env the depth / tier / bin are read from and the worker inherits. */
  env?: NodeJS.ProcessEnv;
  /** Override the worker entrypoint (tests: a fake bin). */
  bin?: string;
  limiter?: DelegateLimiter;
  timeoutMs?: number;
};

function refuse(error: string, exitCode = 2): PluginHandlerResult {
  return { ok: false, error, exitCode };
}

/** Build the `delegate` command; loadAutonomousPlugins registers the default. */
export function createDelegateCommand(deps: DelegateCommandDeps = {}): PluginCommand {
  const limiter = deps.limiter ?? createDelegateLimiter();
  return {
    name: DELEGATE_COMMAND_NAME,
    description:
      "Delegate one subtask to a worker agent (a child task run at your tier or lower) and get back its summary to synthesize into your answer. " +
      'argv e.g. ["--skill","specsync","--task","List the specs that cover the agent loop"]; optional ["--tier","read|tool|code"] (never above yours). ' +
      `Autonomous extra: only when the project enables [corvidinho.autonomous]; code tier; workers max ${MAX_DELEGATE_DEPTH} levels deep (AUTONOMOUS-1/5, SAFE-9).`,
    dangerous: false,
    mutating: true,
    minTier: DELEGATE_MIN_TIER,
    autonomous: true,
    async handler(ctx): Promise<PluginHandlerResult> {
      const env = deps.env ?? process.env;
      const parsed = parseDelegateArgs(ctx.args);
      if (!parsed.ok) {
        return refuse(
          `delegate: ${parsed.error}. usage: delegate [--skill NAME] [--tier read|tool|code] --task TEXT`,
          1,
        );
      }
      if (!isAutonomousEnabled(ctx.cwd)) {
        return refuse(
          "refused: autonomous mode is off for this project (AUTONOMOUS-1). Enable it with [corvidinho.autonomous] enabled = true in fledge.toml.",
        );
      }
      const depth = delegateDepthFromEnv(env);
      if (!canDelegateAtDepth(depth)) {
        return refuse(
          `refused: delegation depth cap reached (depth ${depth}, max ${MAX_DELEGATE_DEPTH}); do this subtask yourself (SAFE-9).`,
        );
      }
      // Omitted tier ⇒ the env tier (default tool), never a higher default.
      const parentTier = ctx.tier ?? loadTierFromEnv(env, "tool");
      if (!tierAllowsPlugin(parentTier, DELEGATE_MIN_TIER)) {
        return refuse(
          `refused: delegate needs the code tier; this run is ${parentTier} (SAFE-9 / AGENT-5).`,
        );
      }
      const clamp = clampChildTier(parentTier, parsed.value.tier);
      if (!clamp.ok) return refuse(`delegate: ${clamp.error}`, 1);

      const slot = limiter.tryAcquire();
      if (!slot.ok) return refuse(`refused: ${slot.error}; synthesize what you have.`);

      const childDepth = depth + 1;
      try {
        const outcome = await runDelegateChild({
          bin: deps.bin ?? resolveDelegateBin(env),
          cwd: ctx.cwd,
          taskText: buildDelegateTaskText({
            task: parsed.value.task,
            skill: parsed.value.skill,
            childDepth,
          }),
          tier: clamp.tier,
          childDepth,
          allowlist: ctx.allowlist,
          baseEnv: env,
          signal: ctx.signal,
          timeoutMs: deps.timeoutMs,
          // GITHUB-9: the lead's change authors, so a PR the worker opens is
          // never reviewed by a model that wrote part of it.
          ...(ctx.review ? { authors: ctx.review.authors() } : {}),
        });
        const ok = outcome.exitCode === 0 && outcome.state === "done";
        const data = {
          skill: parsed.value.skill ?? null,
          tier: clamp.tier,
          tierClamped: clamp.clamped,
          depth: childDepth,
          exitCode: outcome.exitCode,
          state: outcome.state,
          summary: outcome.summary,
          filesChanged: outcome.filesChanged,
          ...(outcome.verified !== undefined ? { verified: outcome.verified } : {}),
          ...(outcome.verifySkipped !== undefined
            ? { verifySkipped: outcome.verifySkipped }
            : {}),
          ...(outcome.totalTokens !== undefined
            ? { totalTokens: outcome.totalTokens }
            : {}),
          ...(outcome.timedOut ? { timedOut: true } : {}),
          ...(outcome.aborted ? { aborted: true } : {}),
          // SAFE-13: the worker's own hit, for the lead's tool loop.
          ...(outcome.injection ? { injection: outcome.injection } : {}),
          // AGENT-11: the worker's model failovers, for the lead's result.
          ...(outcome.modelFallback ? { modelFallback: outcome.modelFallback } : {}),
          // GITHUB-9: the worker's models, authors of the change for the lead.
          ...(outcome.models ? { models: outcome.models } : {}),
          // AGENT-12: a limit stopped the worker (turn-cap: its best answer so far).
          ...(outcome.stopReason ? { stopReason: outcome.stopReason } : {}),
        };
        const label = parsed.value.skill ? ` [${parsed.value.skill}]` : "";
        return ok
          ? {
              ok: true,
              data,
              message: `worker${label} (tier ${clamp.tier}, depth ${childDepth}) done:\n${outcome.summary}`,
              exitCode: 0,
            }
          : {
              ok: false,
              data,
              error: `worker${label} (tier ${clamp.tier}, depth ${childDepth}) did not finish (state ${outcome.state}, exit ${outcome.exitCode}):\n${outcome.summary}`,
              exitCode: outcome.exitCode === 0 ? 1 : outcome.exitCode,
            };
      } finally {
        slot.slot.release();
      }
    },
  };
}

export const autonomousCommands: PluginCommand[] = [createDelegateCommand()];
