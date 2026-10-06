/**
 * A stand-in `hi` CLI for the AGENT-18 hi drafts tests (CI has no `hi`):
 * `hi export` (families, criteria and retired entries of each `hi/*.md`
 * with `hi:` front matter), `hi check` (exit 0, or 1 while the bin dir has a
 * `check-fail` file), and `hi <ID> <text>` (a criterion appended to the
 * family's file, a dotted id right under its parent; an id already there,
 * an unknown family or a missing parent is an error; a `fail-id` file in the
 * bin dir naming an id makes that capture fail). Like the real CLI, a first
 * capture also writes `INTENT.md` when the repo has none. Written into a
 * temp bin dir; put that dir first on PATH. The markers are files, not env
 * vars, because a capture runs `hi` with only PATH and HOME.
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCRIPT = String.raw`#!/usr/bin/env bun
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const hiDir = path.join(root, "hi");
const ID = /^([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*)-(\d+)((?:\.[a-z0-9]+)*)$/;
const binDir = path.dirname(process.argv[1]);
function marker(name) {
  try {
    return fs.readFileSync(path.join(binDir, name), "utf8").trim();
  } catch {
    return null;
  }
}
function files() {
  try {
    return fs.readdirSync(hiDir).filter((n) => n.endsWith(".md")).sort().map((n) => "hi/" + n);
  } catch {
    return [];
  }
}
function parse(rel) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm || !/^hi:/m.test(fm[1])) return null;
  const fam = ((fm[1].match(/^families:\s*\[(.*)\]/m) || [])[1] || "").split(",").map((s) => s.trim()).filter(Boolean);
  const criteria = [];
  const retired = [];
  let section = "criteria";
  for (const line of text.slice(fm[0].length).split("\n")) {
    if (/^##\s/.test(line)) {
      section = /^##\s+retired/i.test(line) ? "retired" : "criteria";
      continue;
    }
    const m = line.match(/^\s*- \*\*([A-Z][A-Z0-9-]*-\d+(?:\.[a-z0-9]+)*)\*\*\s+(.*)$/);
    if (m) (section === "retired" ? retired : criteria).push({ id: m[1], text: m[2] });
  }
  return { file: rel, families: fam, criteria, retired, text };
}
const args = process.argv.slice(2);
if (args[0] === "export") {
  const out = files().map(parse).filter(Boolean).map((f) => ({ file: f.file, families: f.families, criteria: f.criteria, retired: f.retired }));
  console.log(JSON.stringify({ hi: 1, export: 1, files: out }));
  process.exit(0);
}
if (args[0] === "check") {
  if (marker("check-fail") !== null) {
    console.error("error: check failed");
    process.exit(1);
  }
  process.exit(0);
}
const [id, text] = args;
if (marker("fail-id") === id) {
  console.error("error: refusing " + id);
  process.exit(1);
}
const m = typeof id === "string" ? id.match(ID) : null;
if (!m || typeof text !== "string") {
  console.error("usage: hi <ID> <text>");
  process.exit(2);
}
const all = files().map(parse).filter(Boolean);
if (all.some((f) => f.criteria.some((c) => c.id === id) || f.retired.some((c) => c.id === id))) {
  console.error("error: " + id + " already exists");
  process.exit(1);
}
const f = all.find((x) => x.families.includes(m[1]));
if (!f) {
  console.error("error: no file for " + m[1]);
  process.exit(1);
}
const lines = f.text.split("\n");
if (m[3]) {
  const parent = id.slice(0, id.lastIndexOf("."));
  const at = lines.findIndex((l) => l.includes("**" + parent + "**"));
  if (at < 0) {
    console.error("error: " + id + " needs a parent " + parent);
    process.exit(1);
  }
  lines.splice(at + 1, 0, "  - **" + id + "**  " + text);
} else {
  let end = lines.findIndex((l) => /^##\s+retired/i.test(l));
  if (end < 0) end = lines.length;
  let last = -1;
  for (let i = 0; i < end; i++) if (/^\s*- \*\*/.test(lines[i]) || (last >= 0 && i === last + 1 && /^\s{2,}\S/.test(lines[i]))) last = i;
  lines.splice(last >= 0 ? last + 1 : end, 0, "- **" + id + "**  " + text);
}
fs.writeFileSync(path.join(root, f.file), lines.join("\n"));
if (!fs.existsSync(path.join(root, "INTENT.md"))) fs.writeFileSync(path.join(root, "INTENT.md"), "# Intent\n");
console.log(f.file + "  +" + id);
`;

/** Write the stand-in into `<dir>/bin/hi`; returns the bin dir to put first on PATH. */
export function writeStandInHi(dir: string): string {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const path = join(bin, "hi");
  writeFileSync(path, SCRIPT);
  chmodSync(path, 0o755);
  return bin;
}

/** `PATH` with the stand-in's bin dir first. */
export function pathWithHi(bin: string, base = process.env.PATH ?? ""): string {
  return `${bin}:${base}`;
}
