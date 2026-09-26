/**
 * DISCORD-ASK-7 / REQ-discord-048 — /session start and /work collapse thinking
 * into one final message (no ✅ Done embed + full interaction reply).
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyConfig } from "../src/allowlist/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { handleSessionStart } from "../src/discord/command-handlers/session.ts";
import { handleWorkCommand } from "../src/discord/command-handlers/work.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import type {
  SlashContext,
  SlashInteraction,
  SlashReplyPayload,
} from "../src/discord/slash-types.ts";
import {
  type DiscordEmbedPayload,
  type EditMessageOpts,
  type ThinkingOutbound,
} from "../src/discord/thinking-status.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

function initGitRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const run = (args: string[]) => {
    const p = Bun.spawnSync(["git", ...args], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (p.exitCode !== 0) {
      throw new Error(
        `git ${args.join(" ")} failed: ${new TextDecoder().decode(p.stderr)}`,
      );
    }
  };
  run(["init"]);
  run(["config", "user.email", "test@example.com"]);
  run(["config", "user.name", "Test"]);
  writeFileSync(join(dir, "README.md"), "# test\n");
  run(["add", "."]);
  run(["commit", "-m", "init"]);
  const branch = Bun.spawnSync(["git", "branch", "--show-current"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const name = new TextDecoder().decode(branch.stdout).trim();
  if (name && name !== "main") run(["branch", "-M", "main"]);
}

function mockOutbound(opts?: { editMessage?: boolean }) {
  const sends: DiscordEmbedPayload[] = [];
  const embedEdits: DiscordEmbedPayload[] = [];
  const contentEdits: EditMessageOpts[] = [];
  let n = 0;
  const withEdit = opts?.editMessage !== false;
  const outbound: ThinkingOutbound = {
    async sendEmbed({ embed }) {
      sends.push(embed);
      n += 1;
      return { messageId: `msg_${n}` };
    },
    async editEmbed({ embed }) {
      embedEdits.push(embed);
      return true;
    },
    ...(withEdit
      ? {
          async editMessage(o: EditMessageOpts) {
            contentEdits.push(o);
            return true;
          },
        }
      : {}),
  };
  return { outbound, sends, embedEdits, contentEdits };
}

function echoAgent(): AgentClient {
  return {
    async runChat(input) {
      return {
        ok: true,
        sessionId: input.sessionId,
        exitCode: 0,
        summary: `echo:${input.humanText ?? input.prompt}`.slice(0, 200),
      };
    },
  };
}

describe("DISCORD-ASK-7 slash /session /work (REQ-discord-048)", () => {
  async function withRepo(
    fn: (project: string, store: SessionStore) => Promise<void>,
  ): Promise<void> {
    const root = mkdtempSync(join(tmpdir(), "corvidinho-slash-ask7-"));
    try {
      const project = join(root, "proj");
      initGitRepo(project);
      process.env.WORKTREE_BASE_DIR = join(root, "wts");
      const store = new SessionStore({
        db: openCorvidinhoDb({ memory: true }),
        ttlMs: 45 * 60 * 1000,
        defaultProjectRoot: project,
      });
      await fn(project, store);
    } finally {
      delete process.env.WORKTREE_BASE_DIR;
      rmSync(root, { recursive: true, force: true });
    }
  }

  function slashCtx(
    store: SessionStore,
    thinkingOutbound: ThinkingOutbound | undefined,
    tracked: string[],
  ): SlashContext {
    return {
      store,
      workStore: new WorkStore(),
      allowlist: emptyConfig(),
      agent: echoAgent(),
      version: "0.0.25",
      protocolVersion: 2,
      startedAt: Date.now(),
      channelIds: ["chan-allowed"],
      owner: { discordId: "owner-1" },
      thinkingOutbound,
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      trackBotMessage: (messageId) => {
        tracked.push(messageId);
      },
      openWorkPr: async () => ({
        opened: false as const,
        reason: "verify-failed" as const,
        line: "PR: not opened — test stub",
      }),
    };
  }

  function slashIx(commandName: string, options: Record<string, string>, subcommand?: string) {
    const edits: SlashReplyPayload[] = [];
    let deleted = 0;
    const ix: SlashInteraction = {
      id: "ix",
      commandName,
      subcommand,
      channelId: "chan-allowed",
      userId: "owner-1",
      options,
      reply: async (p) => {
        edits.push(p);
      },
      deferReply: async () => {},
      editReply: async (p) => {
        edits.push(p);
      },
      deleteReply: async () => {
        deleted += 1;
      },
    };
    return { ix, edits, getDeleted: () => deleted };
  }

  test("/session start collapses thinking into final body and deletes deferred reply", async () => {
    await withRepo(async (_project, store) => {
      const { outbound, sends, embedEdits, contentEdits } = mockOutbound();
      const tracked: string[] = [];
      const { ix, edits, getDeleted } = slashIx(
        "session",
        { topic: "Ship ASK-7 slash" },
        "start",
      );
      await handleSessionStart(slashCtx(store, outbound, tracked), ix);

      expect(sends.length).toBeGreaterThanOrEqual(1);
      // No ✅ Done embed edit after collapse — content edit carries the answer.
      const doneEmbed = embedEdits.some((e) =>
        (e.description ?? "").includes("✅ Done"),
      );
      expect(doneEmbed).toBe(false);
      expect(contentEdits.length).toBe(1);
      expect(contentEdits[0]!.content ?? "").toContain("Ship ASK-7 slash");
      expect(contentEdits[0]!.content ?? "").toContain("echo:");
      expect(contentEdits[0]!.embed).toBeNull();
      expect(getDeleted()).toBe(1);
      // Deferred reply not filled with the full body.
      expect(edits.every((e) => !(e.content ?? "").includes("echo:"))).toBe(
        true,
      );
      expect(tracked).toEqual(["msg_1"]);
      const [session] = store.list();
      if (session) await store.endSession(session);
    });
  });

  test("/work collapses thinking into final body and deletes deferred reply", async () => {
    await withRepo(async (_project, store) => {
      const { outbound, contentEdits } = mockOutbound();
      const tracked: string[] = [];
      const { ix, edits, getDeleted } = slashIx("work", {
        description: "Fix double Done",
      });
      await handleWorkCommand(slashCtx(store, outbound, tracked), ix);

      expect(contentEdits.length).toBe(1);
      expect(contentEdits[0]!.content ?? "").toContain("Fix double Done");
      expect(contentEdits[0]!.content ?? "").toContain("(completed)");
      expect(getDeleted()).toBe(1);
      expect(edits.every((e) => !(e.content ?? "").includes("echo:"))).toBe(
        true,
      );
      expect(tracked).toEqual(["msg_1"]);
      const [session] = store.list();
      if (session) await store.endSession(session);
    });
  });

  test("fallback without editMessage keeps Done embed + editReply body", async () => {
    await withRepo(async (_project, store) => {
      const { outbound, embedEdits } = mockOutbound({ editMessage: false });
      const tracked: string[] = [];
      const { ix, edits, getDeleted } = slashIx(
        "session",
        { topic: "Fallback path" },
        "start",
      );
      await handleSessionStart(slashCtx(store, outbound, tracked), ix);

      const doneBlob = embedEdits
        .map((e) => `${e.description ?? ""}|${e.footer?.text ?? ""}`)
        .join("\n");
      expect(doneBlob).toContain("✅ Done");
      expect(getDeleted()).toBe(0);
      expect(edits.at(-1)?.content ?? "").toContain("Fallback path");
      expect(edits.at(-1)?.content ?? "").toContain("echo:");
      expect(tracked).toEqual([]);
      const [session] = store.list();
      if (session) await store.endSession(session);
    });
  });
});
