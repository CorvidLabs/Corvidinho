/**
 * `council` autonomous plugin (AUTONOMOUS-6, issue #118; PLUGIN-5).
 *
 * A code-tier lead convenes 2..5 voices (default 3) on one question. They
 * deliberate in structured phases — propose, critique, decide — as delegated
 * worker runs (src/autonomous/council.ts), and the lead gets back the chair's
 * decision plus a bounded transcript. The council advises; the lead decides.
 *
 * Gated like `delegate`: off until the project enables autonomous mode
 * (AUTONOMOUS-1), hidden from the tool catalog unless the session is allowed
 * and at code tier (SAFE-9), mutating so non-ADMIN role sessions never see
 * or run it (ROLES-CHAT-2/3/5). The handler re-checks every gate at run
 * time, and only a top-level lead (depth 0) may convene: a delegated worker
 * is refused before anything spawns. Voices are advisers: read tier by default (tool at most), non-ADMIN
 * role sessions with an empty SAFE-1 allowlist, so they get no mutating
 * tools and a must-ask action is always denied.
 */

import { loadTierFromEnv, tierAllowsPlugin } from "../../src/agent/tier.ts";
import {
  COUNCIL_DEFAULT_VOICES,
  COUNCIL_MAX_VOICES,
  COUNCIL_MIN_VOICES,
  MAX_COUNCILS_PER_RUN,
  canConveneCouncilAtDepth,
  formatCouncilPhases,
  parseCouncilArgs,
  resolveCouncilTier,
  runCouncil,
} from "../../src/autonomous/council.ts";
import {
  DELEGATE_MIN_TIER,
  createDelegateLimiter,
  delegateDepthFromEnv,
  resolveDelegateBin,
  runDelegateChild,
  type DelegateLimiter,
} from "../../src/autonomous/delegate.ts";
import { isAutonomousEnabled } from "../../src/autonomous/enabled.ts";
import type {
  PluginCommand,
  PluginHandlerResult,
} from "../../src/plugins/types.ts";

export const COUNCIL_COMMAND_NAME = "council";

export type CouncilCommandDeps = {
  /** Env the depth / tier / bin are read from and voices inherit (minus stripped keys). */
  env?: NodeJS.ProcessEnv;
  /** Override the voice entrypoint (tests: a fake bin). */
  bin?: string;
  /** Councils per lead run; default one at a time, {@link MAX_COUNCILS_PER_RUN} in total. */
  limiter?: DelegateLimiter;
  /** Whole-council wall-clock cap. */
  timeoutMs?: number;
  /** Per-voice wall-clock cap. */
  voiceTimeoutMs?: number;
};

function refuse(error: string, exitCode = 2): PluginHandlerResult {
  return { ok: false, error, exitCode };
}

const USAGE = `usage: council [--voices ${COUNCIL_MIN_VOICES}-${COUNCIL_MAX_VOICES}] [--tier read|tool] --question TEXT`;

/** Build the `council` command; loadAutonomousPlugins registers the default. */
export function createCouncilCommand(deps: CouncilCommandDeps = {}): PluginCommand {
  const limiter =
    deps.limiter ??
    createDelegateLimiter({ maxConcurrent: 1, maxTotal: MAX_COUNCILS_PER_RUN });
  return {
    name: COUNCIL_COMMAND_NAME,
    description:
      "Convene a council for a decision that needs more than one voice. Worker voices propose independently, critique each other's proposals, then a chair decides; you get the decision and a short transcript. The council advises; you decide. " +
      `argv e.g. ["--question","SQLite or flat files for the cache?"]; optional ["--voices","${COUNCIL_DEFAULT_VOICES}"] (${COUNCIL_MIN_VOICES}-${COUNCIL_MAX_VOICES}), ["--tier","read|tool"] (default read; voices never write). ` +
      `Expensive (up to ${2 * COUNCIL_MAX_VOICES + 1} worker runs, ${MAX_COUNCILS_PER_RUN} councils per run). Autonomous extra: only when the project enables [corvidinho.autonomous]; code tier; top-level lead only, a delegated worker is refused (AUTONOMOUS-1/6, SAFE-9).`,
    dangerous: false,
    mutating: true,
    minTier: DELEGATE_MIN_TIER,
    autonomous: true,
    async handler(ctx): Promise<PluginHandlerResult> {
      const env = deps.env ?? process.env;
      const parsed = parseCouncilArgs(ctx.args);
      if (!parsed.ok) return refuse(`council: ${parsed.error}. ${USAGE}`, 1);
      if (!isAutonomousEnabled(ctx.cwd)) {
        return refuse(
          "refused: autonomous mode is off for this project (AUTONOMOUS-1). Enable it with [corvidinho.autonomous] enabled = true in fledge.toml.",
        );
      }
      // Top-level lead only: a delegated worker (depth >= 1) never convenes
      // a council, so voices never outlive a worker its lead kills (SAFE-9).
      const depth = delegateDepthFromEnv(env);
      if (!canConveneCouncilAtDepth(depth)) {
        return refuse(
          `refused: councils run only from a top-level lead, not a delegated worker (depth ${depth}); decide this yourself (SAFE-9).`,
        );
      }
      // Omitted tier ⇒ the env tier (default tool), never a higher default.
      const leadTier = ctx.tier ?? loadTierFromEnv(env, "tool");
      if (!tierAllowsPlugin(leadTier, DELEGATE_MIN_TIER)) {
        return refuse(
          `refused: council needs the code tier; this run is ${leadTier} (SAFE-9 / AGENT-5).`,
        );
      }
      const tier = resolveCouncilTier(leadTier, parsed.value.tier);
      if (!tier.ok) return refuse(`council: ${tier.error}. ${USAGE}`, 1);

      const slot = limiter.tryAcquire();
      if (!slot.ok) {
        return refuse(
          `refused: council limit reached (one at a time, ${MAX_COUNCILS_PER_RUN} per run); decide with what you have.`,
        );
      }

      const childDepth = depth + 1;
      const bin = deps.bin ?? resolveDelegateBin(env);
      // Voices are non-ADMIN role sessions: the delegate core drops every
      // inherited CORVIDINHO_ACTING_* key and, seeing a role session, forces
      // CORVIDINHO_ACTING_IS_ADMIN=0 (read/chat tools only, ROLES-CHAT-2/3).
      const voiceEnv: NodeJS.ProcessEnv = { ...env, CORVIDINHO_ACTING_IS_ADMIN: "0" };
      try {
        const outcome = await runCouncil({
          question: parsed.value.question,
          voices: parsed.value.voices,
          childDepth,
          signal: ctx.signal,
          ...(deps.timeoutMs !== undefined ? { timeoutMs: deps.timeoutMs } : {}),
          ...(deps.voiceTimeoutMs !== undefined ? { voiceTimeoutMs: deps.voiceTimeoutMs } : {}),
          run: (req) =>
            runDelegateChild({
              bin,
              cwd: ctx.cwd,
              taskText: req.taskText,
              tier: tier.tier,
              childDepth,
              // Empty SAFE-1 allowlist: a voice never runs a must-ask tool.
              allowlist: [],
              baseEnv: voiceEnv,
              signal: req.signal,
              timeoutMs: req.timeoutMs,
            }),
        });
        const phases = formatCouncilPhases(outcome.phases);
        const data = {
          voices: outcome.voices,
          ...(parsed.value.voicesRequested !== undefined
            ? { voicesRequested: parsed.value.voicesRequested }
            : {}),
          tier: tier.tier,
          tierClamped: tier.clamped,
          depth: childDepth,
          state: outcome.state,
          decision: outcome.decision,
          phases: outcome.phases,
          // The chair's text is `decision`; do not send it twice.
          transcript: outcome.transcript.map((e) =>
            e.phase === "decide" && e.ok ? { ...e, text: "(see decision)" } : e,
          ),
          filesChanged: outcome.filesChanged,
          elapsedMs: outcome.elapsedMs,
          ...(outcome.totalTokens !== undefined ? { totalTokens: outcome.totalTokens } : {}),
          ...(outcome.timedOut ? { timedOut: true } : {}),
          ...(outcome.aborted ? { aborted: true } : {}),
        };
        const head = `council (${outcome.voices} voices, tier ${tier.tier}, depth ${childDepth}; ${phases})`;
        return outcome.ok
          ? {
              ok: true,
              data,
              message: `${head} decision:\n${outcome.decision}`,
              exitCode: 0,
            }
          : {
              ok: false,
              data,
              error: `${head} did not decide: ${outcome.error ?? outcome.state}`,
              exitCode: outcome.state === "cancelled" ? 130 : 1,
            };
      } finally {
        slot.slot.release();
      }
    },
  };
}

export const councilCommands: PluginCommand[] = [createCouncilCommand()];
