/**
 * Memory plugins (PLUGIN-1 / REQ-plugins-010).
 * Backed by shared MemoryStore; ACL at handler time.
 */

import { openCorvidinhoDb } from "../../src/store/db.ts";
import {
  MemoryAclError,
  MemoryNotFoundError,
  MemoryStore,
  MemoryValidationError,
} from "../../src/memory/index.ts";
import type { PluginCommand } from "../../src/plugins/types.ts";

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  const v = args[idx + 1];
  return v != null && !v.startsWith("--") ? v : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function positionalAfterFlags(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--user" || a === "--category" || a === "--key" || a === "--query" || a === "--id" || a === "--limit" || a === "--db") {
      i++; // skip value
      continue;
    }
    if (a === "--admin" || a === "--confirm" || a === "--include-deleted") continue;
    if (a.startsWith("--")) continue;
    out.push(a);
  }
  return out;
}

function resolveUser(args: string[]): string {
  const fromFlag = flagValue(args, "--user");
  if (fromFlag?.trim()) return fromFlag.trim();
  const fromEnv = process.env.CORVIDINHO_ACTING_DISCORD_USER_ID?.trim();
  if (fromEnv) return fromEnv;
  return "";
}

function resolveIsAdmin(args: string[]): boolean {
  if (hasFlag(args, "--admin")) return true;
  const env = process.env.CORVIDINHO_ACTING_IS_ADMIN?.trim().toLowerCase();
  return env === "1" || env === "true" || env === "yes";
}

function openStore(args: string[]): { store: MemoryStore; close: () => void } {
  const dbPath = flagValue(args, "--db");
  let db;
  if (dbPath) {
    db = openCorvidinhoDb({ path: dbPath });
  } else if (process.env.CORVIDINHO_MEMORY_INMEM === "1") {
    db = openCorvidinhoDb({ memory: true });
  } else {
    db = openCorvidinhoDb({});
  }
  return {
    store: new MemoryStore({ db }),
    close: () => db.close(),
  };
}

function errResult(err: unknown): {
  ok: false;
  error: string;
  exitCode: number;
} {
  if (err instanceof MemoryAclError) {
    return { ok: false, error: err.message, exitCode: 2 };
  }
  if (err instanceof MemoryNotFoundError) {
    return { ok: false, error: err.message, exitCode: 1 };
  }
  if (err instanceof MemoryValidationError) {
    return { ok: false, error: err.message, exitCode: 1 };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    exitCode: 1,
  };
}

export const memoryCommands: PluginCommand[] = [
  {
    name: "memory-store",
    description:
      "Store a durable fact for the acting Discord user (MEMORY / AGENT-7). " +
      "Categories: conversation|entity|person|personality. " +
      'Call when the user states identity/person/project facts. argv example: ' +
      '["--category","person","--key","identity","Leif is the owner"]. ' +
      "Also: [\"person\",\"identity\",\"Leif is the owner\"] positional. " +
      "Acting user comes from CORVIDINHO_ACTING_DISCORD_USER_ID (bridge sets it).",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const user = resolveUser(ctx.args);
      if (!user) {
        return {
          ok: false,
          error: "acting user required (--user or CORVIDINHO_ACTING_DISCORD_USER_ID)",
          exitCode: 1,
        };
      }
      const category =
        flagValue(ctx.args, "--category") ?? positionalAfterFlags(ctx.args)[0];
      const key =
        flagValue(ctx.args, "--key") ?? positionalAfterFlags(ctx.args)[1];
      let content = flagValue(ctx.args, "--content");
      if (!content) {
        const pos = positionalAfterFlags(ctx.args);
        // when category/key taken from positional, content is rest
        const start =
          flagValue(ctx.args, "--category") && flagValue(ctx.args, "--key")
            ? 0
            : flagValue(ctx.args, "--category") || flagValue(ctx.args, "--key")
              ? 1
              : 2;
        content = pos.slice(start).join(" ");
      }
      if (!category || !key || !content?.trim()) {
        return {
          ok: false,
          error:
            "usage: memory-store --user ID --category CAT --key KEY <content> (or positional CAT KEY content...)",
          exitCode: 1,
        };
      }
      const { store, close } = openStore(ctx.args);
      try {
        const rec = store.store({
          ownerUserId: user,
          category,
          key,
          content,
        });
        return {
          ok: true,
          data: rec,
          message: ctx.json
            ? undefined
            : `stored ${rec.category}/${rec.key} id=${rec.id}`,
          exitCode: 0,
        };
      } catch (err) {
        return errResult(err);
      } finally {
        close();
      }
    },
  },
  {
    name: "memory-recall",
    description:
      "Recall durable facts for the acting Discord user (MEMORY / AGENT-7). " +
      "Call BEFORE claiming you do not know who the user is or facts about them/people/projects. " +
      'argv examples: [] (all), ["--category","person"], ' +
      '["--query","Leif"], ["--category","person","--limit","20"]. ' +
      "Acting user from CORVIDINHO_ACTING_DISCORD_USER_ID.",
    dangerous: false,
    minTier: 0,
    async handler(ctx) {
      const user = resolveUser(ctx.args);
      if (!user) {
        return {
          ok: false,
          error: "acting user required (--user or CORVIDINHO_ACTING_DISCORD_USER_ID)",
          exitCode: 1,
        };
      }
      const category =
        flagValue(ctx.args, "--category") ?? positionalAfterFlags(ctx.args)[0];
      const queryFlag = flagValue(ctx.args, "--query");
      const pos = positionalAfterFlags(ctx.args);
      const queryFromPos = (
        category && !flagValue(ctx.args, "--category") ? pos.slice(1) : pos
      )
        .join(" ")
        .trim();
      const query = queryFlag ?? (queryFromPos || undefined);
      const limitRaw = flagValue(ctx.args, "--limit");
      const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
      const { store, close } = openStore(ctx.args);
      try {
        const rows = store.recall({
          ownerUserId: user,
          category: category || undefined,
          query: query || undefined,
          limit: Number.isFinite(limit) ? limit : undefined,
          includeDeleted: hasFlag(ctx.args, "--include-deleted"),
        });
        return {
          ok: true,
          data: rows,
          message: ctx.json
            ? undefined
            : rows.length === 0
              ? "(no memories)"
              : rows
                  .map(
                    (r) =>
                      `${r.id}\t${r.category}\t${r.key}\t${r.content.slice(0, 80)}`,
                  )
                  .join("\n"),
          exitCode: 0,
        };
      } catch (err) {
        return errResult(err);
      } finally {
        close();
      }
    },
  },
  {
    name: "memory-forget",
    description:
      "ADMIN soft-delete a memory by id (own or other). Requires --confirm. SAFE-4 + MEMORY-ACL-4. " +
      'argv example: ["--id","<uuid>","--confirm"] (plus acting admin env).',
    dangerous: true,
    minTier: 1,
    async handler(ctx) {
      if (!hasFlag(ctx.args, "--confirm")) {
        return {
          ok: false,
          error: "memory-forget requires --confirm (SAFE-4 two-phase)",
          exitCode: 1,
        };
      }
      const actor = resolveUser(ctx.args);
      if (!actor) {
        return {
          ok: false,
          error: "acting user required (--user or CORVIDINHO_ACTING_DISCORD_USER_ID)",
          exitCode: 1,
        };
      }
      const id =
        flagValue(ctx.args, "--id") ?? positionalAfterFlags(ctx.args)[0];
      if (!id) {
        return {
          ok: false,
          error: "usage: memory-forget --user ID --id MEMORY_ID --confirm [--admin]",
          exitCode: 1,
        };
      }
      const isAdmin = resolveIsAdmin(ctx.args);
      const { store, close } = openStore(ctx.args);
      try {
        const rec = store.forget({
          actorUserId: actor,
          id,
          isAdmin,
        });
        return {
          ok: true,
          data: { id: rec.id, deletedAt: rec.deletedAt, deletedByUserId: rec.deletedByUserId },
          message: ctx.json
            ? undefined
            : `forgot memory ${rec.id} (admin audit soft-delete)`,
          exitCode: 0,
        };
      } catch (err) {
        return errResult(err);
      } finally {
        close();
      }
    },
  },
  {
    name: "memory-override",
    description:
      "ADMIN overwrite memory content by id (own or other). Requires --confirm. MEMORY-ACL-3/4. " +
      'argv example: ["--id","<uuid>","--confirm","updated content here"].',
    dangerous: true,
    minTier: 1,
    async handler(ctx) {
      if (!hasFlag(ctx.args, "--confirm")) {
        return {
          ok: false,
          error: "memory-override requires --confirm (SAFE-4 two-phase)",
          exitCode: 1,
        };
      }
      const actor = resolveUser(ctx.args);
      if (!actor) {
        return {
          ok: false,
          error: "acting user required (--user or CORVIDINHO_ACTING_DISCORD_USER_ID)",
          exitCode: 1,
        };
      }
      const id =
        flagValue(ctx.args, "--id") ?? positionalAfterFlags(ctx.args)[0];
      let content = flagValue(ctx.args, "--content");
      if (!content) {
        const pos = positionalAfterFlags(ctx.args);
        content = (flagValue(ctx.args, "--id") ? pos : pos.slice(1)).join(" ");
      }
      if (!id || !content?.trim()) {
        return {
          ok: false,
          error:
            "usage: memory-override --user ID --id MEMORY_ID --confirm [--admin] <content>",
          exitCode: 1,
        };
      }
      const isAdmin = resolveIsAdmin(ctx.args);
      const { store, close } = openStore(ctx.args);
      try {
        const rec = store.override({
          actorUserId: actor,
          id,
          content,
          isAdmin,
        });
        return {
          ok: true,
          data: rec,
          message: ctx.json
            ? undefined
            : `overrode memory ${rec.id} (admin audit)`,
          exitCode: 0,
        };
      } catch (err) {
        return errResult(err);
      } finally {
        close();
      }
    },
  },
];
