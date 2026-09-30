/**
 * Typed plugin command surface (PLUGIN-1/2/6).
 * Danger and minTier are declared on every command; runtime enforces them (SAFE-1).
 */

import type { CapabilityTier } from "../agent/tier.ts";

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
};

/**
 * Must-ask classes a command's call can fall in (AUTONOMY-9/10,
 * src/plugins/must-ask.ts `MUST_ASK_POLICY`): `prod` touches prod or
 * deploys (VPS, secrets, env, DNS; a push to a remote's default branch),
 * `public` is a channel post it makes. Spend over a cap (AUTONOMY-8) is the
 * SAFE-8 spend guard's, not a command class.
 */
export type MustAskClass = "prod" | "public";

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
