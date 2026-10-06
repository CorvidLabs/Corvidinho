/**
 * Keyed JSON API GET (REQ-plugins-3181 / SAFE-7 / SAFE-6) — the one request
 * path for commands that call a fixed third-party JSON API with a secret key:
 * `web-search` (Brave, PLUGIN-7) and `gif-search` (GIPHY, PLUGIN-8,
 * `plugins/gif/giphy.ts`, whose key sits in the URL's query).
 *
 * Stricter than `web-fetch` (which stays as it is for any public host):
 *  - https only, no URL credentials, and the host must be on the calling
 *    command's own allowlist (default port only) — all checked before DNS;
 *  - then the web-fetch address guard: resolve once, refuse if any answer is
 *    not public, dial only the checked IPs (pinned; Host and SNI keep the
 *    name, the certificate is checked against it) — `pinTargets` /
 *    `dialPinned` from `fetch.ts`;
 *  - every redirect is refused (never followed, `Location` never read);
 *  - a 2xx body must be JSON (`application/json` or `+json`), identity
 *    encoding, at most 1 MiB (an oversized body is refused, never parsed
 *    half), and the whole call shares one 15 s deadline;
 *  - a non-2xx reply is an `http-status` error carrying the numeric status
 *    and, best effort, the parsed JSON error body so the caller can map a
 *    provider's fixed error code — never shown.
 *
 * Nothing here returns or echoes the request URL (its query can carry the
 * key, as GIPHY's does), a header, server text or a transport's free text:
 * errors name at most the host, a SAFE-7 refused address and a fixed reason
 * (an `E…` code). The caller scrubs what it shows on top (secret shapes and
 * the values of set secret env vars).
 */

import {
  dialPinned,
  isValidMediaType,
  mediaType,
  pinTargets,
  readCapped,
  systemResolver,
  WebFetchError,
  type ResolvedAddress,
  type Resolver,
} from "./fetch.ts";
import { createSocketTransport, type Transport, type TransportResponse } from "./transport.ts";

/** Longest JSON body read (bytes); more is refused, never parsed half. */
export const API_MAX_BYTES = 1024 * 1024;
/** One deadline for DNS, connect and body. */
export const API_TIMEOUT_MS = 15_000;

/** Fixed request headers; the caller adds its key header. */
export const API_REQUEST_HEADERS: Readonly<Record<string, string>> = {
  "User-Agent": "Corvidinho-web-api (+https://github.com/CorvidLabs/Corvidinho)",
  Accept: "application/json",
  "Accept-Encoding": "identity",
};

export type ApiErrorCode =
  | "invalid-url"
  | "scheme"
  | "host"
  | "blocked"
  | "dns"
  | "redirect"
  | "http-status"
  | "content-type"
  | "too-large"
  | "invalid-json"
  | "timeout"
  | "aborted"
  | "network";

/**
 * Codes raised before any connection was made (nothing reached the API):
 * the URL rules, the host allowlist and the SAFE-7 address check.
 */
export const API_NOT_SENT_CODES: ReadonlySet<ApiErrorCode> = new Set([
  "invalid-url",
  "scheme",
  "host",
  "blocked",
  "dns",
]);

export class ApiRequestError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    /** Numeric HTTP status (http-status only). */
    readonly status?: number,
    /** Parsed JSON error body (http-status only, best effort). Never shown. */
    readonly errorBody?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export type ApiGetDeps = {
  resolver?: Resolver;
  transport?: Transport;
  timeoutMs?: number;
  maxBytes?: number;
};

export type ApiGetRequest = {
  /** Full https URL, query included. Never returned or echoed. */
  url: URL;
  /** The calling command's hosts (lower-case, no trailing dot). */
  allowedHosts: ReadonlySet<string>;
  /** Extra headers (the key header); sent after {@link API_REQUEST_HEADERS}. */
  headers?: Readonly<Record<string, string>>;
  /** The calling run's abort signal (AGENT-3). */
  signal?: AbortSignal;
};

export type ApiGetResult = {
  status: number;
  json: unknown;
  bytes: number;
};

function normalHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "");
}

/** The per-command URL rule, before DNS: https, no credentials, allowlisted host, default port. */
export function checkApiUrl(url: URL, allowedHosts: ReadonlySet<string>): URL {
  if (url.protocol !== "https:") {
    throw new ApiRequestError("scheme", "refused: API requests go out over https only (SAFE-7)");
  }
  if (url.username || url.password) {
    throw new ApiRequestError("blocked", "refused: API URLs never carry credentials");
  }
  const host = normalHost(url.hostname);
  if (!allowedHosts.has(host) || (url.port !== "" && url.port !== "443")) {
    throw new ApiRequestError("host", "refused: that host is not on this command's host allowlist (SAFE-7)");
  }
  const out = new URL(url.href);
  out.hash = "";
  return out;
}

function isJsonMime(mime: string): boolean {
  return mime === "application/json" || mime.endsWith("+json");
}

/**
 * A fixed reason for a transport or resolver failure: the error's `E…` code
 * or a TLS note, never its free text (which can carry an address, a path or
 * whatever a transport put in it).
 */
function failureReason(text: string): string {
  const code = /\b(E[A-Z0-9_]{2,30})\b/.exec(text)?.[1];
  if (code) return code;
  if (/certificate|\btls\b|\bssl\b/i.test(text)) return "TLS error";
  return "connection failed";
}

function fromWebFetchError(e: WebFetchError, host: string): ApiRequestError {
  // SAFE-7 refusals keep their message (the host, the refused address and
  // the range); everything else names the host and a fixed reason only.
  if (e.code === "blocked") return new ApiRequestError("blocked", e.message);
  if (e.code === "dns") return new ApiRequestError("dns", `could not resolve ${host} (${failureReason(e.message)})`);
  if (e.code === "timeout") return new ApiRequestError("timeout", "timed out");
  return new ApiRequestError("network", `${host}: request failed (${failureReason(e.message)})`);
}

function parseJson(bytes: Uint8Array): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false };
  }
}

async function run(
  req: ApiGetRequest,
  deps: Required<ApiGetDeps>,
  signal: AbortSignal,
): Promise<ApiGetResult> {
  const url = checkApiUrl(req.url, req.allowedHosts);
  const host = normalHost(url.hostname);
  if (signal.aborted) throw new ApiRequestError("aborted", "aborted");
  let pins: ResolvedAddress[];
  try {
    pins = await pinTargets(url, deps.resolver);
  } catch (e) {
    if (e instanceof WebFetchError) throw fromWebFetchError(e, host);
    throw e;
  }
  if (signal.aborted) throw new ApiRequestError("aborted", "aborted");
  let dialed: { resp: TransportResponse };
  try {
    dialed = await dialPinned(url, pins, deps.transport, { ...API_REQUEST_HEADERS, ...(req.headers ?? {}) }, signal);
  } catch (e) {
    if (e instanceof WebFetchError) throw fromWebFetchError(e, host);
    throw new ApiRequestError("network", `${host}: request failed (${failureReason(String(e))})`);
  }
  const { resp } = dialed;
  try {
    if (resp.status >= 300 && resp.status <= 399) {
      // Never followed and the Location is never read (REQ-plugins-3181).
      throw new ApiRequestError(
        "redirect",
        `refused: ${host} answered with a redirect (HTTP ${resp.status}); API redirects are never followed`,
      );
    }
    const encoding = (resp.headers["content-encoding"] ?? "").trim().toLowerCase();
    let body: { bytes: Uint8Array; truncated: boolean };
    try {
      body = await readCapped(resp, deps.maxBytes);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new ApiRequestError(
        signal.aborted ? "aborted" : "network",
        `${host}: reading the response failed (${failureReason(msg)})`,
      );
    }
    const { mime } = mediaType(resp.headers["content-type"]);
    const jsonBody =
      !body.truncated && (!encoding || encoding === "identity") && isValidMediaType(mime) && isJsonMime(mime);
    if (resp.status < 200 || resp.status > 299) {
      // Numeric status only; the body is kept for the caller's fixed code map.
      const parsed = jsonBody ? parseJson(body.bytes) : { ok: false as const };
      throw new ApiRequestError(
        "http-status",
        `HTTP ${resp.status}`,
        resp.status,
        parsed.ok ? parsed.value : undefined,
      );
    }
    if (encoding && encoding !== "identity") {
      throw new ApiRequestError("content-type", "refused: compressed response; only identity encoding is read");
    }
    if (!mime || !isValidMediaType(mime) || !isJsonMime(mime)) {
      throw new ApiRequestError("content-type", "refused: the API did not answer with JSON");
    }
    if (body.truncated) {
      throw new ApiRequestError("too-large", `refused: response over ${deps.maxBytes} bytes`);
    }
    const parsed = parseJson(body.bytes);
    if (!parsed.ok) throw new ApiRequestError("invalid-json", "refused: the API answered with malformed JSON");
    return { status: resp.status, json: parsed.value, bytes: body.bytes.byteLength };
  } finally {
    resp.close();
  }
}

/**
 * One keyed JSON GET under the rules above. Throws `ApiRequestError` on any
 * refusal or failure; DNS, connect and body share one deadline, and the
 * caller's signal aborts it.
 */
export async function apiGetJson(req: ApiGetRequest, deps: ApiGetDeps = {}): Promise<ApiGetResult> {
  const full: Required<ApiGetDeps> = {
    resolver: deps.resolver ?? systemResolver,
    transport: deps.transport ?? createSocketTransport(),
    timeoutMs: deps.timeoutMs ?? API_TIMEOUT_MS,
    maxBytes: deps.maxBytes ?? API_MAX_BYTES,
  };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const stop = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ApiRequestError("timeout", `timed out after ${full.timeoutMs} ms`));
    }, full.timeoutMs);
    if (req.signal) {
      onAbort = () => {
        controller.abort();
        reject(new ApiRequestError("aborted", "stopped: the calling run was interrupted"));
      };
      if (req.signal.aborted) onAbort();
      else req.signal.addEventListener("abort", onAbort, { once: true });
    }
  });
  // A rejection that loses the race is expected; never an unhandled one.
  stop.catch(() => {});
  try {
    return await Promise.race([run(req, full, controller.signal), stop]);
  } finally {
    clearTimeout(timer);
    if (req.signal && onAbort) req.signal.removeEventListener("abort", onAbort);
    controller.abort();
  }
}
