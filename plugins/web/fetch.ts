/**
 * SSRF-guarded GET (REQ-plugins-111 / SAFE-7 / PLUGIN-1).
 * Steal: Merlin `fledge-plugin-web` + `fledge-plugin-http` (typed fetch, DNS
 * pinning), corvid-agent `server/lib/ssrf-guard.ts` (private-range blocking).
 *
 * Per hop: parse → http/https only → resolve once → refuse if ANY address is
 * not public → dial the first checked address (pinned) → redirects are read
 * manually and every hop repeats the whole check. Body and wall time are
 * capped; only text content types come back.
 */

import { lookup } from "node:dns/promises";
import { checkAddress, ipFamily, type IpFamily } from "./address.ts";
import { extractTitle, htmlToText } from "./text.ts";
import { createSocketTransport, type Transport, type TransportResponse } from "./transport.ts";

export const WEB_FETCH_MAX_BYTES = 1024 * 1024;
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
  timeoutMs?: number;
  maxRedirects?: number;
};

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

function isTextMime(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    TEXT_TYPES.has(mime) ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  );
}

/** URL shape rules shared by the first hop and every redirect. */
export function checkUrlShape(url: URL): URL {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebFetchError(
      "scheme",
      `refused: only http and https URLs can be fetched (got ${url.protocol}) — SAFE-7`,
    );
  }
  if (url.username || url.password) {
    throw new WebFetchError("blocked", "refused: URLs with embedded credentials are not fetched");
  }
  const out = new URL(url.href);
  out.hash = "";
  return out;
}

function parseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new WebFetchError("invalid-url", "invalid URL");
  }
  return checkUrlShape(url);
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

/** Resolve once, refuse if any address is non-public, pin the first. */
async function pinTarget(url: URL, resolver: Resolver): Promise<ResolvedAddress> {
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
  let pinned: ResolvedAddress | null = null;
  for (const a of addrs) {
    const verdict = checkAddress(String(a?.address ?? ""));
    if (verdict.blocked) {
      throw new WebFetchError(
        "blocked",
        `refused: ${host} resolves to ${a?.address} (${verdict.reason}) — SAFE-7`,
      );
    }
    pinned ??= { address: String(a.address).replace(/^\[|\]$/g, ""), family: verdict.family };
  }
  return pinned!;
}

function mediaType(contentType: string | undefined): { mime: string; charset?: string } {
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

async function readCapped(
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

async function run(
  rawUrl: string,
  deps: Required<WebFetchDeps>,
  signal: AbortSignal,
): Promise<WebFetchResult> {
  const first = parseUrl(rawUrl);
  let url = first;
  const redirects: string[] = [];

  for (let hop = 0; ; hop++) {
    const pin = await pinTarget(url, deps.resolver);
    if (signal.aborted) throw new WebFetchError("timeout", "aborted");

    let resp: TransportResponse;
    try {
      resp = await deps.transport({
        url,
        address: pin.address,
        family: pin.family,
        headers: { ...REQUEST_HEADERS },
        signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new WebFetchError("network", `${url.host}: ${msg}`);
    }

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
        url = checkUrlShape(next);
        redirects.push(url.href);
        continue;
      }

      if (resp.status < 200 || resp.status > 299) {
        throw new WebFetchError(
          "http-status",
          `HTTP ${resp.status}${resp.statusText ? ` ${resp.statusText}` : ""}`,
        );
      }

      const { mime, charset } = mediaType(resp.headers["content-type"]);
      if (mime && !isTextMime(mime)) {
        throw new WebFetchError("content-type", `refused: non-text content-type ${mime}`);
      }
      const encoding = (resp.headers["content-encoding"] ?? "").trim().toLowerCase();
      if (encoding && encoding !== "identity") {
        throw new WebFetchError(
          "content-type",
          `refused: compressed response (${encoding}); only identity encoding is read`,
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
      return {
        url: first.href,
        finalUrl: url.href,
        status: resp.status,
        contentType: mime || "text/plain",
        address: pin.address,
        redirects,
        bytes: body.bytes.byteLength,
        truncated: body.truncated,
        title: html ? extractTitle(decoded) : undefined,
        text: html ? htmlToText(decoded) : decoded,
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
  const full: Required<WebFetchDeps> = {
    resolver: deps.resolver ?? systemResolver,
    transport: deps.transport ?? createSocketTransport(),
    maxBytes: deps.maxBytes ?? WEB_FETCH_MAX_BYTES,
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
    return await Promise.race([run(rawUrl, full, controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
