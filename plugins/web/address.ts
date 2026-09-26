/**
 * SAFE-7 address guard for `web-fetch` (REQ-plugins-111).
 * Steal: corvid-agent `server/lib/ssrf-guard.ts` (private-range blocking),
 * Merlin `fledge-plugin-web` (check after DNS, then pin).
 *
 * Pure: no DNS, no sockets. Every address a fetch would connect to is
 * classified here; anything that is not plainly public internet is refused.
 */

export type IpFamily = 4 | 6;

export type AddressVerdict =
  | { blocked: false; family: IpFamily }
  | { blocked: true; reason: string };

/** Strict dotted-quad IPv4 (no octal/hex/short forms) → 32-bit value. */
export function parseIPv4(input: string): number | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    if (p.length > 1 && p.startsWith("0")) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function stripBrackets(s: string): string {
  return s.startsWith("[") && s.endsWith("]") ? s.slice(1, -1) : s;
}

/** IPv6 text (optional brackets / zone id / embedded IPv4 tail) → 8 groups. */
export function parseIPv6(input: string): number[] | null {
  let s = stripBrackets(input);
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (s.length < 2 || s.length > 45 || !/^[0-9a-fA-F:.]+$/.test(s)) return null;

  const groups = (part: string, allowV4Tail: boolean): number[] | null => {
    if (part === "") return [];
    const items = part.split(":");
    const out: number[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (it.includes(".")) {
        if (!allowV4Tail || i !== items.length - 1) return null;
        const v4 = parseIPv4(it);
        if (v4 === null) return null;
        out.push(Math.floor(v4 / 0x10000), v4 % 0x10000);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(it)) return null;
        out.push(parseInt(it, 16));
      }
    }
    return out;
  };

  const halves = s.split("::");
  if (halves.length > 2) return null;
  if (halves.length === 2) {
    const head = groups(halves[0]!, false);
    const tail = groups(halves[1]!, true);
    if (!head || !tail) return null;
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
    return [...head, ...new Array<number>(fill).fill(0), ...tail];
  }
  const all = groups(s, true);
  return all && all.length === 8 ? all : null;
}

/** 4, 6, or 0 when `host` is not an IP literal (brackets allowed for v6). */
export function ipFamily(host: string): IpFamily | 0 {
  if (parseIPv4(host) !== null) return 4;
  if (host.includes(":") && parseIPv6(host) !== null) return 6;
  return 0;
}

type V4Range = readonly [base: string, prefix: number, reason: string];

/** Special-purpose IPv4 space (RFC 6890 + IANA registry) — never fetched. */
const V4_BLOCKED: readonly V4Range[] = [
  ["0.0.0.0", 8, "this-network"],
  ["10.0.0.0", 8, "private"],
  ["100.64.0.0", 10, "cgnat"],
  ["127.0.0.0", 8, "loopback"],
  ["169.254.0.0", 16, "link-local"],
  ["172.16.0.0", 12, "private"],
  ["192.0.0.0", 24, "ietf-protocol"],
  ["192.0.2.0", 24, "documentation"],
  ["192.88.99.0", 24, "6to4-relay"],
  ["192.168.0.0", 16, "private"],
  ["198.18.0.0", 15, "benchmarking"],
  ["198.51.100.0", 24, "documentation"],
  ["203.0.113.0", 24, "documentation"],
  ["224.0.0.0", 4, "multicast"],
  ["240.0.0.0", 4, "reserved"],
];

const V4_PARSED = V4_BLOCKED.map(([base, prefix, reason]) => ({
  base: parseIPv4(base)!,
  prefix,
  reason,
}));

function inV4(n: number, base: number, prefix: number): boolean {
  const size = 2 ** (32 - prefix);
  return Math.floor(n / size) === Math.floor(base / size);
}

/** Reason an IPv4 value is not public, or null when it is. */
function classifyV4(n: number): string | null {
  if (n === 0) return "unspecified";
  if (n === parseIPv4("169.254.169.254")) return "link-local (cloud metadata)";
  for (const r of V4_PARSED) {
    if (inV4(n, r.base, r.prefix)) return r.reason;
  }
  return null;
}

type V6Range = readonly [base: string, prefix: number, reason: string];

/** Special-purpose IPv6 inside 2000::/3 plus labelled non-global ranges. */
const V6_BLOCKED: readonly V6Range[] = [
  ["64:ff9b:1::", 48, "nat64-local"],
  ["100::", 64, "discard"],
  ["2001::", 32, "teredo"],
  ["2001::", 23, "ietf-protocol"],
  ["2001:db8::", 32, "documentation"],
  ["2002::", 16, "6to4"],
  ["3fff::", 20, "documentation"],
  ["fc00::", 7, "unique-local"],
  ["fe80::", 10, "link-local"],
  ["fec0::", 10, "site-local"],
  ["ff00::", 8, "multicast"],
];

const V6_PARSED = V6_BLOCKED.map(([base, prefix, reason]) => ({
  base: parseIPv6(base)!,
  prefix,
  reason,
}));

function inV6(g: readonly number[], base: readonly number[], prefix: number): boolean {
  let bits = prefix;
  for (let i = 0; i < 8 && bits > 0; i++) {
    const take = Math.min(16, bits);
    const mask = (0xffff << (16 - take)) & 0xffff;
    if ((g[i]! & mask) !== (base[i]! & mask)) return false;
    bits -= take;
  }
  return true;
}

const NAT64 = parseIPv6("64:ff9b::")!;
const GLOBAL_UNICAST = parseIPv6("2000::")!;

function embeddedV4(g: readonly number[]): number {
  return g[6]! * 0x10000 + g[7]!;
}

/** Reason an IPv6 address is not public, or null when it is. */
function classifyV6(g: readonly number[]): string | null {
  const firstFiveZero = g.slice(0, 5).every((x) => x === 0);
  if (firstFiveZero && g[5] === 0xffff) {
    const inner = classifyV4(embeddedV4(g));
    return inner ? `ipv4-mapped ${inner}` : null;
  }
  if (firstFiveZero && g[5] === 0) {
    if (g[6] === 0 && g[7] === 0) return "unspecified";
    if (g[6] === 0 && g[7] === 1) return "loopback";
    return "ipv4-compatible (deprecated)";
  }
  if (inV6(g, NAT64, 96)) {
    const inner = classifyV4(embeddedV4(g));
    return inner ? `nat64 ${inner}` : null;
  }
  for (const r of V6_PARSED) {
    if (inV6(g, r.base, r.prefix)) return r.reason;
  }
  if (!inV6(g, GLOBAL_UNICAST, 3)) return "reserved";
  return null;
}

/**
 * Classify one address a fetch would connect to. Unparseable input is
 * blocked (fail closed).
 */
export function checkAddress(ip: string): AddressVerdict {
  const raw = stripBrackets(ip.trim());
  const v4 = parseIPv4(raw);
  if (v4 !== null) {
    const reason = classifyV4(v4);
    return reason ? { blocked: true, reason } : { blocked: false, family: 4 };
  }
  const v6 = raw.includes(":") ? parseIPv6(raw) : null;
  if (v6) {
    const reason = classifyV6(v6);
    return reason ? { blocked: true, reason } : { blocked: false, family: 6 };
  }
  return { blocked: true, reason: "not an IP address" };
}
