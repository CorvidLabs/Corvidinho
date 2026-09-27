/**
 * DISCORD-3 live thinking status — thin steal from corvid-agent
 * progress-response / embeds (edit-in-place; no ProcessManager).
 */

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

export type DiscordEmbedPayload = {
  description: string;
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
};

export type ThinkingStatusOpts = {
  outbound: ThinkingOutbound;
  channelId: string;
  replyToMessageId?: string;
  sessionId: string;
  /** LLM model id shown in the footer when known (DISCORD-3.a). */
  model?: string;
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
    this.debounceMs = opts.debounceMs ?? 3000;
    this.tickMs = opts.tickMs ?? 3000;
    this.now = opts.now ?? (() => Date.now());
    this.startedAt = this.now();
  }

  get progressMessageId(): string | null {
    return this.messageId;
  }

  private snapshot(over: Partial<ThinkingSnapshot> = {}): ThinkingSnapshot {
    return {
      phase: over.phase ?? this.phase,
      tool: over.tool ?? this.tool,
      description: over.description ?? this.description,
      tokens: over.tokens ?? this.tokens,
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
    extras?: { plumbing?: string; model?: string },
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
    extras?: { plumbing?: string; model?: string },
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
   * (Choose stub or answer), clearing the thinking embed. Returns the message
   * id on success; null when editMessage is unavailable or edit fails (caller
   * should fall back to a new reply).
   */
  async finalizeContent(opts: {
    content: string;
    components?: unknown[];
    mentionUserIds?: string[];
  }): Promise<{ messageId: string } | null> {
    if (this.closed && !this.messageId) return null;
    this.stopTicker();
    const id = this.messageId;
    // Only close on success so callers can fall back to done()/fail()+reply
    // when editMessage is missing or the edit fails (DISCORD-ASK-7).
    if (!id || !this.outbound.editMessage) return null;
    const ok = await this.outbound.editMessage({
      channelId: this.channelId,
      messageId: id,
      content: opts.content,
      embed: null,
      components: opts.components ?? null,
      mentionUserIds: opts.mentionUserIds,
    });
    if (!ok) return null;
    this.closed = true;
    this.phase = "done";
    return { messageId: id };
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
