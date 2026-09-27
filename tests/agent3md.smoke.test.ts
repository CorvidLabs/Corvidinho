/**
 * Light agent.3md adopt spike: validate + route/get on the shipped guidance-only file.
 * Does not wire AGENT-13 progressive disclosure into the agent loop.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Agent, validateAgent } from "@corvidlabs/agent3md";

const ROOT = join(import.meta.dir, "..");
const AGENT_3MD = join(ROOT, "agent.3md");

describe("agent.3md light adopt", () => {
  const src = readFileSync(AGENT_3MD, "utf8");

  test("validateAgent passes on shipped agent.3md", () => {
    const report = validateAgent(src);
    expect(report.ok).toBe(true);
  });

  test("manifest names corvidinho and lists guidance-only skills", () => {
    const agent = new Agent(src);
    const m = agent.manifest();
    expect(m.name).toBe("corvidinho");
    expect(m.skills.length).toBeGreaterThanOrEqual(5);
    for (const s of m.skills) {
      expect(s.tool).toBeNull();
    }
  });

  test("route + get load discord-ask playbook without tool binding", () => {
    const agent = new Agent(src);
    const hits = agent.route("discord ephemeral ask buttons clarify");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.skill.name).toBe("discord-ask");
    const skill = agent.get("discord-ask");
    expect(skill).toBeDefined();
    expect(skill!.tool).toBeNull();
    expect(skill!.body.toLowerCase()).toContain("ephemeral");
  });

  test("route hi-first and safe-plugins playbooks", () => {
    const agent = new Agent(src);
    expect(agent.route("do not invent acceptance criteria hi")[0]!.skill.name).toBe(
      "hi-first",
    );
    expect(agent.route("SAFE plugin registry shell-exec")[0]!.skill.name).toBe(
      "safe-plugins",
    );
  });

  test("package.json depends on @corvidlabs/agent3md", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.dependencies?.["@corvidlabs/agent3md"]).toBeTruthy();
  });
});
