/**
 * Typed plugin command surface (PLUGIN-1/2/6).
 * Danger and minTier are declared on every command; runtime enforces them (SAFE-1).
 */

import type { ModelFailure, ResolvedProvider } from "../agent/providers.ts";
import type { CapabilityTier } from "../agent/tier.ts";
import type { HumanAsk } from "../agent/types.ts";

/** One message of the second-model review's no-tools chat call (GITHUB-9). */
export type ReviewMessage = { role: "system" | "user"; content: string };

/**
 * The review call's reply, or why there is none. `failure: null` means the
 * call was not a model failure: the run's own stop, or a SAFE-8 spend-cap
 * stop (src/work/review.ts throws `ReviewSpendStop` for that one).
 */
export type ReviewCompletion =
  | { ok: true; text: string }
  | { ok: false; error: string; failure: ModelFailure | null };

/**
 * GITHUB-9 / GITHUB-9.a: what the calling agent run (the tool loop,
 * src/agent/execute.ts) hands a handler for the second-model review of a
 * PR it opens. Absent for every other caller (`corvidinho plugins run`, the
 * /work PR step): github-pr-create then starts no review round.
 */
export type PrReviewRun = {
  /** The run's env: its AGENT-13 model config, which the reviewer is chosen from. */
  env: NodeJS.ProcessEnv;
  /**
   * Entry labels of every model that wrote this run's change: the models
   * its own chain called (AGENT-11 fallbacks included), its delegate
   * workers' and, in a worker, its lead's.
   */
  authors: () => readonly string[];
  /**
   * One no-tools chat completion to `provider` through the run's provider
   * call path and its SAFE-8 spend guard; usage counts under the provider's
   * entry label (DISCORD-15.a footer, SAFE-16).
   */
  complete: (
    provider: ResolvedProvider,
    messages: ReviewMessage[],
    signal?: AbortSignal,
  ) => Promise<ReviewCompletion>;
};

export type PluginHandlerArgs = {
  /** Args after the command name (and after `--` when invoked via CLI). */
  args: string[];
  cwd: string;
  json: boolean;
  nonInteractive: boolean;
  allowlist: ReadonlySet<string>;
  /** Capability tier of the calling run, when known (tool loop). */
  tier?: CapabilityTier;
  /** Aborts with the calling run (AGENT-3), when the caller has one. */
  signal?: AbortSignal;
  /** GITHUB-9: the calling agent run's models and call path (tool loop only). */
  review?: PrReviewRun;
};

/** An image a plugin opened for the model to look at (DISCORD-9). */
export type PluginImage = {
  /** The path as the caller gave it. */
  path: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  base64: string;
};

export type PluginHandlerResult = {
  ok: boolean;
  /** Structured payload for --json or further tooling. */
  data?: unknown;
  /** Human-readable summary when not using --json. */
  message?: string;
  error?: string;
  exitCode?: number;
  /**
   * Image bytes the agent tool loop sends the model as an image part
   * (REQ-plugins-427 / REQ-agent-428). Kept off `data` and `message` so the
   * base64 never reaches tool text, events, ndjson or CLI output.
   */
  image?: PluginImage;
  /**
   * Text shown only privately to the person who asked (MEMORY-7.a,
   * REQ-plugins-710): private notes, a profile, the owner's view of someone's
   * memory. Kept off `data` and `message` (which then hold only a "sent
   * privately" placeholder) so it never reaches the model, tool text or
   * events; the tool loop hands it to the run result and the Discord bridge
   * sends it by direct message (REQ-agent-710 / REQ-discord-710).
   */
  privateText?: string;
  /**
   * GITHUB-9: github-pr-create held the PR at the second-model review gate —
   * `findings` (round k of N raised findings; change the tree or leave it,
   * then call again) or `refused` (one plain line saying why no PR opens).
   * The tool loop never counts it as a failed call (AGENT-16) or a change
   * (AGENT-17).
   */
  reviewHold?: "findings" | "refused";
  /**
   * SAFE-8 (REQ-agent-098): a flat-priced call (`web-search`, `gif-search`) stopped at the
   * daily spend cap before it was sent. The tool loop ends the attempt with
   * this `spend-cap` ask, as for a model call stopped at the cap; kept off
   * `data` and `message` so amounts and cap settings never reach the model
   * or a public reply (SAFE-14.a).
   */
  spendAsk?: HumanAsk;
  /**
   * SAFE-5: why a refusal refused, as a fixed kebab-case code (never args,
   * names or text). `runPlugin` then records the refusal as one `denied` row
   * whose action is `<command>:<code>` — for a refusal from the must-ask
   * classifier or card as for one from the handler — instead of a plain
   * `denied` / `error` row under the command name (`github-pr-merge`,
   * GITHUB-7.a, REQ-plugins-099).
   */
  auditDenied?: string;
};

/**
 * Must-ask classes a command's call can fall in (AUTONOMY-9/10,
 * src/plugins/must-ask.ts `MUST_ASK_POLICY`): `prod` touches prod or
 * deploys (VPS, secrets, env, DNS; a push to a remote's default branch),
 * `public` is a channel post it makes, `merge` is a merge of its own
 * Corvidinho PR (`github-pr-merge`, GITHUB-7.a: only when the owner asks).
 * Spend over a cap (AUTONOMY-8) is the SAFE-8 spend guard's, not a command
 * class.
 */
export type MustAskClass = "prod" | "public" | "merge";

/** One call that must wait for the owner's Approve card, as its card shows it (SAFE-18). */
export type MustAskAsk = {
  class: MustAskClass;
  /** One line: why this call must ask (the card's action and every refusal say it). */
  why: string;
  /** The card's exact target line. */
  target: string;
  /** The exact text or command, sent verbatim before the card. */
  text?: string;
};

/**
 * What a command's must-ask classifier says about one call: null runs it
 * with no ask (AUTONOMY-11); `ask` waits for the owner's card; `refuse`
 * returns that result as is (the command would refuse this call anyway, so
 * nothing runs and no card is raised).
 */
export type MustAskVerdict = null | { ask: MustAskAsk } | { refuse: PluginHandlerResult };

/**
 * Classifies a call from its args and the files and config they name —
 * never from model text about the call, so a prompt can't reclassify an
 * action (#97).
 */
export type MustAskClassifier = (ctx: {
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}) => MustAskVerdict | Promise<MustAskVerdict>;

export type PluginCommand = {
  name: string;
  description: string;
  /** When true, blocked in non-interactive unless allowlisted (SAFE-1 / CLI-3). */
  dangerous?: boolean;
  /**
   * AUTONOMY-9/10: a class (every call asks) or a classifier (the call's
   * args decide). Missing ⇒ never must-ask (AUTONOMY-11). Enforced in
   * `runPlugin` (src/plugins/must-ask.ts).
   */
  mustAsk?: MustAskClass | MustAskClassifier;
  /**
   * When true, treated as mutating even if `dangerous` is false (ROLES-CHAT-5).
   * Non-ADMIN acting sessions never see or run mutating tools.
   */
  mutating?: boolean;
  /** Minimum autonomy/trust tier required (PLUGIN-2). Default 0. */
  minTier?: number;
  /**
   * Autonomous extra (PLUGIN-5): left out of the agent tool catalog unless
   * the session is allowed autonomous tools (AUTONOMOUS-1 / SAFE-9).
   */
  autonomous?: boolean;
  /**
   * When false, never offered in the agent's tool catalog even when
   * allowlisted: the agent loop itself runs it (AGENT-18.a: the SpecSync
   * approve and finalize steps `runTask` takes right after a verified lane).
   * `runPlugin` and `corvidinho plugins run` still reach it. Default true.
   */
  agentTool?: boolean;
  /** Where the command comes from (PLUGIN-6): "builtin" (default) or "fledge:<plugin>@<version>". */
  origin?: string;
  handler: (ctx: PluginHandlerArgs) => Promise<PluginHandlerResult>;
};

/** Public list row — enough schema to understand cost/risk (PLUGIN-6). */
export type PluginListEntry = {
  name: string;
  description: string;
  dangerous: boolean;
  /** Effective mutating (dangerous OR explicit mutating flag). */
  mutating: boolean;
  minTier: number;
};
