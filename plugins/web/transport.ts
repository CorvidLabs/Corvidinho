/**
 * Pinned HTTP/1.1 GET transport for `web-fetch` (REQ-plugins-111 / SAFE-7).
 *
 * The socket connects to the already-checked IP literal only — no DNS happens
 * here, so a rebinding name cannot swap the target between check and connect.
 * The original host still goes out as the `Host` header and as TLS SNI, and
 * the certificate is verified against that name. No HTTP proxy is used, by
 * design: a proxy would re-resolve the name and defeat the pin.
 */

import net from "node:net";
import tls from "node:tls";

export type TransportRequest = {
  /** Original URL: Host header, SNI and request target come from here. */
  url: URL;
  /** Pinned IP literal (already SAFE-7 checked) — the only address dialed. */
  address: string;
  family: 4 | 6;
  /** Extra request headers (Host / Connection are set by the transport). */
  headers: Record<string, string>;
  signal: AbortSignal;
};

export type TransportResponse = {
  status: number;
  statusText: string;
  /** Lower-cased header names; repeated headers joined with ", ". */
  headers: Record<string, string>;
  body: AsyncIterable<Uint8Array>;
  /** Tear down the connection (safe to call more than once). */
  close(): void;
};

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

export type SocketTransportOptions = {
  /** Replace the default trust roots (loopback TLS fixtures use this). */
  ca?: string | Buffer;
  /** Max bytes of a response head (status line + headers). Default 64 KiB. */
  maxHeaderBytes?: number;
};

const CRLF = Buffer.from("\r\n");
const CRLFCRLF = Buffer.from("\r\n\r\n");
const DEFAULT_MAX_HEADER_BYTES = 64 * 1024;
const READ_PIECE = 64 * 1024;

class ByteReader {
  private buf: Buffer = Buffer.alloc(0);
  private eof = false;
  private readonly it: AsyncIterator<unknown>;

  constructor(stream: AsyncIterable<unknown>) {
    this.it = stream[Symbol.asyncIterator]();
  }

  private async more(): Promise<boolean> {
    if (this.eof) return false;
    const r = await this.it.next();
    if (r.done) {
      this.eof = true;
      return false;
    }
    const v = r.value;
    const chunk =
      typeof v === "string" ? Buffer.from(v, "latin1") : Buffer.from(v as Uint8Array);
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    return true;
  }

  /** Bytes before `delim` (consumed with it); throws past `max` bytes or at EOF. */
  async readUntil(delim: Buffer, max: number, what: string): Promise<Buffer> {
    let from = 0;
    for (;;) {
      const idx = this.buf.indexOf(delim, from);
      if (idx >= 0) {
        if (idx > max) throw new Error(`${what} too large`);
        const out = this.buf.subarray(0, idx);
        this.buf = this.buf.subarray(idx + delim.length);
        return out;
      }
      if (this.buf.length - (delim.length - 1) > max) {
        throw new Error(`${what} too large`);
      }
      from = Math.max(0, this.buf.length - delim.length + 1);
      if (!(await this.more())) throw new Error(`connection closed while reading ${what}`);
    }
  }

  /** At least one and at most `n` bytes; empty only at EOF. */
  async readUpTo(n: number): Promise<Buffer> {
    if (this.buf.length === 0 && !(await this.more())) return Buffer.alloc(0);
    const take = Math.min(n, this.buf.length);
    const out = this.buf.subarray(0, take);
    this.buf = this.buf.subarray(take);
    return out;
  }
}

type Head = { status: number; statusText: string; headers: Record<string, string> };

function parseHead(raw: string): Head {
  const lines = raw.split("\r\n");
  const m = /^HTTP\/1\.[01] (\d{3})(?: (.*))?$/.exec(lines[0] ?? "");
  if (!m) throw new Error("malformed HTTP status line");
  const headers: Record<string, string> = {};
  let last: string | null = null;
  for (const line of lines.slice(1)) {
    if (line === "") continue;
    if ((line.startsWith(" ") || line.startsWith("\t")) && last) {
      headers[last] = `${headers[last]} ${line.trim()}`;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon <= 0) throw new Error("malformed HTTP header line");
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers[name] = name in headers ? `${headers[name]}, ${value}` : value;
    last = name;
  }
  return { status: Number(m[1]), statusText: (m[2] ?? "").trim(), headers };
}

async function* chunkedBody(r: ByteReader): AsyncGenerator<Uint8Array> {
  for (;;) {
    const line = (await r.readUntil(CRLF, 1024, "chunk size line")).toString("latin1");
    const hex = (line.split(";")[0] ?? "").trim();
    if (!/^[0-9a-fA-F]{1,8}$/.test(hex)) throw new Error("malformed chunk size");
    let remaining = parseInt(hex, 16);
    if (remaining === 0) return; // trailers are ignored; the socket closes next
    while (remaining > 0) {
      const piece = await r.readUpTo(Math.min(remaining, READ_PIECE));
      if (piece.length === 0) throw new Error("connection closed mid-chunk");
      remaining -= piece.length;
      yield piece;
    }
    await r.readUntil(CRLF, 0, "chunk terminator");
  }
}

async function* fixedBody(r: ByteReader, length: number): AsyncGenerator<Uint8Array> {
  let remaining = length;
  while (remaining > 0) {
    const piece = await r.readUpTo(Math.min(remaining, READ_PIECE));
    if (piece.length === 0) throw new Error("connection closed before content-length bytes");
    remaining -= piece.length;
    yield piece;
  }
}

async function* untilClose(r: ByteReader): AsyncGenerator<Uint8Array> {
  for (;;) {
    const piece = await r.readUpTo(READ_PIECE);
    if (piece.length === 0) return;
    yield piece;
  }
}

async function* noBody(): AsyncGenerator<Uint8Array> {}

function contentLength(raw: string): number {
  const values = raw.split(",").map((v) => v.trim());
  const first = values[0] ?? "";
  if (!/^\d{1,15}$/.test(first) || values.some((v) => v !== first)) {
    throw new Error("malformed content-length");
  }
  return Number(first);
}

function hasCtl(s: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(s);
}

function waitConnected(socket: net.Socket, event: "connect" | "secureConnect"): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.off(event, onOk);
      socket.off("error", onErr);
      socket.off("close", onClose);
    };
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = (e: Error) => {
      cleanup();
      reject(e);
    };
    const onClose = () => {
      cleanup();
      reject(new Error("connection closed before it was established"));
    };
    socket.once(event, onOk);
    socket.once("error", onErr);
    socket.once("close", onClose);
  });
}

/** Default transport: raw socket to the pinned IP, HTTP/1.1, `Connection: close`. */
export function createSocketTransport(opts: SocketTransportOptions = {}): Transport {
  const maxHeaderBytes = opts.maxHeaderBytes ?? DEFAULT_MAX_HEADER_BYTES;
  return async (req) => {
    const { url, address, signal } = req;
    if (net.isIP(address) === 0) {
      throw new Error("transport refuses to dial anything but a pinned IP literal");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`unsupported scheme ${url.protocol}`);
    }
    const target = `${url.pathname || "/"}${url.search}`;
    const extra = Object.entries(req.headers).filter(
      ([k]) => !/^(host|connection|content-length|transfer-encoding)$/i.test(k),
    );
    if (hasCtl(target) || hasCtl(url.host) || extra.some(([k, v]) => hasCtl(k) || hasCtl(v))) {
      throw new Error("refused: control characters in request line or headers");
    }
    if (signal.aborted) throw new Error("aborted");

    const secure = url.protocol === "https:";
    const port = url.port ? Number(url.port) : secure ? 443 : 80;
    const name = url.hostname.replace(/^\[|\]$/g, "");
    const socket: net.Socket = secure
      ? tls.connect({
          host: address,
          port,
          servername: net.isIP(name) === 0 ? name : undefined,
          rejectUnauthorized: true,
          ALPNProtocols: ["http/1.1"],
          ...(opts.ca ? { ca: opts.ca } : {}),
        })
      : net.connect({ host: address, port });

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      signal.removeEventListener("abort", onAbort);
      socket.destroy();
    };
    const onAbort = () => {
      if (closed) return;
      closed = true;
      socket.destroy(new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      await waitConnected(socket, secure ? "secureConnect" : "connect");
      const lines = [`GET ${target} HTTP/1.1`, `Host: ${url.host}`];
      for (const [k, v] of extra) lines.push(`${k}: ${v}`);
      lines.push("Connection: close", "", "");
      socket.write(lines.join("\r\n"));

      const reader = new ByteReader(socket);
      let head: Head;
      for (;;) {
        const raw = await reader.readUntil(CRLFCRLF, maxHeaderBytes, "response head");
        head = parseHead(raw.toString("latin1"));
        if (head.status === 101) throw new Error("refused: protocol switch");
        if (head.status >= 200 || head.status < 100) break;
      }

      const te = head.headers["transfer-encoding"];
      const cl = head.headers["content-length"];
      let body: AsyncIterable<Uint8Array>;
      if (head.status === 204 || head.status === 304) {
        body = noBody();
      } else if (te !== undefined) {
        const codings = te.toLowerCase().split(",").map((s) => s.trim());
        if (codings.length !== 1 || codings[0] !== "chunked") {
          // The header value is server-chosen text: never echo it.
          throw new Error("unsupported transfer-encoding");
        }
        body = chunkedBody(reader);
      } else if (cl !== undefined) {
        body = fixedBody(reader, contentLength(cl));
      } else {
        body = untilClose(reader);
      }

      return {
        status: head.status,
        statusText: head.statusText,
        headers: head.headers,
        body,
        close,
      };
    } catch (e) {
      close();
      throw e;
    }
  };
}
