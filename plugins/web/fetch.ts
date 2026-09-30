/**
 * SSRF-guarded GET (REQ-plugins-111 / SAFE-7 / PLUGIN-1).
 * Steal: Merlin `fledge-plugin-web` + `fledge-plugin-http` (typed fetch, DNS
 * pinning), corvid-agent `server/lib/ssrf-guard.ts` (private-range blocking).
 *
 * Per hop: parse → http/https only → no secret-looking value in the URL →
 * resolve once → refuse if ANY address is not public → dial the checked
 * addresses in answer order (pinned; the next one only after a connect error)
 * → redirects are read manually and every hop repeats the whole check. Body,
 * returned text and wall time are capped; only text content types come back.
 * Nothing the server controls (status text, header values) is echoed raw into
 * an error. In a scheduled run every hop to a GitHub host must also name a
 * GITHUB-6-allowlisted repo (DISCORD-SCHEDULE-3.a).
 */

import { lookup } from "node:dns/promises";
import { checkGithubRepo, tryLoadAllowlist, type AllowlistConfig } from "../../src/allowlist/index.ts";
import { isScheduleRunEnv } from "../../src/plugins/roles.ts";
import { scrubSecrets } from "../../src/store/scrub.ts";
import { checkAddress, ipFamily, type IpFamily } from "./address.ts";
import { extractTitle, htmlToText, stripControls } from "./text.ts";
import { createSocketTransport, type Transport, type TransportResponse } from "./transport.ts";

export const WEB_FETCH_MAX_BYTES = 1024 * 1024;
/** Returned text cap (chars) so one fetch cannot flood the model context. */
export const WEB_FETCH_MAX_CHARS = 100_000;
export const WEB_FETCH_TIMEOUT_MS = 15_000;
export const WEB_FETCH_MAX_REDIRECTS = 5;

export type ResolvedAddress = { address: string; family: IpFamily };
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

/** System resolver (getaddrinfo, so /etc/hosts counts too). */
export const systemResolver: Resolver = async (hostname) => {
  const rows = await lookup(hostname, { all: true, verbatim: true });
  return rows.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

export type WebFetchDeps = {
  resolver?: Resolver;
  transport?: Transport;
  maxBytes?: number;
  maxChars?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /**
   * Env of the calling run (default `process.env`). In a scheduled run
   * (`isScheduleRunEnv`) every hop to a GitHub host must name an allowlisted
   * repo (DISCORD-SCHEDULE-3.a).
   */
  env?: NodeJS.ProcessEnv;
  /** Allowlist for that check; default read once per call for `env` (ALLOW-4 file + env). */
  allowlist?: AllowlistConfig;
};

/** The caps and seams every hop uses. */
type HopDeps = Required<Omit<WebFetchDeps, "env" | "allowlist">>;

export type WebFetchErrorCode =
  | "invalid-url"
  | "scheme"
  | "blocked"
  | "dns"
  | "redirect"
  | "too-many-redirects"
  | "http-status"
  | "content-type"
  | "timeout"
  | "network";

export class WebFetchError extends Error {
  constructor(
    readonly code: WebFetchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WebFetchError";
  }
}

export type WebFetchResult = {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  /** The pinned IP the final hop connected to. */
  address: string;
  redirects: string[];
  bytes: number;
  truncated: boolean;
  /** Which cap cut the output: the body byte cap or the returned-text char cap. */
  truncatedBy?: "bytes" | "chars";
  title?: string;
  text: string;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const TEXT_TYPES = new Set([
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/xhtml+xml",
  "application/rss+xml",
  "application/atom+xml",
  "application/javascript",
  "application/x-javascript",
  "application/ecmascript",
  "application/x-ndjson",
  "application/yaml",
  "application/x-yaml",
  "application/toml",
]);

export const REQUEST_HEADERS: Readonly<Record<string, string>> = {
  "User-Agent": "Corvidinho-web-fetch (+https://github.com/CorvidLabs/Corvidinho)",
  Accept:
    "text/html,application/xhtml+xml,text/plain;q=0.9,text/*;q=0.8,application/json;q=0.8,application/xml;q=0.7",
  "Accept-Encoding": "identity",
};

/**
 * RFC 6838 `type/subtype` restricted names (lower-cased; each part starts
 * alphanumeric, at most 127 chars). Anything else — spaces, prose, control
 * characters — is not a media type and is refused, so a header cannot smuggle
 * text into the result outside the untrusted fence.
 */
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

export function isValidMediaType(mime: string): boolean {
  return MEDIA_TYPE.test(mime);
}

function isTextMime(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    TEXT_TYPES.has(mime) ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  );
}

/** Content codings named in a refusal; any other value is not echoed. */
const KNOWN_ENCODINGS = new Set(["gzip", "x-gzip", "deflate", "br", "compress", "x-compress", "zstd"]);

/** A URL scheme short enough to name in an error; anything else is not echoed. */
function shownScheme(protocol: string): string {
  return /^[a-z][a-z0-9+.-]{0,15}:$/.test(protocol) ? protocol : "another scheme";
}

/** True when `scrubSecrets` would redact part of the URL (raw or percent-decoded). */
function carriesSecret(href: string): boolean {
  if (scrubSecrets(href) !== href) return true;
  let decoded: string;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    return false;
  }
  return decoded !== href && scrubSecrets(decoded) !== decoded;
}

/** URL shape rules shared by the first hop and every redirect. */
export function checkUrlShape(url: URL): URL {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebFetchError(
      "scheme",
      `refused: only http and https URLs can be fetched (got ${shownScheme(url.protocol)}) — SAFE-7`,
    );
  }
  if (url.username || url.password) {
    throw new WebFetchError("blocked", "refused: URLs with embedded credentials are not fetched");
  }
  const out = new URL(url.href);
  out.hash = "";
  if (carriesSecret(out.href)) {
    throw new WebFetchError(
      "blocked",
      "refused: the URL carries a secret-looking value (SAFE-6); it is not sent anywhere",
    );
  }
  return out;
}

function parseUrl(raw: string): URL {
  try {
    return new URL(raw.trim());
  } catch {
    throw new WebFetchError("invalid-url", "invalid URL");
  }
}

/** GitHub's own hosts (DISCORD-SCHEDULE-3.a): github.com, githubusercontent.com and their subdomains. */
function isGithubHost(host: string): boolean {
  return (
    host === "github.com" ||
    host.endsWith(".github.com") ||
    host === "githubusercontent.com" ||
    host.endsWith(".githubusercontent.com")
  );
}

/** One OWNER or REPO path segment as GitHub names them. */
const REPO_SEGMENT = /^[A-Za-z0-9._-]+$/;

/** The repo path's leading segments on each GitHub host that names one. */
const REPO_PATH_PREFIX: Readonly<Record<string, readonly string[]>> = {
  "github.com": [],
  "www.github.com": [],
  "codeload.github.com": [],
  "raw.githubusercontent.com": [],
  "api.github.com": ["repos"],
};

/**
 * Whether `url` is on a GitHub host and, if so, the OWNER/REPO it names:
 * `/<owner>/<repo>/…` on github.com (and www.), codeload.github.com and
 * raw.githubusercontent.com, `/repos/<owner>/<repo>/…` on api.github.com.
 * Any other path or GitHub host (gists, other API routes, user content,
 * release objects) names no repo (`repo: null`).
 */
export function githubRepoOfUrl(url: URL): { github: false } | { github: true; repo: string | null } {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!isGithubHost(host)) return { github: false };
  const prefix = REPO_PATH_PREFIX[host];
  if (!prefix) return { github: true, repo: null };
  const segs = url.pathname.split("/").slice(1);
  let parts: string[];
  try {
    parts = segs.slice(0, prefix.length + 2).map((p) => decodeURIComponent(p));
  } catch {
    return { github: true, repo: null };
  }
  if (parts.length < prefix.length + 2 || prefix.some((p, i) => parts[i] !== p)) {
    return { github: true, repo: null };
  }
  const owner = parts[prefix.length]!;
  const name = parts[prefix.length + 1]!.replace(/\.git$/i, "");
  const ok = (p: string) => REPO_SEGMENT.test(p) && p !== "." && p !== "..";
  return ok(owner) && ok(name) ? { github: true, repo: `${owner}/${name}` } : { github: true, repo: null };
}

/**
 * DISCORD-SCHEDULE-3.a — the per-hop GitHub rule of a scheduled run, or null
 * outside one. A hop to a GitHub host passes only when it names a repo that
 * passes the GITHUB-6 allowlist (deny wins); an unreadable allowlist refuses
 * every GitHub hop. Other hosts are untouched.
 */
async function scheduleRepoGate(deps: WebFetchDeps): Promise<((url: URL) => void) | null> {
  const env = deps.env ?? process.env;
  if (!isScheduleRunEnv(env)) return null;
  let cfg = deps.allowlist ?? null;
  if (!cfg) {
    const loaded = await tryLoadAllowlist({ env });
    cfg = loaded.ok ? loaded.config : null;
  }
  return (url) => {
    const gh = githubRepoOfUrl(url);
    if (!gh.github) return;
    if (gh.repo && cfg && checkGithubRepo(gh.repo, cfg).ok) return;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    throw new WebFetchError(
      "blocked",
      `refused: ${host} is GitHub and this URL is not in an allowlisted repo; scheduled runs read only allowlisted repos, even public ones (DISCORD-SCHEDULE-3.a)`,
    );
  };
}

/** Names refused before DNS: localhost (RFC 6761) and non-canonical numeric hosts. */
export function blockedHostnameReason(host: string): string | null {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h === "") return "empty host";
  if (h === "localhost" || h.endsWith(".localhost")) return "localhost name";
  const lastLabel = h.split(".").pop() ?? "";
  if (/^(0x[0-9a-f]*|[0-9]+)$/.test(lastLabel)) return "non-canonical numeric host";
  return null;
}

/**
 * Resolve once, refuse if any address is non-public, and return every checked
 * address (answer order, de-duplicated) — these are the only IPs dialed.
 * Shared with the keyed JSON API GET (`api.ts`, REQ-plugins-3181).
 */
export async function pinTargets(url: URL, resolver: Resolver): Promise<ResolvedAddress[]> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const literal = ipFamily(host);
  let addrs: ResolvedAddress[];
  if (literal) {
    addrs = [{ address: host, family: literal }];
  } else {
    const nameReason = blockedHostnameReason(host);
    if (nameReason) {
      throw new WebFetchError("blocked", `refused: ${host} (${nameReason}) — SAFE-7`);
    }
    try {
      addrs = await resolver(host);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new WebFetchError("dns", `could not resolve ${host}: ${msg}`);
    }
    if (!Array.isArray(addrs) || addrs.length === 0) {
      throw new WebFetchError("dns", `could not resolve ${host}: no addresses`);
    }
  }
  const pinned: ResolvedAddress[] = [];
  for (const a of addrs) {
    const verdict = checkAddress(String(a?.address ?? ""));
    if (verdict.blocked) {
      throw new WebFetchError(
        "blocked",
        `refused: ${host} resolves to ${a?.address} (${verdict.reason}) — SAFE-7`,
      );
    }
    const address = String(a.address).replace(/^\[|\]$/g, "");
    if (!pinned.some((p) => p.address === address)) pinned.push({ address, family: verdict.family });
  }
  return pinned;
}

/** Socket-level failures where another checked address of the same name may still answer. */
const CONNECT_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENETDOWN",
  "EHOSTDOWN",
  "EADDRNOTAVAIL",
  "ETIMEDOUT",
]);

function isConnectError(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" && CONNECT_ERROR_CODES.has(code);
}

/** `type/subtype` (lower-cased) and charset of a Content-Type header (shared with `api.ts`). */
export function mediaType(contentType: string | undefined): { mime: string; charset?: string } {
  if (!contentType) return { mime: "" };
  const [first, ...params] = contentType.split(";");
  const mime = (first ?? "").trim().toLowerCase();
  let charset: string | undefined;
  for (const p of params) {
    const m = /^\s*charset\s*=\s*"?([^";\s]+)"?\s*$/i.exec(p);
    if (m) charset = m[1];
  }
  return { mime, charset };
}

function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 1024);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
  return false;
}

function decode(bytes: Uint8Array, charset: string | undefined): string {
  if (charset) {
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      /* unknown label → utf-8 */
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
}

/** Read the body up to `maxBytes` (shared with `api.ts`); `truncated` when there was more. */
export async function readCapped(
  resp: TransportResponse,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for await (const chunk of resp.body) {
    const room = maxBytes - total;
    if (chunk.byteLength > room) {
      if (room > 0) chunks.push(chunk.subarray(0, room));
      total += Math.max(0, room);
      truncated = true;
      break;
    }
    chunks.push(chunk);
    total += chunk.byteLength;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return { bytes: out, truncated };
}

/** First `max` UTF-16 units, never splitting a surrogate pair. */
function capChars(text: string, max: number): string {
  if (text.length <= max) return text;
  const end = max > 0 && /[\ud800-\udbff]/.test(text[max - 1]!) ? max - 1 : max;
  return text.slice(0, end);
}

/**
 * Dial the checked addresses in order. Only a socket-level connect failure
 * moves on to the next one (same deadline); anything else ends the hop.
 * `headers` go out as given (web-fetch: {@link REQUEST_HEADERS}; the keyed
 * JSON API GET adds its key header, REQ-plugins-3181). Errors name the host
 * only, never the path, query or a header.
 */
export async function dialPinned(
  url: URL,
  pins: readonly ResolvedAddress[],
  transport: Transport,
  headers: Readonly<Record<string, string>>,
  signal: AbortSignal,
): Promise<{ resp: TransportResponse; pin: ResolvedAddress }> {
  let lastMsg = "no addresses";
  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i]!;
    if (signal.aborted) throw new WebFetchError("timeout", "aborted");
    try {
      const resp = await transport({
        url,
        address: pin.address,
        family: pin.family,
        headers: { ...headers },
        signal,
      });
      return { resp, pin };
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e);
      if (!isConnectError(e) || signal.aborted) break;
    }
  }
  const tried = pins.length > 1 ? ` (tried ${pins.length} checked addresses)` : "";
  throw new WebFetchError("network", `${url.host}: ${lastMsg}${tried}`);
}

async function run(
  rawUrl: string,
  deps: HopDeps,
  signal: AbortSignal,
  gateDeps: WebFetchDeps,
): Promise<WebFetchResult> {
  const repoGate = await scheduleRepoGate(gateDeps);
  // The shared per-hop URL rule: shape (SAFE-7 / SAFE-6), then a scheduled
  // run's GitHub repo gate (DISCORD-SCHEDULE-3.a), before any DNS or dial.
  const checkHop = (u: URL): URL => {
    const out = checkUrlShape(u);
    repoGate?.(out);
    return out;
  };
  if (signal.aborted) throw new WebFetchError("timeout", "aborted");
  const first = checkHop(parseUrl(rawUrl));
  let url = first;
  const redirects: string[] = [];

  for (let hop = 0; ; hop++) {
    const pins = await pinTargets(url, deps.resolver);
    if (signal.aborted) throw new WebFetchError("timeout", "aborted");

    const { resp, pin } = await dialPinned(url, pins, deps.transport, REQUEST_HEADERS, signal);

    try {
      if (REDIRECT_STATUSES.has(resp.status)) {
        const location = resp.headers["location"];
        if (!location) {
          throw new WebFetchError("redirect", `HTTP ${resp.status} without a Location header`);
        }
        if (hop >= deps.maxRedirects) {
          throw new WebFetchError(
            "too-many-redirects",
            `refused: more than ${deps.maxRedirects} redirects`,
          );
        }
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          throw new WebFetchError("redirect", "redirect to an invalid URL");
        }
        url = checkHop(next);
        redirects.push(url.href);
        continue;
      }

      if (resp.status < 200 || resp.status > 299) {
        // Numeric status only: the reason phrase is server-chosen text.
        throw new WebFetchError("http-status", `HTTP ${resp.status}`);
      }

      const { mime, charset } = mediaType(resp.headers["content-type"]);
      if (mime && !isValidMediaType(mime)) {
        throw new WebFetchError("content-type", "refused: malformed content-type header");
      }
      if (mime && !isTextMime(mime)) {
        throw new WebFetchError("content-type", `refused: non-text content-type ${mime}`);
      }
      const encoding = (resp.headers["content-encoding"] ?? "").trim().toLowerCase();
      if (encoding && encoding !== "identity") {
        const shown = KNOWN_ENCODINGS.has(encoding) ? ` (${encoding})` : "";
        throw new WebFetchError(
          "content-type",
          `refused: compressed response${shown}; only identity encoding is read`,
        );
      }

      let body: { bytes: Uint8Array; truncated: boolean };
      try {
        body = await readCapped(resp, deps.maxBytes);
      } catch (e) {
        if (e instanceof WebFetchError) throw e;
        const msg = e instanceof Error ? e.message : String(e);
        throw new WebFetchError("network", `${url.host}: ${msg}`);
      }
      if (!mime && looksBinary(body.bytes)) {
        throw new WebFetchError("content-type", "refused: binary body without a content-type");
      }

      const decoded = decode(body.bytes, charset);
      const html = mime === "text/html" || mime === "application/xhtml+xml";
      // Control characters (terminal escapes, CR overwrites) never come back.
      const fullText = html ? htmlToText(decoded) : stripControls(decoded);
      const text = capChars(fullText, deps.maxChars);
      const charCut = text.length < fullText.length;
      const truncatedBy = charCut ? "chars" : body.truncated ? "bytes" : undefined;
      return {
        url: first.href,
        finalUrl: url.href,
        status: resp.status,
        contentType: mime || "text/plain",
        address: pin.address,
        redirects,
        bytes: body.bytes.byteLength,
        truncated: body.truncated || charCut,
        ...(truncatedBy ? { truncatedBy } : {}),
        title: html ? extractTitle(decoded) : undefined,
        text,
      };
    } finally {
      resp.close();
    }
  }
}

/**
 * Fetch one URL under the SAFE-7 guard. Throws `WebFetchError` on any
 * refusal or failure; the whole call (DNS, every hop, body) shares one
 * deadline.
 */
export async function webFetch(rawUrl: string, deps: WebFetchDeps = {}): Promise<WebFetchResult> {
  const full: HopDeps = {
    resolver: deps.resolver ?? systemResolver,
    transport: deps.transport ?? createSocketTransport(),
    maxBytes: deps.maxBytes ?? WEB_FETCH_MAX_BYTES,
    maxChars: deps.maxChars ?? WEB_FETCH_MAX_CHARS,
    timeoutMs: deps.timeoutMs ?? WEB_FETCH_TIMEOUT_MS,
    maxRedirects: deps.maxRedirects ?? WEB_FETCH_MAX_REDIRECTS,
  };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new WebFetchError("timeout", `timed out after ${full.timeoutMs} ms`));
    }, full.timeoutMs);
  });
  try {
    return await Promise.race([run(rawUrl, full, controller.signal, deps), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
