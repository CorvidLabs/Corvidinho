/**
 * `gif-search` through GIPHY (PLUGIN-8 / PLUGIN-9 / REQ-plugins-3182, #318
 * slice B). PLUGIN-8 (re-confirmed 2026-09-30 because Tenor is shut down):
 * "It can find a GIF through GIPHY, with the safety filter at medium, and post
 * it as a link when asked."
 *
 * Provider choice: GIPHY's Tenor-compatible search (`GET
 * https://api.giphy.com/v2/search`, developers.giphy.com/docs/api/tenor-migration),
 * not the native `/v1/gifs/search`. Its `contentfilter=medium` is documented
 * as exactly "G, PG" (off = G/PG/PG-13/R, low = G/PG/PG-13, high = G), which
 * is Leif's "safety filter at medium" word for word; the native `rating`
 * parameter's docs do not say whether `pg` also returns G. The filter is a
 * fixed constant set on a URL built from scratch, so no query text or flag
 * can change it (`--rating` / `--contentfilter` are usage errors, and a
 * query holding `&contentfilter=off` is only ever the `q` value).
 *
 * - Key: `GIPHY_API_KEY` from the run's env only, no default. GIPHY takes it
 *   in the URL (`key=`), so the request URL is never returned, shown,
 *   logged or audited (the keyed JSON GET never echoes it, and every string
 *   this module returns is scrubbed for secret shapes and the values of set
 *   secret env vars as its last step).
 * - Requests: the keyed JSON GET (`plugins/web/api.ts`, REQ-plugins-3181):
 *   https only, `api.giphy.com` only (checked before DNS), the pinned
 *   public-address check, every redirect refused, JSON bodies up to 1 MiB,
 *   one 15 s deadline.
 * - Results: at most `--limit` GIPHY results in GIPHY's order, each a title
 *   and its `gif` / `tinygif` media link; a link is kept only when it is an
 *   https URL on a GIPHY media host (`GIPHY_MEDIA_HOSTS`) whose path and query
 *   hold only plain URL characters (so it cannot break out of a Discord link),
 *   its fragment dropped, and a result with no such link is dropped and
 *   counted (`dropped`), never a silent empty success. Nothing else is
 *   filtered or reordered here.
 * - Posting: only when someone asks for a GIF, it is shared as a link in the
 *   run's reply (Discord shows it from GIPHY); never downloaded, re-hosted or
 *   attached (GIPHY's terms, #318).
 * - SAFE-8: GIPHY's API is free-tier, so each search is recorded at $0 against
 *   the total daily cap (`reserveFlatSpend` with 0; the ledger takes a zero
 *   row). With the rolling window already past the cap it is stopped with
 *   the spend-cap ask like any other call.
 * - SAFE-6: a query carrying a secret-looking value is refused, never sent.
 */

import type { Database } from "bun:sqlite";
import { reserveFlatSpend, type FlatSpendOutcome } from "../../src/agent/spend.ts";
import type { HumanAsk } from "../../src/agent/types.ts";
import { stripInvisible } from "../../src/agent/untrusted.ts";
import { API_NOT_SENT_CODES, ApiRequestError, apiGetJson, type ApiGetDeps } from "../web/api.ts";
import { scrubOut } from "../web/search.ts";
import { fenceUntrusted, htmlToText, stripControls } from "../web/text.ts";
import { GIPHY_MEDIA_HOSTS } from "./hosts.ts";

export { GIPHY_MEDIA_HOSTS, hasGiphyMediaLink } from "./hosts.ts";

/** Env key holding the GIPHY API key (env only, no default). */
export const GIPHY_API_KEY_ENV = "GIPHY_API_KEY";
/** The one host `gif-search` may call (SAFE-7 per-command host allowlist). */
export const GIPHY_API_HOST = "api.giphy.com";
/** GIPHY's Tenor-compatible search endpoint. */
export const GIPHY_SEARCH_PATH = "/v2/search";
/** PLUGIN-8: the safety filter at medium, always sent (GIPHY maps it to G and PG). */
export const GIPHY_CONTENT_FILTER = "medium";
/** The ratings `contentfilter=medium` allows (GIPHY's documented mapping). */
export const GIPHY_ALLOWED_RATINGS = "G and PG";
/** The renditions asked for: the GIF and its small version. */
export const GIPHY_MEDIA_FILTER = "gif,tinygif";
/** GIPHY's recommended client identifier (fixed, not a secret). */
export const GIPHY_CLIENT_KEY = "corvidinho";
/** GIPHY's required attribution. */
export const GIPHY_ATTRIBUTION = "Powered By GIPHY";
/**
 * How a run shares a GIF (PLUGIN-8, "post it as a link when asked"): only
 * when someone asks for one, as a link, never a download or an attachment.
 */
export const GIF_POST_GUIDANCE =
  "Only when someone asks for a GIF, post one as a link in your reply (Discord shows it from GIPHY); " +
  "never download or attach it.";
/** SAFE-8: GIPHY is free-tier, so a search is recorded at $0. */
export const GIPHY_SEARCH_COST_MICRO_USD = 0;
/** Ledger label of a GIF search's spend row. */
export const GIPHY_SEARCH_SPEND_MODEL = "giphy-gif-search";

export const GIF_SEARCH_DEFAULT_LIMIT = 5;
export const GIF_SEARCH_MAX_LIMIT = 10;
/** GIPHY's search query limit (characters). */
export const GIF_SEARCH_MAX_QUERY_CHARS = 50;

/** Per-field caps on what one result shows. */
const MAX_TITLE_CHARS = 200;
const MAX_URL_CHARS = 2048;
/**
 * What a kept media link's path and query may hold: unreserved characters,
 * percent escapes and `/` (path) or `=` / `&` (query). No `(`, `)`, `[`, `]`,
 * `<`, `>`, `@`, `*`, `|` or spaces, so a link cannot become Discord markdown
 * (a masked link to another host, a mention) once the run pastes it.
 */
const MEDIA_PATH = /^\/[A-Za-z0-9._~%/-]*$/;
const MEDIA_QUERY = /^(\?[A-Za-z0-9._~%=&-]*)?$/;

/**
 * A key is 8–128 letters, digits, `_` or `-` (GIPHY keys are alphanumeric;
 * never echoed). At least 8 characters, so `redactSecretEnvValues` redacts it.
 */
const KEY_SHAPE = /^[A-Za-z0-9_-]{8,128}$/;

const ALLOWED_HOSTS: ReadonlySet<string> = new Set([GIPHY_API_HOST]);

export type GifSearchArgs = {
  query: string;
  limit: number;
};

export type GifHit = {
  title: string;
  /** The `gif` rendition, when GIPHY sent one on a media host. */
  gif?: string;
  /** The `tinygif` rendition, when GIPHY sent one on a media host. */
  tinygif?: string;
};

export type GifSearchErrorCode =
  | "usage"
  | "not-configured"
  | "secret"
  | "spend-cap"
  | "auth"
  | "bad-request"
  | "rate-limited"
  | "api-error"
  | "bad-response"
  | "unexpected"
  | ApiRequestError["code"];

export class GifSearchError extends Error {
  constructor(
    readonly code: GifSearchErrorCode,
    message: string,
    /** SAFE-8: the spend-cap ask (code `spend-cap` only). */
    readonly spendAsk?: HumanAsk,
  ) {
    super(message);
    this.name = "GifSearchError";
  }
}

export type GifSearchDeps = ApiGetDeps & {
  /** Env of the calling run (default `process.env`): the key and the SAFE-8 cap. */
  env?: NodeJS.ProcessEnv;
  /** Test seam: the SAFE-8 ledger DB. */
  spendDb?: Database;
  now?: () => number;
  signal?: AbortSignal;
};

export type GifSearchResult = {
  hits: GifHit[];
  /** GIPHY results left out because they had no valid GIPHY media link. */
  dropped: number;
  args: GifSearchArgs;
};

/** `giphyHits`' answer: the kept hits and how many results were left out. */
export type GifHits = {
  hits: GifHit[];
  dropped: number;
};

function usage(message: string): GifSearchError {
  return new GifSearchError(
    "usage",
    `${message} (gif-search <query words> | --query <text> [--limit 1-${GIF_SEARCH_MAX_LIMIT}]; ` +
      "the safety filter is fixed at medium; a term that starts with -- needs --query)",
  );
}

/**
 * `gif-search <query words…> | --query <text> [--limit N] [--json]`.
 * `--limit` must be a whole number 1–10 (default 5); any other `--flag`
 * (`--rating`, `--contentfilter` among them) is a usage error, so the filter
 * can never be changed and a term that starts with `--` goes in `--query`.
 * Query words and `--query` together, or `--query` / `--limit` given twice,
 * are usage errors (never a silently dropped part of the request).
 */
export function parseGifSearchArgs(argv: readonly string[]): GifSearchArgs {
  const words: string[] = [];
  const seen = new Set<string>();
  let query: string | undefined;
  let limitRaw: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") continue;
    if (a === "--query" || a === "--limit") {
      const v = argv[i + 1];
      if (v === undefined) throw usage(`${a} needs a value`);
      if (seen.has(a)) throw usage(`${a} given twice`);
      seen.add(a);
      i++;
      if (a === "--query") query = v;
      else limitRaw = v;
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
  if (text.length > GIF_SEARCH_MAX_QUERY_CHARS) {
    throw usage(`query over ${GIF_SEARCH_MAX_QUERY_CHARS} characters`);
  }
  let limit = GIF_SEARCH_DEFAULT_LIMIT;
  if (limitRaw !== undefined) {
    if (!/^\d{1,3}$/.test(limitRaw)) throw usage("--limit must be a whole number");
    limit = Number(limitRaw);
    if (limit < 1 || limit > GIF_SEARCH_MAX_LIMIT) {
      throw usage(`--limit must be 1-${GIF_SEARCH_MAX_LIMIT}`);
    }
  }
  return { query: text, limit };
}

/**
 * The GIPHY request URL (never returned, shown, logged or audited: it holds
 * the key). Built from scratch with `searchParams.set`, so the query is only
 * ever the `q` value and `contentfilter` is always `medium`.
 */
export function giphySearchUrl(args: GifSearchArgs, key: string): URL {
  const url = new URL(`https://${GIPHY_API_HOST}${GIPHY_SEARCH_PATH}`);
  url.searchParams.set("q", args.query);
  url.searchParams.set("key", key);
  url.searchParams.set("client_key", GIPHY_CLIENT_KEY);
  url.searchParams.set("limit", String(args.limit));
  url.searchParams.set("media_filter", GIPHY_MEDIA_FILTER);
  url.searchParams.set("contentfilter", GIPHY_CONTENT_FILTER);
  return url;
}

/** One line of GIPHY text: HTML reduced, controls and invisible characters gone, capped. */
function oneLine(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  const t = stripInvisible(htmlToText(raw.slice(0, max * 8))).replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * A GIPHY media link: https, no credentials, default port, an exact
 * `GIPHY_MEDIA_HOSTS` name (no trailing dot), a path and query of plain URL
 * characters only (`MEDIA_PATH` / `MEDIA_QUERY`), at most 2048 chars, with
 * any fragment dropped; else undefined.
 */
export function giphyMediaUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length > MAX_URL_CHARS) return undefined;
  let u: URL;
  try {
    u = new URL(stripInvisible(stripControls(raw)).trim());
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" || u.username || u.password) return undefined;
  if (u.port !== "" && u.port !== "443") return undefined;
  // Exact names only (the URL parser lower-cases them): no suffix match, no trailing dot.
  if (!GIPHY_MEDIA_HOSTS.has(u.hostname)) return undefined;
  // What follows the host is only plain URL characters, so the pasted link
  // cannot turn into Discord markdown pointing somewhere else.
  if (!MEDIA_PATH.test(u.pathname) || !MEDIA_QUERY.test(u.search)) return undefined;
  u.hash = "";
  return u.href.length > MAX_URL_CHARS ? undefined : u.href;
}

function renditionUrl(formats: unknown, name: "gif" | "tinygif"): string | undefined {
  if (!formats || typeof formats !== "object") return undefined;
  const r = (formats as Record<string, unknown>)[name];
  if (!r || typeof r !== "object") return undefined;
  return giphyMediaUrl((r as { url?: unknown }).url);
}

/**
 * GIPHY `results[]` → at most `max` hits in GIPHY's order. A result whose
 * `gif` and `tinygif` links are both missing or fail `giphyMediaUrl` is
 * dropped and counted in `dropped` (link validation only; nothing else is
 * filtered or reordered), so a search whose every result was left out never
 * looks like a real empty one. Throws `bad-response` / `api-error` when there
 * is no results list.
 */
export function giphyHits(json: unknown, max: number): GifHits {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : undefined;
  if (!body || !Array.isArray(body.results)) {
    // GIPHY's Tenor-compatible layer answers some errors with HTTP 200 and an
    // `error` field; its text is never shown.
    if (body && body.error !== undefined) {
      throw new GifSearchError("api-error", "GIPHY answered with an error instead of results");
    }
    throw new GifSearchError("bad-response", "GIPHY answered without a results list");
  }
  const hits: GifHit[] = [];
  let dropped = 0;
  for (const row of body.results as unknown[]) {
    if (hits.length >= max) break;
    if (!row || typeof row !== "object") {
      dropped++;
      continue;
    }
    const r = row as Record<string, unknown>;
    const gif = renditionUrl(r.media_formats, "gif");
    const tinygif = renditionUrl(r.media_formats, "tinygif");
    if (!gif && !tinygif) {
      dropped++;
      continue;
    }
    hits.push({
      title: oneLine(r.title, MAX_TITLE_CHARS) || "(untitled)",
      ...(gif ? { gif } : {}),
      ...(tinygif ? { tinygif } : {}),
    });
  }
  return { hits, dropped };
}

function fromApiError(e: ApiRequestError): GifSearchError {
  if (e.code === "http-status") {
    const status = e.status ?? 0;
    if (status === 401 || status === 403) {
      return new GifSearchError("auth", `GIPHY refused the key (HTTP ${status}); check ${GIPHY_API_KEY_ENV}`);
    }
    if (status === 429) {
      return new GifSearchError(
        "rate-limited",
        "GIPHY rate limit reached (HTTP 429; a beta key allows 100 calls an hour); try again later",
      );
    }
    if (status === 400 || status === 422) {
      return new GifSearchError("bad-request", `GIPHY refused the request parameters (HTTP ${status})`);
    }
    return new GifSearchError("http-status", `GIPHY answered HTTP ${status}`);
  }
  return new GifSearchError(e.code, e.message);
}

/** How a failed call is settled in the SAFE-8 ledger (always $0 here). */
function spendOutcomeFor(e: unknown): FlatSpendOutcome {
  if (e instanceof ApiRequestError) {
    if (API_NOT_SENT_CODES.has(e.code) || e.code === "http-status") return "not-billed";
  }
  return "unknown";
}

/**
 * One GIPHY GIF search. Throws `GifSearchError` on any refusal or failure
 * (none carries the key, the request URL or server text).
 */
export async function giphyGifSearch(argv: readonly string[], deps: GifSearchDeps = {}): Promise<GifSearchResult> {
  const env = deps.env ?? process.env;
  const key = env[GIPHY_API_KEY_ENV]?.trim() ?? "";
  if (!key) {
    throw new GifSearchError(
      "not-configured",
      `GIF search is not configured: set ${GIPHY_API_KEY_ENV} to find GIFs through GIPHY (PLUGIN-8)`,
    );
  }
  if (!KEY_SHAPE.test(key)) {
    throw new GifSearchError(
      "not-configured",
      `GIF search is not configured: ${GIPHY_API_KEY_ENV} is not a valid key (letters, digits, _ or -, 8-128 characters)`,
    );
  }
  const args = parseGifSearchArgs(argv);
  // SAFE-6: a query is sent to a third party, so it never carries a secret
  // (a vendor-key shape, or the value of a set secret env var, this key too),
  // not even split by a joiner or another format character.
  const bare = args.query.replace(/\p{Cf}/gu, "");
  if (scrubOut(args.query, env) !== args.query || scrubOut(bare, env) !== bare) {
    throw new GifSearchError(
      "secret",
      "refused: the query carries a secret-looking value (SAFE-6); it is not sent anywhere",
    );
  }
  // A run already stopped reserves nothing and sends nothing.
  if (deps.signal?.aborted) {
    throw new GifSearchError("aborted", "stopped: the calling run was interrupted");
  }
  const hold = reserveFlatSpend({
    env,
    provider: GIPHY_API_HOST,
    model: GIPHY_SEARCH_SPEND_MODEL,
    costMicroUsd: GIPHY_SEARCH_COST_MICRO_USD,
    ...(deps.spendDb ? { db: deps.spendDb } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  });
  if (hold.kind === "stopped") {
    // SAFE-14.a: amounts and settings only in the ask, never in the error.
    throw new GifSearchError("spend-cap", "refused: Work is paused for budget. (SAFE-8)", hold.ask);
  }
  let outcome: FlatSpendOutcome = "unknown";
  try {
    const res = await apiGetJson(
      {
        url: giphySearchUrl(args, key),
        allowedHosts: ALLOWED_HOSTS,
        ...(deps.signal ? { signal: deps.signal } : {}),
      },
      deps,
    );
    outcome = "billed";
    return { ...giphyHits(res.json, args.limit), args };
  } catch (e) {
    if (e instanceof GifSearchError) throw e;
    outcome = spendOutcomeFor(e);
    if (e instanceof ApiRequestError) throw fromApiError(e);
    // A fixed line: an unexpected error's own text could carry anything (the URL, the key).
    throw new GifSearchError("unexpected", "the GIF search failed unexpectedly");
  } finally {
    if (hold.kind === "held") hold.settle(outcome);
  }
}

/** The fenced body of a GIF search: numbered results, or `(no results)`. */
export function formatGifHits(hits: readonly GifHit[]): string {
  if (hits.length === 0) return "(no results)";
  return hits
    .map((h, i) =>
      [
        `${i + 1}. ${h.title}`,
        ...(h.gif ? [`   GIF: ${h.gif}`] : []),
        ...(h.tinygif ? [`   Small GIF: ${h.tinygif}`] : []),
      ].join("\n"),
    )
    .join("\n\n");
}

/**
 * Wrap a GIF search body in the untrusted web fence (SAFE-12). The fenced
 * string is scrubbed last (`scrubOut`), after the fence strips invisible
 * characters, so a key split by one of them is never rebuilt.
 */
export function fenceGifResults(body: string, env: NodeJS.ProcessEnv, id?: string): string {
  return scrubOut(fenceUntrusted(body, "giphy-search", id), env);
}
