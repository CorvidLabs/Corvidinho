/**
 * AUTONOMY-1/2 (#44): ask the human instead of guessing or going quiet.
 *
 * `ask-human` is an agent-level tool, not a plugin: the tool loop intercepts
 * the call and ends the run with `ExecuteResult.ask`, and runTask returns
 * state "blocked" with `TaskResult.ask` (never "done"). A run that gives up
 * after verify retries keeps state "failed" (AGENT-4) and carries a "stuck"
 * ask so bridges can surface a question and ping the configured owner.
 *
 * The question is model-written text: it is data for the human, capped here
 * and scrubbed / mention-restricted by bridges before posting.
 */

import type { PluginHandlerResult } from "../plugins/types.ts";
import type { OpenAiToolDef } from "./tools.ts";
import type {
  AskOption,
  ExecuteResult,
  HumanAsk,
  HumanAskReason,
  TaskResult,
} from "./types.ts";
import { resolveAskOptions } from "./ask-options.ts";

export const ASK_TOOL_NAME = "ask-human";

/** Longest question kept (chars); longer text is cut with `…`. */
export const ASK_QUESTION_MAX = 1500;

/** Summary prefix so CLI / JSON / fallback readers see the question. */
export const ASK_SUMMARY_PREFIX = "Needs your input:";

/** ToolResult detail when ask-human ends the run. */
export const ASK_TOOL_RESULT_DETAIL = "question sent to the requester; run stopped";

/** Tool-loop system prompt rule (AUTONOMY-1/7). */
export const ASK_AGENT_SYSTEM_INSTRUCTIONS =
  "Clarifying questions (AUTONOMY-1 / DISCORD-ASK): when the task cannot proceed without a human choice " +
  "(missing intent, an ambiguous requirement, a decision only a human can make), call " +
  `${ASK_TOOL_NAME} with one short, specific question instead of guessing, inventing ` +
  "acceptance criteria, or claiming done. Calling it ends this run and sends the question " +
  "to the requester. When the choice fits a short list (2–5 options), pass an `options` " +
  "array of short labels (or number the choices in the question) so Discord can show " +
  "ephemeral buttons — do not ask them to reply with a public MCQ. Free-text only when " +
  "options cannot be listed. " +
  "Impossible or joke asks (AUTONOMY-7): for clearly impossible or joke requests " +
  '(e.g. "build a free energy / dark matter / zero-point generator"), prefer a witty ' +
  "public-safe decline or a tiny toy demo — do not open with ask-human or a long formal " +
  "MCQ unless they clearly want a real utility. ";

export type AskToolDef = {
  type: "function";
  function: {
    name: typeof ASK_TOOL_NAME;
    description: string;
    parameters: {
      type: "object";
      properties: {
        question: { type: "string"; description: string };
        options: {
          type: "array";
          description: string;
          items: { type: "string" };
        };
      };
      required: ["question"];
    };
  };
};

/** Tool definitions sent to the provider: plugin tools plus ask-human. */
export type ChatToolDef = OpenAiToolDef | AskToolDef;

export function buildAskToolDef(): AskToolDef {
  return {
    type: "function",
    function: {
      name: ASK_TOOL_NAME,
      description:
        "Ask the human one clarifying question when the task cannot proceed without their choice. " +
        "Ends this run; the requester sees an ephemeral Discord button UI when you pass options " +
        "(or number choices in the question). Owner is pinged only when stuck. " +
        "Do not use this as the first response to joke/impossible physics toy asks (AUTONOMY-7).",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description:
              "One short, specific question for the human (plain text). Prefer listing 2–5 choices via options.",
          },
          options: {
            type: "array",
            description:
              "Short choice labels (2–5) for Discord buttons. Prefer this over asking them to reply with a number.",
            items: { type: "string" },
          },
        },
        required: ["question"],
      },
    },
  };
}

/**
 * Plugin catalog + ask-human. A plugin that happens to share the name is
 * dropped so the provider never sees two tools with one name.
 */
export function withAskTool(tools: readonly OpenAiToolDef[]): ChatToolDef[] {
  return [
    ...tools.filter((t) => t.function.name !== ASK_TOOL_NAME),
    buildAskToolDef(),
  ];
}

/** Trim, drop control characters, cap at ASK_QUESTION_MAX. Empty ⇒ "". */
export function normalizeQuestion(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (cleaned.length <= ASK_QUESTION_MAX) return cleaned;
  return `${cleaned.slice(0, ASK_QUESTION_MAX - 1)}…`;
}

export type AskToolOutcome =
  | { ok: true; ask: HumanAsk }
  | { ok: false; refusal: PluginHandlerResult };

/**
 * Parse ask-human arguments: `{"question": "..."}` (also `argv` array /
 * string, or a bare JSON string). An empty question is refused back to the
 * model so it cannot end the run with nothing to ask.
 */
export function askFromToolArguments(raw: string | undefined): AskToolOutcome {
  let parsed: unknown = raw ?? "";
  if (typeof raw === "string" && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }
  let text: unknown = parsed;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    text = o.question ?? o.argv ?? o.text;
  }
  if (Array.isArray(text)) {
    text = text.filter((x) => typeof x === "string").join(" ");
  }
  const question = normalizeQuestion(text);
  if (!question) {
    return {
      ok: false,
      refusal: {
        ok: false,
        error: `${ASK_TOOL_NAME} needs a non-empty "question" string`,
        exitCode: 2,
      },
    };
  }
  let options: AskOption[] | undefined;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    options = resolveAskOptions({ options: o.options ?? o.choices, question });
  } else {
    options = resolveAskOptions({ question });
  }
  const ask: HumanAsk = { reason: "clarify", question };
  if (options) ask.options = options;
  return { ok: true, ask };
}

/** `Needs your input: <question>` */
export function formatAskSummary(ask: HumanAsk): string {
  return `${ASK_SUMMARY_PREFIX} ${ask.question}`;
}

/** ExecuteResult for a tool loop that stopped on ask-human. */
export function askExecuteResult(
  ask: HumanAsk,
  filesChanged: Iterable<string>,
): ExecuteResult {
  return { summary: formatAskSummary(ask), filesChanged: [...filesChanged], ask };
}

/**
 * TaskResult for a run that stopped to ask (state "blocked"). Verify did not
 * run, so it is reported as skipped — the run is not claimed done.
 */
export function blockedTaskResult(
  exec: ExecuteResult & { ask: HumanAsk },
  attempts: number,
): TaskResult {
  return {
    summary: exec.summary,
    filesChanged: [...exec.filesChanged],
    verified: false,
    verifySkipped: true,
    cancelled: false,
    state: "blocked",
    attempts,
    ask: exec.ask,
  };
}

/** Stuck ask when verification still fails after every retry (AUTONOMY-2). */
export function stuckAfterVerifyAsk(maxRetries: number): HumanAsk {
  return {
    reason: "stuck",
    question: `Verification still fails after ${maxRetries} retries. How should I proceed?`,
  };
}

const REASONS: ReadonlySet<string> = new Set<HumanAskReason>([
  "clarify",
  "stuck",
  // SAFE-8 (#98): the runner stopped before a provider call at the spend cap.
  "spend-cap",
]);

/**
 * Read an ask from a parsed `result` frame (child process output). Returns
 * undefined unless the shape is valid; the question is re-normalized.
 */
export function askFromUnknown(raw: unknown): HumanAsk | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.reason !== "string" || !REASONS.has(o.reason)) return undefined;
  const question = normalizeQuestion(o.question);
  if (!question) return undefined;
  const ask: HumanAsk = { reason: o.reason as HumanAskReason, question };
  const options = resolveAskOptions({ options: o.options ?? o.choices, question });
  if (options) ask.options = options;
  return ask;
}
