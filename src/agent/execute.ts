/**
 * Thin provider-agnostic execute for `task run`.
 * Env-gated OpenAI-compatible chat when an API key is present; else demo stub.
 * Full LLM tool loop is a follow-up (dogfood issue) — do not invent HI here.
 */

import type { ExecuteFn, ExecuteResult } from "./types.ts";

export type LlmEnv = {
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
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
  return { apiKey, baseUrl, model };
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type CreateTaskExecuteOpts = {
  taskText?: string;
  /** Injectable fetch for tests. */
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
};

function demoExecute(attempt: number): ExecuteResult {
  // Synthetic file change so the prove-before-done gate exercises when enabled.
  return {
    summary: `demo task attempt ${attempt}`,
    filesChanged: ["src/cli.ts"],
  };
}

/**
 * Build the execute fn used by `corvidinho task run`.
 * No key → demo. Key → single chat completions call (no tools).
 */
export function createTaskExecute(opts: CreateTaskExecuteOpts = {}): ExecuteFn {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const taskText = opts.taskText?.trim() ?? "";

  return async ({ attempt, verifyFeedback, signal }) => {
    const llm = loadLlmEnv(env);
    if (!llm.apiKey) {
      return demoExecute(attempt);
    }

    const userParts = [
      taskText ? `Task:\n${taskText}` : "Task: (none provided)",
      verifyFeedback
        ? `\n\nPrevious verification feedback:\n${verifyFeedback.slice(0, 4000)}`
        : "",
      `\n\nAttempt ${attempt}. Reply with a concise status summary of what you would do. Do not claim files were edited unless you list them.`,
    ];
    const body = {
      model: llm.model,
      messages: [
        {
          role: "system",
          content:
            "You are Corvidinho, a Linux-first headless agent CLI stub. No tool loop yet — reply with a short plain-text summary only.",
        },
        { role: "user", content: userParts.join("") },
      ],
      temperature: 0.2,
    };

    const url = `${llm.baseUrl}/chat/completions`;
    let resp: Response;
    try {
      resp = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${llm.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        summary: `LLM request failed: ${msg}`,
        filesChanged: [],
      };
    }

    if (!resp.ok) {
      const text = (await resp.text().catch(() => "")).slice(0, 400);
      return {
        summary: `LLM HTTP ${resp.status}: ${text || resp.statusText}`,
        filesChanged: [],
      };
    }

    let data: unknown;
    try {
      data = await resp.json();
    } catch {
      return {
        summary: "LLM response was not JSON",
        filesChanged: [],
      };
    }

    const content = extractAssistantContent(data);
    return {
      summary: content || "(empty LLM reply)",
      // No tool loop yet — do not pretend files changed.
      filesChanged: [],
    };
  };
}

function extractAssistantContent(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first = choices[0] as { message?: { content?: unknown } };
  const content = first?.message?.content;
  if (typeof content === "string") return content.trim();
  return "";
}
