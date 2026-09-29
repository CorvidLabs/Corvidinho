/**
 * WATCH router — allowlist before session (ALLOW-1/2/5); fixture only.
 */
import { describe, expect, test } from "bun:test";
import { emptyConfig } from "../src/allowlist/types.ts";
import { routeEvent } from "../src/watch/router.ts";
import { SessionStore } from "../src/watch/session-store.ts";
import { NOT_AUTHORIZED, type DetectedEvent } from "../src/watch/types.ts";

function allowCfg(over: {
  orgs?: string[];
  repos?: string[];
  users?: string[];
} = {}) {
  const cfg = emptyConfig();
  cfg.github.orgs = (over.orgs ?? ["CorvidLabs"]).map((s) => s.toLowerCase());
  cfg.github.repos = (over.repos ?? ["CorvidLabs/Corvidinho"]).map((s) =>
    s.toLowerCase(),
  );
  cfg.github.users = (over.users ?? ["0xLeif"]).map((s) => s.toLowerCase());
  return cfg;
}

function baseEvent(over: Partial<DetectedEvent> = {}): DetectedEvent {
  return {
    id: over.id ?? "comment-1",
    type: over.type ?? "issue_comment",
    body: over.body ?? "@corvid-agent hi",
    sender: over.sender ?? "0xLeif",
    repo: over.repo ?? "CorvidLabs/Corvidinho",
    number: over.number ?? 42,
    title: over.title ?? "t",
    htmlUrl: over.htmlUrl ?? "https://example.com",
    createdAt: over.createdAt ?? "2026-09-26T12:00:00Z",
    isPullRequest: over.isPullRequest ?? false,
  };
}

describe("watch routeEvent (ALLOW-1)", () => {
  test("allowlisted mention starts session", () => {
    const store = new SessionStore();
    const action = routeEvent(baseEvent(), {
      store,
      allowlist: allowCfg(),
    });
    expect(action.kind).toBe("start_session");
    if (action.kind === "start_session") {
      expect(action.session.repo).toBe("CorvidLabs/Corvidinho");
      expect(action.session.number).toBe(42);
      expect(action.prompt).toContain("@0xLeif");
    }
    expect(store.bySessionId.size).toBe(1);
  });

  test("same repo#number continues session", () => {
    const store = new SessionStore();
    const a1 = routeEvent(baseEvent({ id: "c1" }), {
      store,
      allowlist: allowCfg(),
    });
    expect(a1.kind).toBe("start_session");
    if (a1.kind !== "start_session") return;
    const a2 = routeEvent(baseEvent({ id: "c2", body: "follow-up" }), {
      store,
      allowlist: allowCfg(),
    });
    expect(a2.kind).toBe("continue_session");
    if (a2.kind === "continue_session") {
      expect(a2.session.id).toBe(a1.session.id);
    }
  });

  test("non-allowlisted user refuses quietly (ALLOW-5)", () => {
    const store = new SessionStore();
    const action = routeEvent(baseEvent({ sender: "stranger" }), {
      store,
      allowlist: allowCfg(),
    });
    expect(action.kind).toBe("refuse");
    if (action.kind === "refuse") {
      expect(action.reply).toBe(NOT_AUTHORIZED);
      expect(action.reason).toBe("user_not_allowlisted");
    }
    expect(store.bySessionId.size).toBe(0);
  });

  test("non-allowlisted repo refuses", () => {
    const store = new SessionStore();
    const action = routeEvent(baseEvent({ repo: "OtherOrg/Other" }), {
      store,
      allowlist: allowCfg({ orgs: ["CorvidLabs"], repos: [] }),
    });
    expect(action.kind).toBe("refuse");
    expect(store.bySessionId.size).toBe(0);
  });

  test("empty user allowlist denies all senders", () => {
    const store = new SessionStore();
    const cfg = allowCfg();
    cfg.github.users = [];
    const action = routeEvent(baseEvent(), { store, allowlist: cfg });
    expect(action.kind).toBe("refuse");
    expect(store.bySessionId.size).toBe(0);
  });

  // Deny always wins (ALLOW-2 / ALLOW-5): a user or org on a deny list is
  // refused even when the allow list also names them.
  test("deny_users wins over an allowlisted user: refused, no session", () => {
    const store = new SessionStore();
    const cfg = allowCfg({ users: ["0xLeif", "mallory"] });
    cfg.github.denyUsers = ["mallory"];
    const action = routeEvent(baseEvent({ sender: "Mallory" }), {
      store,
      allowlist: cfg,
    });
    expect(action.kind).toBe("refuse");
    if (action.kind === "refuse") {
      expect(action.reply).toBe(NOT_AUTHORIZED);
      expect(action.reason).toBe("user_not_allowlisted");
    }
    expect(store.bySessionId.size).toBe(0);
    // The allowlisted, undenied user still starts a session.
    expect(routeEvent(baseEvent(), { store, allowlist: cfg }).kind).toBe(
      "start_session",
    );
  });

  test("deny_orgs wins over an allowlisted repo: refused, no session", () => {
    const store = new SessionStore();
    const cfg = allowCfg({ orgs: [], repos: ["EvilOrg/x"] });
    cfg.github.denyOrgs = ["evilorg"];
    const action = routeEvent(baseEvent({ repo: "EvilOrg/x" }), {
      store,
      allowlist: cfg,
    });
    expect(action.kind).toBe("refuse");
    if (action.kind === "refuse") {
      expect(action.reply).toBe(NOT_AUTHORIZED);
      expect(action.reason).toBe("repo_not_allowlisted");
    }
    expect(store.bySessionId.size).toBe(0);
  });

  // ALLOW-1/2: an assignment or review request is made by the user who
  // assigned / requested (actor), who must pass the user gate too.
  describe("assignment / review_request actor gate", () => {
    const assign = (actor?: string): DetectedEvent => ({
      ...baseEvent({ id: "assign-CorvidLabs/Corvidinho#42", type: "assignment" }),
      ...(actor ? { actor } : {}),
    });
    const reviewReq = (actor?: string): DetectedEvent => ({
      ...baseEvent({
        id: "reviewreq-CorvidLabs/Corvidinho#42",
        type: "review_request",
        isPullRequest: true,
      }),
      ...(actor ? { actor } : {}),
    });

    for (const [name, mk] of [
      ["assignment", assign],
      ["review_request", reviewReq],
    ] as const) {
      test(`${name} by a non-allowlisted actor on an allowlisted author's thread is refused`, () => {
        const store = new SessionStore();
        const action = routeEvent(mk("stranger"), { store, allowlist: allowCfg() });
        expect(action.kind).toBe("refuse");
        if (action.kind === "refuse") {
          expect(action.reason).toBe("actor_not_allowlisted");
          expect(action.reply).toBe(NOT_AUTHORIZED);
        }
        expect(store.bySessionId.size).toBe(0);
      });

      test(`${name} with no actor is refused (fail closed)`, () => {
        const store = new SessionStore();
        const action = routeEvent(mk(), { store, allowlist: allowCfg() });
        expect(action.kind).toBe("refuse");
        if (action.kind === "refuse") {
          expect(action.reason).toBe("actor_not_allowlisted");
        }
        expect(store.bySessionId.size).toBe(0);
      });

      test(`${name} by a deny-listed actor is refused even when allowlisted`, () => {
        const store = new SessionStore();
        const cfg = allowCfg({ users: ["0xLeif", "mallory"] });
        cfg.github.denyUsers = ["mallory"];
        const action = routeEvent(mk("Mallory"), { store, allowlist: cfg });
        expect(action.kind).toBe("refuse");
        expect(store.bySessionId.size).toBe(0);
      });

      test(`${name} by an allowlisted actor starts a session for the author`, () => {
        const store = new SessionStore();
        const cfg = allowCfg({ users: ["0xLeif", "alice"] });
        const action = routeEvent(mk("Alice"), { store, allowlist: cfg });
        expect(action.kind).toBe("start_session");
        if (action.kind === "start_session") {
          expect(action.session.userId).toBe("0xLeif");
        }
        expect(store.bySessionId.size).toBe(1);
      });

      test(`${name} by an allowlisted actor on a non-allowlisted author's thread is refused`, () => {
        const store = new SessionStore();
        const action = routeEvent(
          { ...mk("0xLeif"), sender: "stranger" },
          { store, allowlist: allowCfg() },
        );
        expect(action.kind).toBe("refuse");
        if (action.kind === "refuse") {
          expect(action.reason).toBe("user_not_allowlisted");
        }
        expect(store.bySessionId.size).toBe(0);
      });
    }

    test("mentions and comments do not need an actor", () => {
      const store = new SessionStore();
      expect(routeEvent(baseEvent(), { store, allowlist: allowCfg() }).kind).toBe(
        "start_session",
      );
      expect(
        routeEvent(baseEvent({ id: "issue-x", type: "issues", number: 43 }), {
          store,
          allowlist: allowCfg(),
        }).kind,
      ).toBe("start_session");
    });
  });
});
