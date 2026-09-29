/**
 * DISCORD-3 live thinking status — thin steal from corvid-agent
 * progress-response / embeds (edit-in-place; no ProcessManager).
 *
 * DISCORD-15 / DISCORD-15.a / DISCORD-16 (#75): the final answer's footer
 * carries the model and time for everyone, plus tokens and cost on the
 * owner's own runs only (`showUsage`, `AnswerExtras.spend`); a long answer is
 * split fence-safe into several messages (rich-reply.ts), the footer on the
 * last one.
 */

import { formatUsd } from "../agent/spend-notice.ts";
import { planAnswerParts } from "./rich-reply.ts";

export const THINKING_COLORS = {
  working: 0x5865f2, // blurple
  success: 0x57f287, // green
  error: 0xff3355,
  warning: 0xf0b232,
} as const;

export type ThinkingPhase = "starting" | "working" | "done" | "error";

export type ThinkingTokens = {
  /** Rough estimated tokens used (optional). */
  estimated?: number;
  /** Context window size when known. */
  contextWindow?: number;
};

export type ThinkingSnapshot = {
  phase: ThinkingPhase;
  /** Human status line (tool name or short message). */
  tool?: string;
  /** Free-form description override. */
  description?: string;
  tokens?: ThinkingTokens;
  /** Elapsed ms since start (controller fills). */
  elapsedMs?: number;
  sessionId?: string;
  /** LLM model id when known (DISCORD-3.a). */
  model?: string;
  /**
   * Operator plumbing for the embed only (DISCORD-3.a) — e.g.
   * `state=done verified=false verifySkipped attempts=1`. Never put this in
   * the final chat reply body.
   */
  plumbing?: string;
};

/**
 * DISCORD-15 — tokens and cost an owner-run answer footer shows. A field
 * left out is unknown and shows as unknown (never 0 / $0, SAFE-16).
 */
export type AnswerSpend = {
  /** Provider-reported tokens for the run. */
  totalTokens?: number;
  /** Run cost in micro-USD from the model's known price. */
  costMicroUsd?: number;
};

/** What a final answer's footer shows besides the time (DISCORD-3.a, DISCORD-15). */
export type AnswerExtras = {
  plumbing?: string;
  model?: string;
  /**
   * Tokens and cost — pass only for the owner's own runs (DISCORD-15.a,
   * SAFE-14.a); left out, the footer shows model and time only.
   */
  spend?: AnswerSpend;
};

export type DiscordEmbedPayload = {
  /** Omitted on a footer-only embed (DISCORD-3.a answer footer). */
  description?: string;
  color: number;
  footer?: { text: string };
};

/** Format elapsed duration compactly: `0s`, `12s`, `1m 05s`, `1h 02m`. */
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) {
    return `${hours}h ${String(mins).padStart(2, "0")}m`;
  }
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

/** Compact token count: `640`, `12k`, `1.2M`. */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(Math.round(tokens));
}

/** Rough token footer segment when estimates exist. */
export function formatTokenSegment(tokens?: ThinkingTokens): string | undefined {
  if (!tokens || tokens.estimated == null) return undefined;
  const used = formatTokenCount(tokens.estimated);
  if (tokens.contextWindow != null && tokens.contextWindow > 0) {
    const pct = Math.round((tokens.estimated / tokens.contextWindow) * 100);
    const max = formatTokenCount(tokens.contextWindow);
    const emoji =
      pct >= 80 ? "🔴" : pct >= 60 ? "🟠" : pct >= 40 ? "🟡" : pct >= 20 ? "🟢" : "⚪";
    return `${emoji} ~${pct}% (${used}/${max})`;
  }
  return `~${used} tok`;
}

export function phaseColor(phase: ThinkingPhase): number {
  switch (phase) {
    case "done":
      return THINKING_COLORS.success;
    case "error":
      return THINKING_COLORS.error;
    case "starting":
    case "working":
    default:
      return THINKING_COLORS.working;
  }
}

export function defaultDescription(snap: ThinkingSnapshot): string {
  if (snap.description?.trim()) return snap.description.trim();
  if (snap.phase === "done") return "✅ Done";
  if (snap.phase === "error") return "❌ Failed";
  if (snap.tool?.trim()) return `⏳ ${snap.tool.trim()}`;
  if (snap.phase === "starting") return "Working on your request...";
  return "⏳ Working...";
}

/**
 * Footer: `sessXXXX · working · 12s | tool | ~tok`
 * Segments omitted when unknown (ancestor pattern).
 */
export function buildThinkingFooter(snap: ThinkingSnapshot): string {
  const parts: string[] = [];
  if (snap.sessionId) parts.push(snap.sessionId.slice(0, 8));
  const statusLabel =
    snap.phase === "starting"
      ? "starting..."
      : snap.phase === "working"
        ? "working..."
        : snap.phase === "done"
          ? "done"
          : "error";
  parts.push(statusLabel);
  if (snap.elapsedMs != null) parts.push(formatElapsed(snap.elapsedMs));
  if (snap.model?.trim()) parts.push(snap.model.trim());
  const base = parts.join(" · ");
  const segments: string[] = [base];
  if (snap.tool?.trim() && snap.phase !== "done" && snap.phase !== "error") {
    segments.push(snap.tool.trim());
  }
  const tok = formatTokenSegment(snap.tokens);
  if (tok) segments.push(tok);
  if (snap.plumbing?.trim() && (snap.phase === "done" || snap.phase === "error")) {
    segments.push(snap.plumbing.trim());
  }
  return segments.join(" | ");
}

export function buildThinkingEmbed(snap: ThinkingSnapshot): DiscordEmbedPayload {
  return {
    description: defaultDescription(snap),
    color: phaseColor(snap.phase),
    footer: { text: buildThinkingFooter(snap) },
  };
}

/**
 * DISCORD-15 — the answer footer text: model, then (owner runs only, when
 * `spend` is given) tokens and cost, then time, then the run's plumbing
 * (DISCORD-3.a). Unknown tokens / cost print `tokens unknown` /
 * `cost unknown`, never 0 or $0 (SAFE-16).
 */
export function formatAnswerFooter(snap: {
  model?: string;
  elapsedMs?: number;
  plumbing?: string;
  spend?: AnswerSpend;
}): string {
  const parts: string[] = [];
  if (snap.model?.trim()) parts.push(snap.model.trim());
  if (snap.spend) {
    const tokens = snap.spend.totalTokens;
    parts.push(tokens != null && tokens > 0 ? `${formatTokenCount(tokens)} tokens` : "tokens unknown");
    const cost = snap.spend.costMicroUsd;
    parts.push(cost != null && cost > 0 ? formatUsd(cost) : "cost unknown");
  }
  if (snap.elapsedMs != null) parts.push(formatElapsed(snap.elapsedMs));
  if (snap.plumbing?.trim()) parts.push(snap.plumbing.trim());
  return parts.join(" | ");
}

/**
 * DISCORD-3.a / DISCORD-15 — footer-only embed kept on a final answer: the
 * model, tokens and cost (owner runs only), the time and the run's plumbing
 * (`state=… verified=… [verifySkipped] attempts=…`), so they stay out of the
 * answer body. Null when none is known (the answer then carries no embed).
 */
export function buildAnswerFooterEmbed(snap: {
  phase: ThinkingPhase;
  model?: string;
  plumbing?: string;
  elapsedMs?: number;
  spend?: AnswerSpend;
}): DiscordEmbedPayload | null {
  const text = formatAnswerFooter(snap);
  if (!text) return null;
  return { color: phaseColor(snap.phase), footer: { text } };
}

/**
 * Edit a channel message in place (content / embeds / components).
 * Pass `null` for content, embed, or components to clear that field.
 * Used to collapse thinking ↔ Choose stub ↔ final answer (DISCORD-ASK-6/7).
 */
export type EditMessageOpts = {
  channelId: string;
  messageId: string;
  content?: string | null;
  embed?: DiscordEmbedPayload | null;
  components?: unknown[] | null;
  mentionUserIds?: string[];
};

/** Outbound surface for progress send/edit (injected; live or mock). */
export type ThinkingOutbound = {
  sendEmbed(opts: {
    channelId: string;
    embed: DiscordEmbedPayload;
    replyToMessageId?: string;
  }): Promise<{ messageId: string } | null>;
  editEmbed(opts: {
    channelId: string;
    messageId: string;
    embed: DiscordEmbedPayload;
  }): Promise<boolean>;
  /**
   * Optional richer edit (content + clear embeds/components).
   * When absent, finalizeContent falls back to posting a new reply.
   */
  editMessage?: (opts: EditMessageOpts) => Promise<boolean>;
  /** Optional delete — used to drop a progress message when collapsing fails. */
  deleteMessage?: (opts: {
    channelId: string;
    messageId: string;
  }) => Promise<boolean>;
  /**
   * Optional fresh post (text and/or embed) for the parts of a long answer
   * after the first (DISCORD-16). Without it an answer that needs more than
   * one message is not collapsed (the caller falls back to a reply).
   */
  sendMessage?: (opts: {
    channelId: string;
    content: string;
    embed?: DiscordEmbedPayload;
    mentionUserIds?: string[];
    components?: unknown[];
  }) => Promise<{ messageId: string } | null>;
};

/** The messages a final answer went out as (DISCORD-16). */
export type FinalizedAnswer = {
  /** The progress message, now the answer's first part. */
  messageId: string;
  /** Every part that went out, in order (the first is `messageId`). */
  messageIds: string[];
  /** False when a later part could not be edited or posted. */
  complete: boolean;
};

export type ThinkingStatusOpts = {
  outbound: ThinkingOutbound;
  channelId: string;
  replyToMessageId?: string;
  sessionId: string;
  /** LLM model id shown in the footer when known (DISCORD-3.a). */
  model?: string;
  /**
   * The acting user is the owner (DISCORD-15.a): only then does the live
   * status show token use. Default false — non-owner runs never show it.
   */
  showUsage?: boolean;
  /**
   * Reuse an existing channel message (e.g. Choose stub) as the progress
   * surface instead of posting a new embed (DISCORD-ASK-7 button-pick path).
   */
  existingMessageId?: string;
  /** Debounce between edits (ancestor used 3000ms). */
  debounceMs?: number;
  /** Elapsed tick interval while waiting. */
  tickMs?: number;
  now?: () => number;
};

/**
 * One progress message edited in-place while a session runs.
 */
export class ThinkingStatus {
  private readonly outbound: ThinkingOutbound;
  private readonly channelId: string;
  private readonly replyToMessageId?: string;
  private readonly sessionId: string;
  private readonly existingMessageId?: string;
  private readonly debounceMs: number;
  private readonly tickMs: number;
  private readonly now: () => number;
  private startedAt: number;
  private messageId: string | null = null;
  private lastEditAt = 0;
  private tool?: string;
  private tokens?: ThinkingTokens;
  private description?: string;
  private model?: string;
  private plumbing?: string;
  private spend?: AnswerSpend;
  private readonly showUsage: boolean;
  /** Time the answer footer shows, frozen when the answer first goes out. */
  private finalElapsedMs?: number;
  /** The answer's messages after finalizeContent (DISCORD-16), with what each holds. */
  private answerMessages: Array<{ messageId: string; key: string }> = [];
  private phase: ThinkingPhase = "starting";
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(opts: ThinkingStatusOpts) {
    this.outbound = opts.outbound;
    this.channelId = opts.channelId;
    this.replyToMessageId = opts.replyToMessageId;
    this.sessionId = opts.sessionId;
    this.existingMessageId = opts.existingMessageId?.trim() || undefined;
    this.model = opts.model?.trim() || undefined;
    this.showUsage = opts.showUsage === true;
    this.debounceMs = opts.debounceMs ?? 3000;
    this.tickMs = opts.tickMs ?? 3000;
    this.now = opts.now ?? (() => Date.now());
    this.startedAt = this.now();
  }

  get progressMessageId(): string | null {
    return this.messageId;
  }

  /**
   * Time since start for the answer footer (DISCORD-15); frozen once the
   * answer first went out, so a later re-edit keeps the same footer.
   */
  get elapsedMs(): number {
    return this.finalElapsedMs ?? this.now() - this.startedAt;
  }

  /**
   * DISCORD-15 — the answer's footer-only embed for a fallback reply (or the
   * collapsed answer): model, tokens and cost when `extras.spend` is given
   * (owner runs), time, plumbing. Records the extras like finalizeContent.
   */
  answerFooter(opts: { extras?: AnswerExtras; failed?: boolean }): DiscordEmbedPayload | null {
    this.applyExtras(opts.extras);
    const phase: ThinkingPhase = (opts.failed ?? this.phase === "error") ? "error" : "done";
    this.finalElapsedMs ??= this.now() - this.startedAt;
    return buildAnswerFooterEmbed({
      phase,
      model: this.model,
      plumbing: this.plumbing,
      elapsedMs: this.finalElapsedMs,
      spend: this.spend,
    });
  }

  private applyExtras(extras: AnswerExtras | undefined): void {
    if (extras?.plumbing != null) this.plumbing = extras.plumbing.trim() || undefined;
    if (extras?.model != null) this.model = extras.model.trim() || undefined;
    if (extras?.spend) this.spend = extras.spend;
  }

  private snapshot(over: Partial<ThinkingSnapshot> = {}): ThinkingSnapshot {
    return {
      phase: over.phase ?? this.phase,
      tool: over.tool ?? this.tool,
      description: over.description ?? this.description,
      // DISCORD-15.a: token use shows on the owner's own runs only.
      tokens: this.showUsage ? (over.tokens ?? this.tokens) : undefined,
      elapsedMs: this.now() - this.startedAt,
      sessionId: this.sessionId,
      model: over.model ?? this.model,
      plumbing: over.plumbing ?? this.plumbing,
    };
  }

  /** Post (or adopt) the initial progress embed. */
  async start(initial?: { tool?: string; description?: string }): Promise<void> {
    if (this.closed) return;
    this.phase = "starting";
    if (initial?.tool) this.tool = initial.tool;
    if (initial?.description) this.description = initial.description;
    this.startedAt = this.now();
    const embed = buildThinkingEmbed(this.snapshot());
    if (this.existingMessageId && this.outbound.editMessage) {
      // DISCORD-ASK-7 — reuse Choose stub as the working surface.
      const ok = await this.outbound.editMessage({
        channelId: this.channelId,
        messageId: this.existingMessageId,
        content: null,
        embed,
        components: null,
      });
      this.messageId = ok ? this.existingMessageId : null;
    } else if (this.existingMessageId) {
      const ok = await this.outbound.editEmbed({
        channelId: this.channelId,
        messageId: this.existingMessageId,
        embed,
      });
      this.messageId = ok ? this.existingMessageId : null;
    } else {
      const sent = await this.outbound.sendEmbed({
        channelId: this.channelId,
        embed,
        replyToMessageId: this.replyToMessageId,
      });
      this.messageId = sent?.messageId ?? null;
    }
    this.lastEditAt = this.now();
    this.phase = "working";
    this.startTicker();
  }

  private startTicker(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      if (this.closed || this.phase === "done" || this.phase === "error") {
        this.stopTicker();
        return;
      }
      void this.flush(false);
    }, this.tickMs);
    // Avoid keeping process alive solely for ticks in Bun/Node.
    if (typeof this.tickTimer === "object" && this.tickTimer && "unref" in this.tickTimer) {
      (this.tickTimer as NodeJS.Timeout).unref?.();
    }
  }

  private stopTicker(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /** Apply tool / token / description update (debounced). */
  async update(partial: {
    tool?: string;
    tokens?: ThinkingTokens;
    description?: string;
    model?: string;
  }): Promise<void> {
    if (this.closed || this.phase === "done" || this.phase === "error") return;
    if (partial.tool != null) this.tool = partial.tool;
    if (partial.tokens != null) this.tokens = partial.tokens;
    if (partial.description != null) this.description = partial.description;
    if (partial.model != null) this.model = partial.model.trim() || undefined;
    this.phase = "working";
    await this.flush(false);
  }

  private async flush(force: boolean): Promise<void> {
    if (!this.messageId || this.closed) return;
    const now = this.now();
    if (!force && now - this.lastEditAt < this.debounceMs) return;
    this.lastEditAt = now;
    const embed = buildThinkingEmbed(this.snapshot());
    await this.outbound.editEmbed({
      channelId: this.channelId,
      messageId: this.messageId,
      embed,
    });
  }

  async done(
    finalDescription?: string,
    extras?: AnswerExtras,
  ): Promise<void> {
    if (this.closed) return;
    this.stopTicker();
    this.phase = "done";
    this.description = finalDescription ?? "✅ Done";
    if (extras?.plumbing != null) this.plumbing = extras.plumbing.trim() || undefined;
    if (extras?.model != null) this.model = extras.model.trim() || undefined;
    await this.flush(true);
    this.closed = true;
  }

  async fail(
    finalDescription?: string,
    extras?: AnswerExtras,
  ): Promise<void> {
    if (this.closed) return;
    this.stopTicker();
    this.phase = "error";
    this.description = finalDescription ?? "❌ Failed";
    if (extras?.plumbing != null) this.plumbing = extras.plumbing.trim() || undefined;
    if (extras?.model != null) this.model = extras.model.trim() || undefined;
    await this.flush(true);
    this.closed = true;
  }

  /**
   * DISCORD-ASK-6/7 — turn the progress message into the final channel body
   * (Choose stub or answer), replacing the thinking embed. A Choose stub
   * (`components`) carries no embed; a final answer keeps a footer-only
   * embed with the model, the time, tokens and cost on the owner's runs
   * (`extras.spend`, DISCORD-15/15.a) and `extras.plumbing` (DISCORD-3.a),
   * colored as a failure when `failed`. DISCORD-16: an answer over 2000
   * characters is split fence-safe (rich-reply.ts) — the first part is the
   * progress message, later parts are fresh posts (`sendMessage`, no pings),
   * the footer and any `components` ride the last part; plain prose that
   * fits one embed goes out as that embed instead. A later call (e.g.
   * appending a notice) keeps the footer, time and outcome of the first and
   * edits (or adds) only the parts that changed. Returns the answer's
   * message ids on success; null when editMessage is unavailable, the first
   * edit fails, or more parts are needed than `sendMessage` can post (caller
   * should fall back to a new reply).
   */
  async finalizeContent(opts: {
    content: string;
    components?: unknown[];
    mentionUserIds?: string[];
    extras?: AnswerExtras;
    failed?: boolean;
  }): Promise<FinalizedAnswer | null> {
    if (this.closed && !this.messageId) return null;
    this.stopTicker();
    const id = this.messageId;
    // Only close on success so callers can fall back to done()/fail()+reply
    // when editMessage is missing or the edit fails (DISCORD-ASK-7).
    if (!id || !this.outbound.editMessage) return null;
    const hasComponents = Boolean(opts.components?.length);
    const phase: ThinkingPhase =
      (opts.failed ?? this.phase === "error") ? "error" : "done";
    const footer = this.answerFooter({ extras: opts.extras, failed: opts.failed });
    const parts = planAnswerParts(opts.content, {
      footer: hasComponents ? null : footer,
      allowEmbed: !hasComponents && !opts.mentionUserIds?.length,
    });
    if (parts.length > Math.max(1, this.answerMessages.length) && !this.outbound.sendMessage) {
      return null;
    }
    const messages: Array<{ messageId: string; key: string }> = [];
    let complete = true;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const components = i === parts.length - 1 && hasComponents ? opts.components! : null;
      const key = JSON.stringify([part.content, part.embed, components]);
      const prev = i === 0 ? { messageId: id, key: this.answerMessages[0]?.key } : this.answerMessages[i];
      if (prev) {
        if (prev.key !== key) {
          const ok = await this.outbound.editMessage({
            channelId: this.channelId,
            messageId: prev.messageId,
            content: part.content,
            embed: part.embed,
            components,
            ...(i === 0 && opts.mentionUserIds ? { mentionUserIds: opts.mentionUserIds } : {}),
          });
          if (!ok) {
            if (i === 0) return null;
            complete = false;
            break;
          }
        }
        messages.push({ messageId: prev.messageId, key });
        continue;
      }
      const sent = await this.outbound.sendMessage!({
        channelId: this.channelId,
        content: part.content ?? "",
        ...(part.embed ? { embed: part.embed } : {}),
        // Later parts ping nobody: the collapsed-answer ping post does (REQ-discord-215).
        mentionUserIds: [],
        ...(components ? { components } : {}),
      });
      if (!sent) {
        console.warn(`[discord] answer part ${i + 1}/${parts.length} for ${this.sessionId} not sent`);
        complete = false;
        break;
      }
      messages.push({ messageId: sent.messageId, key });
    }
    // A shorter re-edit drops the parts it no longer needs.
    for (const stale of complete ? this.answerMessages.slice(parts.length) : []) {
      await this.outbound.deleteMessage?.({ channelId: this.channelId, messageId: stale.messageId });
    }
    this.answerMessages = messages;
    this.closed = true;
    this.phase = phase;
    return { messageId: id, messageIds: messages.map((m) => m.messageId), complete };
  }

  /**
   * Drop the progress message when we posted a separate reply instead
   * (best-effort). Falls back to a blank minimal embed edit.
   */
  async discard(): Promise<void> {
    if (!this.messageId) {
      this.dispose();
      return;
    }
    this.stopTicker();
    const id = this.messageId;
    this.closed = true;
    if (this.outbound.deleteMessage) {
      await this.outbound.deleteMessage({
        channelId: this.channelId,
        messageId: id,
      });
      return;
    }
    if (this.outbound.editMessage) {
      await this.outbound.editMessage({
        channelId: this.channelId,
        messageId: id,
        content: null,
        embed: {
          description: "·",
          color: THINKING_COLORS.working,
        },
        components: null,
      });
      return;
    }
  }

  /** Stop ticker without a final edit (tests / abort). */
  dispose(): void {
    this.stopTicker();
    this.closed = true;
  }
}
