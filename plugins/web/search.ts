/**
 * `web-search` through Brave (PLUGIN-7 / PLUGIN-9 / REQ-plugins-318, #318).
 * Steal: corvid-agent `server/lib/web-search.ts` (Brave `web/search`,
 * `X-Subscription-Token`, count 1–20, freshness pd|pw|pm|py), without its
 * gaps: no key is a clear "not configured" result (never a silent `[]`),
 * `--count` must be an integer, results reach the model only inside the
 * untrusted fence, and one search is one request (no multi-search that
 * swallows errors). Deep research is not built.
 *
 * - Key: `BRAVE_SEARCH_API_KEY` from the run's env only, no default; it goes
 *   out only as the `X-Subscription-Token` header to `api.search.brave.com`
 *   (the keyed JSON GET, `api.ts`, REQ-plugins-3181) and every field this
 *   module returns is scrubbed for secret shapes and the values of set secret
 *   env vars, so the key can never come back.
 * - `safesearch=moderate` is always sent explicitly (Leif, #318).
 * - SAFE-8: each search reserves `BRAVE_SEARCH_COST_MICRO_USD` (about $0.005)
 *   against the total daily cap before the request (`reserveFlatSpend`).
 * - SAFE-6: a query carrying a secret-looking value is refused, never sent.
 */

import type { Database } from "bun:sqlite";
import { reserveFlatSpend, type FlatSpendOutcome } from "../../src/agent/spend.ts";
import type { HumanAsk } from "../../src/agent/types.ts";
import { stripInvisible } from "../../src/agent/untrusted.ts";
import { redactSecretEnvValues, scrubSecrets } from "../../src/store/scrub.ts";
import { API_NOT_SENT_CODES, ApiRequestError, apiGetJson, type ApiGetDeps } from "./api.ts";
import { fenceUntrusted, htmlToText, stripControls } from "./text.ts";

/** Env key holding the Brave Search API key (env only, no default). */
export const BRAVE_SEARCH_API_KEY_ENV = "BRAVE_SEARCH_API_KEY";
/** The one host `web-search` may call (SAFE-7 per-command host allowlist). */
export const BRAVE_SEARCH_HOST = "api.search.brave.com";
export const BRAVE_SEARCH_PATH = "/res/v1/web/search";
/** Always sent explicitly (Leif, #318). */
export const BRAVE_SAFESEARCH = "moderate";
/** SAFE-8 reservation per search: about $0.005 (Leif, #318), in micro-USD. */
export const BRAVE_SEARCH_COST_MICRO_USD = 5_000;
/** Ledger labels of a search's spend row. */
export const BRAVE_SEARCH_SPEND_MODEL = "brave-web-search";
/** Brave's attribution for its free credit ("Powered by Brave"). */
export const BRAVE_ATTRIBUTION = "Powered by Brave Search";

export const WEB_SEARCH_DEFAULT_COUNT = 5;
export const WEB_SEARCH_MAX_COUNT = 20;
/** Brave's own query limits. */
export const WEB_SEARCH_MAX_QUERY_CHARS = 400;
export const WEB_SEARCH_MAX_QUERY_WORDS = 50;
export const WEB_SEARCH_FRESHNESS = ["pd", "pw", "pm", "py"] as const;
export type WebSearchFreshness = (typeof WEB_SEARCH_FRESHNESS)[number];

/** Per-field caps on what one hit shows. */
const MAX_TITLE_CHARS = 200;
const MAX_DESCRIPTION_CHARS = 500;
const MAX_URL_CHARS = 2048;
const MAX_AGE_CHARS = 64;

/** A key is printable ASCII without spaces, 8–256 chars (never echoed). */
const KEY_SHAPE = /^[\x21-\x7e]{8,256}$/;

const ALLOWED_HOSTS: ReadonlySet<string> = new Set([BRAVE_SEARCH_HOST]);

export type WebSearchArgs = {
  query: string;
  count: number;
  freshness?: WebSearchFreshness;
};

export type WebSearchHit = {
  title: string;
  url: string;
  description: string;
  age?: string;
};

export type WebSearchErrorCode =
  | "usage"
  | "not-configured"
  | "secret"
  | "spend-cap"
  | "auth"
  | "bad-request"
  | "rate-limited"
  | "unexpected"
  | ApiRequestError["code"];

export class WebSearchError extends Error {
  constructor(
    readonly code: WebSearchErrorCode,
    message: string,
    /** SAFE-8: the spend-cap ask (code `spend-cap` only). */
    readonly spendAsk?: HumanAsk,
  ) {
    super(message);
    this.name = "WebSearchError";
  }
}

export type WebSearchDeps = ApiGetDeps & {
  /** Env of the calling run (default `process.env`): the key and the SAFE-8 cap. */
  env?: NodeJS.ProcessEnv;
  /** Test seam: the SAFE-8 ledger DB. */
  spendDb?: Database;
  now?: () => number;
  signal?: AbortSignal;
};

export type WebSearchResult = {
  hits: WebSearchHit[];
  args: WebSearchArgs;
};

function usage(message: string): WebSearchError {
  return new WebSearchError(
    "usage",
    `${message} (web-search <query words> | --query <text> [--count 1-${WEB_SEARCH_MAX_COUNT}] ` +
      "[--freshness pd|pw|pm|py]; a term that starts with -- needs --query)",
  );
}

/**
 * `web-search <query words…> | --query <text> [--count N] [--freshness f] [--json]`.
 * `--count` must be a whole number 1–20 (default 5); `--freshness` one of
 * pd, pw, pm, py; any other `--flag` is a usage error, so a term that starts
 * with `--` goes in `--query`. Query words and `--query` together are a usage
 * error (never a silently dropped part of the query).
 */
export function parseWebSearchArgs(argv: readonly string[]): WebSearchArgs {
  const words: string[] = [];
  let query: string | undefined;
  let countRaw: string | undefined;
  let freshness: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") continue;
    if (a === "--query" || a === "--count" || a === "--freshness") {
      const v = argv[i + 1];
      if (v === undefined) throw usage(`${a} needs a value`);
      i++;
      if (a === "--query") query = v;
      else if (a === "--count") countRaw = v;
      else freshness = v;
      continue;
    }
    if (a.startsWith("--")) throw usage(`unknown option ${/^--[a-z-]{1,20}$/.test(a) ? a : "(flag)"}`);
    words.push(a);
  }
  if (query !== undefined && words.length > 0) {
    throw usage("use either query words or --query, not both");
  }
  // Controls and invisible characters go, so the SAFE-6 check sees the text
  // that is sent (a zero-width split cannot hide a secret from it).
  const text = stripInvisible(stripControls(query ?? words.join(" ")))
    .replace(/\s+/g, " ")
    .trim();
  if (!text) throw usage("missing query");
  if (text.length > WEB_SEARCH_MAX_QUERY_CHARS) {
    throw usage(`query over ${WEB_SEARCH_MAX_QUERY_CHARS} characters`);
  }
  if (text.split(" ").length > WEB_SEARCH_MAX_QUERY_WORDS) {
    throw usage(`query over ${WEB_SEARCH_MAX_QUERY_WORDS} words`);
  }
  let count = WEB_SEARCH_DEFAULT_COUNT;
  if (countRaw !== undefined) {
    if (!/^\d{1,3}$/.test(countRaw)) throw usage("--count must be a whole number");
    count = Number(countRaw);
    if (count < 1 || count > WEB_SEARCH_MAX_COUNT) {
      throw usage(`--count must be 1-${WEB_SEARCH_MAX_COUNT}`);
    }
  }
  if (freshness !== undefined && !(WEB_SEARCH_FRESHNESS as readonly string[]).includes(freshness)) {
    throw usage("--freshness must be pd, pw, pm or py");
  }
  return {
    query: text,
    count,
    ...(freshness ? { freshness: freshness as WebSearchFreshness } : {}),
  };
}

/** The Brave request URL (never returned or shown). */
export function braveSearchUrl(args: WebSearchArgs): URL {
  const url = new URL(`https://${BRAVE_SEARCH_HOST}${BRAVE_SEARCH_PATH}`);
  url.searchParams.set("q", args.query);
  url.searchParams.set("count", String(args.count));
  url.searchParams.set("safesearch", BRAVE_SAFESEARCH);
  if (args.freshness) url.searchParams.set("freshness", args.freshness);
  return url;
}

/**
 * Secret shapes and set secret env values removed (the key among them). It
 * is the last step on every string `web-search` returns: a transform after
 * it (the fence's invisible-character strip, a control strip) could rebuild
 * a key that an invisible or control character had split.
 */
export function scrubOut(text: string, env: NodeJS.ProcessEnv): string {
  return scrubSecrets(redactSecretEnvValues(text, env));
}

/**
 * One line of third-party text: HTML reduced to text (entities decoded),
 * controls and invisible characters (zero-width, bidi, soft hyphen, tag
 * characters) gone, capped.
 */
function oneLine(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  const t = stripInvisible(htmlToText(raw.slice(0, max * 8))).replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** An http(s) URL without credentials, at most 2048 chars, else undefined. */
function resultUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length > MAX_URL_CHARS) return undefined;
  let u: URL;
  try {
    u = new URL(stripInvisible(stripControls(raw)).trim());
  } catch {
    return undefined;
  }
  if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password) return undefined;
  return u.href.length > MAX_URL_CHARS ? undefined : u.href;
}

/** Brave `web.results[]` → at most `max` hits (a hit without a usable URL is dropped). */
export function braveHits(json: unknown, max: number): WebSearchHit[] {
  const web = (json as { web?: { results?: unknown } } | null)?.web;
  const rows = Array.isArray(web?.results) ? (web.results as unknown[]) : [];
  const hits: WebSearchHit[] = [];
  for (const row of rows) {
    if (hits.length >= max) break;
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const url = resultUrl(r.url);
    if (!url) continue;
    const age = oneLine(r.age, MAX_AGE_CHARS);
    hits.push({
      title: oneLine(r.title, MAX_TITLE_CHARS) || "(untitled)",
      url,
      description: oneLine(r.description, MAX_DESCRIPTION_CHARS),
      ...(age ? { age } : {}),
    });
  }
  return hits;
}

/** Brave's fixed error code from a 422 body, never its free text. */
function braveErrorCode(body: unknown): string | undefined {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === "string" && /^[A-Z_]{1,64}$/.test(code) ? code : undefined;
}

function fromApiError(e: ApiRequestError): WebSearchError {
  if (e.code === "http-status") {
    const status = e.status ?? 0;
    const code = braveErrorCode(e.errorBody);
    if (status === 401 || status === 403 || code === "SUBSCRIPTION_TOKEN_INVALID") {
      return new WebSearchError(
        "auth",
        `Brave refused the key (HTTP ${status}); check ${BRAVE_SEARCH_API_KEY_ENV}`,
      );
    }
    if (status === 429) {
      return new WebSearchError("rate-limited", "Brave rate limit reached (HTTP 429); try again later");
    }
    if (status === 422) {
      return new WebSearchError("bad-request", "Brave refused the request parameters (HTTP 422)");
    }
    return new WebSearchError("http-status", `Brave answered HTTP ${status}`);
  }
  return new WebSearchError(e.code, e.message);
}

/** How a failed call counts against SAFE-8. */
function spendOutcomeFor(e: unknown): FlatSpendOutcome {
  if (e instanceof ApiRequestError) {
    if (API_NOT_SENT_CODES.has(e.code) || e.code === "http-status") return "not-billed";
  }
  return "unknown";
}

/**
 * One Brave web search. Throws `WebSearchError` on any refusal or failure
 * (none carries the key, the request URL or server text).
 */
export async function braveWebSearch(argv: readonly string[], deps: WebSearchDeps = {}): Promise<WebSearchResult> {
  const env = deps.env ?? process.env;
  const key = env[BRAVE_SEARCH_API_KEY_ENV]?.trim() ?? "";
  if (!key) {
    throw new WebSearchError(
      "not-configured",
      `web search is not configured: set ${BRAVE_SEARCH_API_KEY_ENV} to search the web through Brave (PLUGIN-7)`,
    );
  }
  if (!KEY_SHAPE.test(key)) {
    throw new WebSearchError(
      "not-configured",
      `web search is not configured: ${BRAVE_SEARCH_API_KEY_ENV} is not a valid key (printable, no spaces, 8-256 characters)`,
    );
  }
  const args = parseWebSearchArgs(argv);
  // SAFE-6: a query is sent to a third party, so it never carries a secret
  // (a vendor-key shape, or the value of a set secret env var, this key too),
  // not even split by a joiner or another format character.
  const bare = args.query.replace(/\p{Cf}/gu, "");
  if (scrubOut(args.query, env) !== args.query || scrubOut(bare, env) !== bare) {
    throw new WebSearchError(
      "secret",
      "refused: the query carries a secret-looking value (SAFE-6); it is not sent anywhere",
    );
  }
  // A run already stopped reserves nothing and sends nothing.
  if (deps.signal?.aborted) {
    throw new WebSearchError("aborted", "stopped: the calling run was interrupted");
  }
  const hold = reserveFlatSpend({
    env,
    provider: BRAVE_SEARCH_HOST,
    model: BRAVE_SEARCH_SPEND_MODEL,
    costMicroUsd: BRAVE_SEARCH_COST_MICRO_USD,
    ...(deps.spendDb ? { db: deps.spendDb } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  });
  if (hold.kind === "stopped") {
    // SAFE-14.a: amounts and settings only in the ask, never in the error.
    throw new WebSearchError("spend-cap", "refused: Work is paused for budget. (SAFE-8)", hold.ask);
  }
  let outcome: FlatSpendOutcome = "unknown";
  try {
    const res = await apiGetJson(
      {
        url: braveSearchUrl(args),
        allowedHosts: ALLOWED_HOSTS,
        headers: { "X-Subscription-Token": key },
        ...(deps.signal ? { signal: deps.signal } : {}),
      },
      deps,
    );
    outcome = "billed";
    return { hits: braveHits(res.json, args.count), args };
  } catch (e) {
    outcome = spendOutcomeFor(e);
    if (e instanceof ApiRequestError) throw fromApiError(e);
    // A fixed line: an unexpected error's own text could carry anything.
    throw new WebSearchError("unexpected", "the search failed unexpectedly");
  } finally {
    if (hold.kind === "held") hold.settle(outcome);
  }
}

/** The fenced body of a search: numbered hits, or `(no results)`. */
export function formatHits(hits: readonly WebSearchHit[]): string {
  if (hits.length === 0) return "(no results)";
  return hits
    .map((h, i) =>
      [
        `${i + 1}. ${h.title}`,
        `   URL: ${h.url}`,
        ...(h.description ? [`   ${h.description}`] : []),
        ...(h.age ? [`   Age: ${h.age}`] : []),
      ].join("\n"),
    )
    .join("\n\n");
}

/**
 * Wrap a search body in the untrusted web fence (SAFE-12). The fenced string
 * is scrubbed last (`scrubOut`), after the fence strips invisible characters,
 * so a key split by one of them is never rebuilt in what the model reads.
 */
export function fenceSearchResults(body: string, env: NodeJS.ProcessEnv, id?: string): string {
  return scrubOut(fenceUntrusted(body, "brave-search", id), env);
}
