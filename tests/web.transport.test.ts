/**
 * web-fetch socket transport (REQ-plugins-111 / SAFE-7): loopback-only
 * fixtures prove the socket dials the pinned IP while Host / SNI carry the
 * original name. Hostnames use `.invalid` / `.test`, which never resolve, so
 * a passing request cannot have come from DNS. No external network.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";
import { REQUEST_HEADERS, WebFetchError, webFetch, type Resolver } from "../plugins/web/fetch.ts";
import { createSocketTransport, type Transport } from "../plugins/web/transport.ts";

type Seen = { head: string; servername?: string };

type Fixture = { port: number; seen: Seen[]; close: () => Promise<void> };

/** Plain TCP server on 127.0.0.1 answering every request with `reply`. */
async function startServer(reply: string | Buffer | ((s: net.Socket) => void)): Promise<Fixture> {
  const seen: Seen[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((sock) => {
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    sock.on("error", () => {});
    let buf = "";
    let answered = false;
    sock.on("data", (d) => {
      buf += d.toString("latin1");
      if (answered || !buf.includes("\r\n\r\n")) return;
      answered = true;
      seen.push({ head: buf.split("\r\n\r\n")[0]! });
      if (typeof reply === "function") reply(sock);
      else sock.end(reply);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}

async function readAll(body: AsyncIterable<Uint8Array>): Promise<string> {
  let out = "";
  for await (const c of body) out += Buffer.from(c).toString("latin1");
  return out;
}

function req(url: string, signal = new AbortController().signal) {
  return { url: new URL(url), address: "127.0.0.1", family: 4 as const, headers: { ...REQUEST_HEADERS }, signal };
}

describe("socket transport over loopback (REQ-plugins-111)", () => {
  const transport = createSocketTransport();

  test("dials the pinned IP and sends the original Host", async () => {
    const f = await startServer("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 5\r\n\r\nhello");
    try {
      const res = await transport(req(`http://pinned.invalid:${f.port}/p?q=1`));
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("text/plain");
      expect(await readAll(res.body)).toBe("hello");
      res.close();
      const lines = f.seen[0]!.head.split("\r\n");
      expect(lines[0]).toBe("GET /p?q=1 HTTP/1.1");
      expect(lines).toContain(`Host: pinned.invalid:${f.port}`);
      expect(lines).toContain("Accept-Encoding: identity");
      expect(lines).toContain("Connection: close");
    } finally {
      await f.close();
    }
  });

  test("decodes chunked bodies", async () => {
    const f = await startServer(
      "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n6;ext=1\r\n world\r\n0\r\nX-Trailer: 1\r\n\r\n",
    );
    try {
      const res = await transport(req(`http://chunked.invalid:${f.port}/`));
      expect(await readAll(res.body)).toBe("hello world");
      res.close();
    } finally {
      await f.close();
    }
  });

  test("reads close-delimited bodies and skips 1xx interim responses", async () => {
    const f = await startServer(
      "HTTP/1.1 103 Early Hints\r\nLink: </a.css>\r\n\r\nHTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\n\r\nuntil close",
    );
    try {
      const res = await transport(req(`http://close.invalid:${f.port}/`));
      expect(res.status).toBe(200);
      expect(await readAll(res.body)).toBe("until close");
      res.close();
    } finally {
      await f.close();
    }
  });

  test("refuses oversized heads, malformed status lines and bad framing", async () => {
    const big = await startServer(`HTTP/1.1 200 OK\r\nX-Big: ${"a".repeat(4000)}\r\n\r\nx`);
    const bad = await startServer("SSH-2.0-OpenSSH\r\n\r\n");
    const te = await startServer("HTTP/1.1 200 OK\r\nTransfer-Encoding: gzip, chunked\r\n\r\n");
    try {
      const small = createSocketTransport({ maxHeaderBytes: 1024 });
      await expect(small(req(`http://big.invalid:${big.port}/`))).rejects.toThrow("too large");
      await expect(transport(req(`http://bad.invalid:${bad.port}/`))).rejects.toThrow("malformed");
      await expect(transport(req(`http://te.invalid:${te.port}/`))).rejects.toThrow("transfer-encoding");
    } finally {
      await big.close();
      await bad.close();
      await te.close();
    }
  });

  test("never dials a hostname, only an IP literal", async () => {
    await expect(transport({ ...req("http://example.com/"), address: "example.com" })).rejects.toThrow(
      "pinned IP literal",
    );
  });

  test("refuses control characters in headers", async () => {
    await expect(
      transport({ ...req("http://x.invalid:1/"), headers: { "X-Evil": "a\r\nHost: other" } }),
    ).rejects.toThrow("control characters");
  });

  test("abort tears down a stalled connection", async () => {
    const f = await startServer(() => {
      /* never answer */
    });
    try {
      const ac = new AbortController();
      const p = transport(req(`http://stall.invalid:${f.port}/`, ac.signal));
      setTimeout(() => ac.abort(), 50);
      await expect(p).rejects.toThrow();
    } finally {
      await f.close();
    }
  });
});

describe("webFetch end-to-end over a loopback socket (REQ-plugins-111)", () => {
  const publicResolver: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];
  /** Test-only wrapper: the guard sees a public pin; the socket goes to loopback. */
  const loopback = (dialed: string[]): Transport => {
    const inner = createSocketTransport();
    return (r) => {
      dialed.push(r.address);
      return inner({ ...r, address: "127.0.0.1" });
    };
  };

  test("size cap closes the socket after maxBytes", async () => {
    const f = await startServer((sock) => {
      sock.write("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\n");
      const chunk = "z".repeat(64 * 1024);
      const pump = () => {
        while (!sock.destroyed && sock.write(chunk)) {
          /* fill */
        }
        if (!sock.destroyed) sock.once("drain", pump);
      };
      pump();
    });
    try {
      const dialed: string[] = [];
      const out = await webFetch(`http://big.invalid:${f.port}/`, {
        resolver: publicResolver,
        transport: loopback(dialed),
        maxBytes: 100_000,
      });
      expect(out.bytes).toBe(100_000);
      expect(out.truncated).toBe(true);
      expect(dialed).toEqual(["93.184.216.34"]);
      expect(f.seen[0]!.head).toContain(`Host: big.invalid:${f.port}`);
    } finally {
      await f.close();
    }
  });

  test("time cap aborts a server that stalls mid-body", async () => {
    const f = await startServer((sock) => {
      sock.write("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 100\r\n\r\npartial");
    });
    try {
      const err = await webFetch(`http://slow.invalid:${f.port}/`, {
        resolver: publicResolver,
        transport: loopback([]),
        timeoutMs: 100,
      }).catch((e) => e);
      expect(err).toBeInstanceOf(WebFetchError);
      expect((err as WebFetchError).code).toBe("timeout");
    } finally {
      await f.close();
    }
  });
});

const hasOpenssl = spawnSync("openssl", ["version"], { encoding: "utf8" }).status === 0;

describe.skipIf(!hasOpenssl)("TLS: pinned IP with original SNI + certificate name (REQ-plugins-111)", () => {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-web-tls-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function openssl(args: string[]): void {
    const r = spawnSync("openssl", args, { cwd: dir, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`openssl ${args[0]} failed: ${r.stderr}`);
  }

  function makeCerts(): { ca: string; key: string; cert: string } {
    const ec = ["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes"];
    openssl(["req", "-x509", ...ec, "-keyout", "ca.key", "-out", "ca.crt", "-days", "1", "-subj", "/CN=corvidinho-test-ca"]);
    openssl(["req", ...ec, "-keyout", "srv.key", "-out", "srv.csr", "-subj", "/CN=pinned.test"]);
    writeFileSync(join(dir, "ext.cnf"), "subjectAltName=DNS:pinned.test\nbasicConstraints=CA:FALSE\n");
    openssl([
      "x509", "-req", "-in", "srv.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial",
      "-out", "srv.crt", "-days", "1", "-extfile", "ext.cnf",
    ]);
    const read = (f: string) => readFileSync(join(dir, f), "utf8");
    return { ca: read("ca.crt"), key: read("srv.key"), cert: read("srv.crt") };
  }

  test("SNI and Host carry the original name; the cert is checked against it", async () => {
    const { ca, key, cert } = makeCerts();
    const seen: Seen[] = [];
    const server = tls.createServer({ key, cert }, (sock) => {
      sock.on("error", () => {});
      let buf = "";
      sock.on("data", (d) => {
        buf += d.toString("latin1");
        if (!buf.includes("\r\n\r\n")) return;
        seen.push({ head: buf.split("\r\n\r\n")[0]!, servername: (sock as tls.TLSSocket & { servername?: string }).servername });
        sock.end("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 6\r\n\r\nsecure");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as net.AddressInfo).port;
    try {
      const trusted = createSocketTransport({ ca });
      const res = await trusted(req(`https://pinned.test:${port}/secure`));
      expect(await readAll(res.body)).toBe("secure");
      res.close();
      expect(seen[0]!.servername).toBe("pinned.test");
      expect(seen[0]!.head).toContain(`Host: pinned.test:${port}`);

      await expect(trusted(req(`https://other.test:${port}/`))).rejects.toThrow();
      await expect(createSocketTransport()(req(`https://pinned.test:${port}/`))).rejects.toThrow();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
