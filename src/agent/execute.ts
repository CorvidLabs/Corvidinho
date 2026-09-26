/**
 * Provider-agnostic execute for `task run`.
 * Env-gated OpenAI-compatible chat; when key + tier≠read, runs a thin tool loop
 * over allowlisted plugins (AGENT-3/5). Else demo stub for prove-before-done.
 * Secrets stay in env — never commit.
 */

import { loadFledgePlugins } from "../../plugins/fledge/index.ts";
import { loadBuiltins } from "../plugins/builtins.ts";
import { allowlistFromEnv } from "../plugins/env.ts";
import {
  resolveActingIsAdmin,
  roleSessionActive,
} from "../plugins/roles.ts";
import { runPlugin } from "../plugins/run.ts";
import {
  ASK_AGENT_SYSTEM_INSTRUCTIONS,
  ASK_TOOL_NAME,
  ASK_TOOL_RESULT_DETAIL,
  askExecuteResult,
  askFromToolArguments,
  withAskTool,
  type ChatToolDef,
} from "./ask.ts";
import type {
  AgentEvent,
  AgentTokenUsage,
  ExecuteFn,
  ExecuteResult,
} from "./types.ts";
import {
  loadProjectInstructions,
  projectInstructionsWarning,
  renderProjectInstructions,
  withProjectInstructions,
} from "./project-instructions.ts";
import {
  loadTierFromEnv,
  type CapabilityTier,
} from "./tier.ts";
import {
  argvFromToolArguments,
  buildOpenAiTools,
  filesChangedFromToolData,
  type OpenAiToolDef,
} from "./tools.ts";

export type LlmEnv = {
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  tier: CapabilityTier;
};

export function loadLlmEnv(env: NodeJS.ProcessEnv = process.env): LlmEnv {
  const apiKey =
    env.CORVIDINHO_LLM_API_KEY?.trim() ||
    env.OPENAI_API_KEY?.trim() ||
    undefined;
  const baseUrl = (
    env.CORVIDINHO_LLM_BASE_URL?.trim() || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = env.CORVIDINHO_LLM_MODEL?.trim() || "gpt-4o-mini";
  const tier = loadTierFromEnv(env, "tool");
  return { apiKey, baseUrl, model, tier };
}

/** Memory instructions embedded in the tool-loop system prompt (AGENT-7 / MEMORY-2/4). */
export const MEMORY_AGENT_SYSTEM_INSTRUCTIONS =
  "Memory (AGENT-7 / MEMORY-2/4): " +
  "(a) Trust any [Corvidinho memory for this Discord user ...] block prepended to the task — those are durable facts already stored for the acting user; use them. " +
  "(b) When the user states durable identity/person/project facts about themselves or others, call memory-store (argv e.g. [\"--category\",\"person\",\"--key\",\"identity\",\"Leif is the owner\"]). " +
  "(c) Before claiming you do not know who the user is or facts about them/people/projects, call memory-recall first (or use the injected block). " +
  "(d) Never invent memories that were not injected or returned by memory-recall. ";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type CreateTaskExecuteOpts = {
  taskText?: string;
  cwd?: string;
  /** Injectable fetch for tests. */
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
  /** Override capability tier (AGENT-5). */
  tier?: CapabilityTier;
  /** Default true — headless task run (SAFE-1). */
  nonInteractive?: boolean;
  allowlist?: ReadonlySet<string> | string[];
  /** Forward ToolCall / ToolResult / Text to the outer loop. */
  onEvent?: (event: AgentEvent) => void;
  /**
   * Running provider token totals across rounds and attempts, called after
   * each OpenAI-compatible response that carries `usage` (REQ-agent-073).
   */
  onUsage?: (totals: AgentTokenUsage) => void;
  /** Cap LLM↔tool rounds per execute attempt (default 8). */
  maxToolRounds?: number;
  /** When true, expose dangerous plugins in the catalog (still SAFE-1 gated). */
  includeDangerous?: boolean;
  /** Test seam: skip loadBuiltins when false. */
  loadPlugins?: boolean;
  /** Read AGENTS.md / CLAUDE.md from the project root into the prompt (AGENT-1). Default true. */
  projectInstructions?: boolean;
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCallPayload[];
  tool_call_id?: string;
};

type ToolCallPayload = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

function demoExecute(attempt: number): ExecuteResult {
  // Synthetic file change so the prove-before-done gate exercises when enabled.
  return {
    summary: `demo task attempt ${attempt}`,
    filesChanged: ["src/cli.ts"],
  };
}

/** ToolCall / ToolResult event name for a tool not in this run's catalog. */
export const UNKNOWN_TOOL_LABEL = "(unknown tool)";

function emit(
  onEvent: ((e: AgentEvent) => void) | undefined,
  event: AgentEvent,
): void {
  onEvent?.(event);
}

function toAllowSet(
  allowlist?: ReadonlySet<string> | string[],
): Set<string> {
  if (!allowlist) return new Set();
  if (allowlist instanceof Set) return new Set(allowlist);
  return new Set(allowlist);
}

/**
 * Build the execute fn used by `corvidinho task run`.
 * No key → demo. Key + read tier → single chat (no tools).
 * Key + tool/code → interruptible plugin tool loop.
 */
export function createTaskExecute(opts: CreateTaskExecuteOpts = {}): ExecuteFn {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const taskText = opts.taskText?.trim() ?? "";
  const cwd = opts.cwd ?? process.cwd();
  const nonInteractive = opts.nonInteractive ?? true;
  const allowlist = toAllowSet(opts.allowlist ?? allowlistFromEnv());
  const maxToolRounds = opts.maxToolRounds ?? 8;
  const includeDangerous = Boolean(opts.includeDangerous);
  const onEvent = opts.onEvent;
  const totals: AgentTokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  const onUsage = opts.onUsage
    ? (u: AgentTokenUsage) => {
        totals.promptTokens += u.promptTokens;
        totals.completionTokens += u.completionTokens;
        totals.totalTokens += u.totalTokens;
        opts.onUsage?.({ ...totals });
      }
    : undefined;
  if (opts.loadPlugins !== false) {
    loadBuiltins();
  }
  // AGENT-1: the project's own AGENTS.md / CLAUDE.md (src/agent/project-instructions.ts).
  const project =
    opts.projectInstructions === false ? null : loadProjectInstructions(cwd);
  const projectBlock = project ? renderProjectInstructions(project) : "";
  let projectNote = project ? projectInstructionsWarning(project) : null;

  return async ({ attempt, verifyFeedback, signal }) => {
    if (projectNote) {
      emit(onEvent, { type: "Text", text: projectNote });
      projectNote = null;
    }
    const llm = loadLlmEnv(env);
    const tier: CapabilityTier = opts.tier ?? llm.tier;

    if (!llm.apiKey) {
      return demoExecute(attempt);
    }

    if (tier === "read" || maxToolRounds <= 0) {
      return singleChatCompletion({
        llm: { ...llm, tier },
        fetchImpl,
        taskText,
        attempt,
        verifyFeedback,
        signal,
        tools: [],
        onUsage,
        projectBlock,
      });
    }

    if (includeDangerous && opts.loadPlugins !== false) {
      // FLEDGE-4: Fledge commands are all dangerous, so only discover them
      // when this run's catalog may offer dangerous tools.
      await loadFledgePlugins({ cwd, env });
    }
    let actingIsAdmin = true;
    if (roleSessionActive(env)) {
      actingIsAdmin = await resolveActingIsAdmin(env);
    }
    // AUTONOMY-1: ask-human rides along with the plugin catalog.
    const tools = withAskTool(
      buildOpenAiTools({ tier, includeDangerous, actingIsAdmin }),
    );
    return runToolLoop({
      llm: { ...llm, tier },
      fetchImpl,
      taskText,
      attempt,
      verifyFeedback,
      signal,
      tools,
      cwd,
      nonInteractive,
      allowlist,
      onEvent,
      onUsage,
      maxToolRounds,
      projectBlock,
    });
  };
}

type LoopArgs = {
  llm: LlmEnv;
  fetchImpl: FetchLike;
  taskText: string;
  attempt: number;
  verifyFeedback?: string;
  signal: AbortSignal;
  tools: ChatToolDef[];
  cwd: string;
  nonInteractive: boolean;
  allowlist: Set<string>;
  onEvent?: (event: AgentEvent) => void;
  onUsage?: (usage: AgentTokenUsage) => void;
  maxToolRounds: number;
  projectBlock: string;
};

async function runToolLoop(args: LoopArgs): Promise<ExecuteResult> {
  const {
    llm,
    fetchImpl,
    taskText,
    attempt,
    verifyFeedback,
    signal,
    tools,
    cwd,
    nonInteractive,
    allowlist,
    onEvent,
    onUsage,
    maxToolRounds,
    projectBlock,
  } = args;

  const filesChanged = new Set<string>();
  const toolNamesUsed: string[] = [];
  // SAFE-1 / AGENT-5: the model may only call tools offered in this run's
  // catalog (tier + danger filtered) — never an arbitrary registered name.
  const offered = new Set(tools.map((t) => t.function.name));
  let lastText = "";

  const system = withProjectInstructions(
    "You are Corvidinho, a Linux-first headless agent CLI. " +
    "Use the provided tools (project plugins) when they help complete the task. " +
    "Prefer SpecSync plugins (list/read/check/brief) before guessing about specs. " +
    "Dangerous tools may be denied in non-interactive mode unless allowlisted — do not invent ACCESS/bounty/MainNet. " +
    MEMORY_AGENT_SYSTEM_INSTRUCTIONS +
    ASK_AGENT_SYSTEM_INSTRUCTIONS +
    "When finished, reply with a concise plain-text summary of what you did (no tool call). " +
    "Do not claim files were edited unless a tool result reported filesChanged.",
    projectBlock,
  );

  const userParts = [
    taskText ? `Task:\n${taskText}` : "Task: (none provided)",
    verifyFeedback
      ? `\n\nPrevious verification feedback:\n${verifyFeedback.slice(0, 4000)}`
      : "",
    `\n\nAttempt ${attempt}. Capability tier: ${llm.tier}. Tools available: ${tools.length}.`,
  ];

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userParts.join("") },
  ];

  for (let round = 1; round <= maxToolRounds; round++) {
    if (signal.aborted) {
      return {
        summary: lastText || `tool loop aborted (round ${round})`,
        filesChanged: [...filesChanged],
      };
    }

    const completion = await chatCompletions({
      llm,
      fetchImpl,
      messages,
      tools,
      signal,
      onUsage,
    });

    if (!completion.ok) {
      return {
        summary: completion.error,
        filesChanged: [...filesChanged],
      };
    }

    const msg = completion.message;
    messages.push(msg);

    const content = (msg.content ?? "").trim();
    if (content) {
      lastText = content;
      emit(onEvent, { type: "Text", text: content });
    }

    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) {
      return {
        summary:
          lastText ||
          (toolNamesUsed.length
            ? `Completed after tools: ${toolNamesUsed.join(", ")}`
            : "(empty LLM reply)"),
        filesChanged: [...filesChanged],
      };
    }

    for (const tc of calls) {
      if (signal.aborted) {
        return {
          summary: lastText || "tool loop aborted during tool dispatch",
          filesChanged: [...filesChanged],
        };
      }

      const name = tc.function?.name?.trim() || "(unknown)";
      // Events feed live bridge status (DISCORD-3): only a catalog name is
      // shown; a made-up name stays in the refusal detail, not the status.
      const eventName = offered.has(name) ? name : UNKNOWN_TOOL_LABEL;
      const rawArgs = tc.function?.arguments ?? "{}";
      const argv = argvFromToolArguments(rawArgs);
      emit(onEvent, { type: "ToolCall", name: eventName, args: rawArgs });

      // AUTONOMY-1: ask-human ends the run with the question (never "done").
      const asked =
        name === ASK_TOOL_NAME && offered.has(name)
          ? askFromToolArguments(rawArgs)
          : null;
      if (asked?.ok) {
        emit(onEvent, {
          type: "ToolResult",
          name,
          success: true,
          detail: ASK_TOOL_RESULT_DETAIL,
        });
        return askExecuteResult(asked.ask, filesChanged);
      }

      let result;
      try {
        result = asked
          ? asked.refusal
          : offered.has(name)
          ? await runPlugin({
              name,
              args: argv,
              cwd,
              json: true,
              nonInteractive,
              allowlist,
            })
          : {
              ok: false,
              error: `refused: tool "${name}" is not offered in this run's catalog (SAFE-1 / capability tier)`,
              exitCode: 2,
            };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        result = { ok: false, error: errMsg, exitCode: 1 };
      }

      toolNamesUsed.push(name);
      for (const f of filesChangedFromToolData(result.data)) {
        filesChanged.add(f);
      }

      const detail = result.ok
        ? truncate(stringifyToolPayload(result), 2000)
        : truncate(result.error ?? "tool failed", 2000);
      emit(onEvent, {
        type: "ToolResult",
        name: eventName,
        success: Boolean(result.ok),
        detail,
      });

      messages.push({
        role: "tool",
        tool_call_id: tc.id || name,
        content: stringifyToolPayload(result),
      });
    }
  }

  return {
    summary:
      (lastText ? `${lastText}\n\n` : "") +
      `Stopped after ${maxToolRounds} tool rounds` +
      (toolNamesUsed.length
        ? ` (tools: ${[...new Set(toolNamesUsed)].join(", ")})`
        : ""),
    filesChanged: [...filesChanged],
  };
}

async function singleChatCompletion(opts: {
  llm: LlmEnv;
  fetchImpl: FetchLike;
  taskText: string;
  attempt: number;
  verifyFeedback?: string;
  signal: AbortSignal;
  tools: OpenAiToolDef[];
  onUsage?: (usage: AgentTokenUsage) => void;
  projectBlock: string;
}): Promise<ExecuteResult> {
  const userParts = [
    opts.taskText ? `Task:\n${opts.taskText}` : "Task: (none provided)",
    opts.verifyFeedback
      ? `\n\nPrevious verification feedback:\n${opts.verifyFeedback.slice(0, 4000)}`
      : "",
    `\n\nAttempt ${opts.attempt}. Reply with a concise status summary. Do not claim files were edited.`,
  ];
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: withProjectInstructions(
        "You are Corvidinho on the read tier (no tools). Reply with a short plain-text summary only.",
        opts.projectBlock,
      ),
    },
    { role: "user", content: userParts.join("") },
  ];
  const completion = await chatCompletions({
    llm: opts.llm,
    fetchImpl: opts.fetchImpl,
    messages,
    tools: opts.tools,
    signal: opts.signal,
    onUsage: opts.onUsage,
  });
  if (!completion.ok) {
    return { summary: completion.error, filesChanged: [] };
  }
  const content = (completion.message.content ?? "").trim();
  return {
    summary: content || "(empty LLM reply)",
    filesChanged: [],
  };
}

async function chatCompletions(opts: {
  llm: LlmEnv;
  fetchImpl: FetchLike;
  messages: ChatMessage[];
  tools: ChatToolDef[];
  signal: AbortSignal;
  onUsage?: (usage: AgentTokenUsage) => void;
}): Promise<
  | { ok: true; message: ChatMessage }
  | { ok: false; error: string }
> {
  const body: Record<string, unknown> = {
    model: opts.llm.model,
    messages: opts.messages,
    temperature: 0.2,
  };
  if (opts.tools.length > 0) {
    body.tools = opts.tools;
  }

  const url = `${opts.llm.baseUrl}/chat/completions`;
  let resp: Response;
  try {
    resp = await opts.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.llm.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `LLM request failed: ${msg}` };
  }

  if (!resp.ok) {
    const text = (await resp.text().catch(() => "")).slice(0, 400);
    return {
      ok: false,
      error: `LLM HTTP ${resp.status}: ${text || resp.statusText}`,
    };
  }

  let data: unknown;
  try {
    data = await resp.json();
  } catch {
    return { ok: false, error: "LLM response was not JSON" };
  }

  // Tokens were spent even if the message shape is off — report first.
  const usage = extractUsage(data);
  if (usage) opts.onUsage?.(usage);

  const message = extractAssistantMessage(data);
  if (!message) {
    return { ok: false, error: "LLM response missing assistant message" };
  }
  return { ok: true, message };
}

function usageCount(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0
    ? Math.floor(v)
    : undefined;
}

/**
 * Read OpenAI-compatible `usage` (prompt_tokens / completion_tokens /
 * total_tokens). Null when the provider omitted it.
 */
export function extractUsage(data: unknown): AgentTokenUsage | null {
  if (!data || typeof data !== "object") return null;
  const raw = (data as { usage?: unknown }).usage;
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const prompt = usageCount(u.prompt_tokens);
  const completion = usageCount(u.completion_tokens);
  const total = usageCount(u.total_tokens);
  if (prompt === undefined && completion === undefined && total === undefined) {
    return null;
  }
  const promptTokens = prompt ?? 0;
  const completionTokens = completion ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: total ?? promptTokens + completionTokens,
  };
}

function extractAssistantMessage(data: unknown): ChatMessage | null {
  if (!data || typeof data !== "object") return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as { message?: Record<string, unknown> };
  const raw = first?.message;
  if (!raw || typeof raw !== "object") return null;

  const content =
    typeof raw.content === "string"
      ? raw.content
      : raw.content == null
        ? null
        : String(raw.content);

  const toolCallsRaw = raw.tool_calls;
  const tool_calls: ToolCallPayload[] = [];
  if (Array.isArray(toolCallsRaw)) {
    for (const tc of toolCallsRaw) {
      if (!tc || typeof tc !== "object") continue;
      const t = tc as {
        id?: unknown;
        type?: unknown;
        function?: { name?: unknown; arguments?: unknown };
      };
      const name =
        typeof t.function?.name === "string" ? t.function.name : "";
      const args =
        typeof t.function?.arguments === "string"
          ? t.function.arguments
          : "{}";
      tool_calls.push({
        id: typeof t.id === "string" ? t.id : `call_${tool_calls.length}`,
        type: "function",
        function: { name, arguments: args },
      });
    }
  }

  return {
    role: "assistant",
    content,
    tool_calls: tool_calls.length ? tool_calls : undefined,
  };
}

function stringifyToolPayload(result: {
  ok: boolean;
  data?: unknown;
  message?: string;
  error?: string;
  exitCode?: number;
}): string {
  const payload = {
    ok: result.ok,
    exitCode: result.exitCode ?? (result.ok ? 0 : 1),
    message: result.message,
    error: result.error,
    data: result.data,
  };
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({
      ok: result.ok,
      error: result.error ?? "unserializable tool result",
    });
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n)}…`;
}
