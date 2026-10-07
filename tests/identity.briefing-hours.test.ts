/**
 * COS-2.a (#102, REQ-discord-036 / REQ-discord-102) — each declared person's
 * briefing time zone and working hours come from the declared people list:
 * optional `timezone` (IANA name) and `working_hours` (`HH:MM-HH:MM`) on
 * `[people.<id>]`, set by the owner with `/admin people add` (audited like
 * every people change) or in the file. Fixture tests only: temp allowlist
 * files, in-memory SQLite, no network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAllowlist } from "../src/allowlist/load.ts";
import type { AllowlistConfig } from "../src/allowlist/types.ts";
import { appendAudit } from "../src/audit/index.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { planPeopleChange } from "../src/discord/admin-people.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type { SlashContext, SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import type { OwnerRecord } from "../src/identity/owner.ts";
import {
  loadDeclaredPeople,
  normalizePersonTimezone,
  normalizeWorkingHours,
  parsePeopleText,
  parseWorkingHours,
  resolvePerson,
} from "../src/identity/people.ts";
import { migrateCorvidinhoDb } from "../src/store/db.ts";

const OWNER_ID = "100000000000000001";
const TOFU_DC = "200000000000000002";
const CHAN = "400000000000000004";
const OWNER: OwnerRecord = { discordId: OWNER_ID, display: "Leif" };

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("declared people carry a briefing time zone and working hours (COS-2.a)", () => {
  test("TOML and JSON entries read timezone and working_hours, canonical spelling", () => {
    const toml = parsePeopleText(
      `[people.tofu]
display = "Tofu"
discord_ids = ["${TOFU_DC}"]
timezone = "europe/oslo"
working_hours = "8:30-16:30"

[people.ada]
discord_ids = ["300000000000000003"]
`,
      false,
    );
    expect(toml.issues).toEqual([]);
    const tofu = toml.people.find((p) => p.id === "tofu")!;
    expect(tofu.timezone).toBe("Europe/Oslo");
    expect(tofu.workingHours).toBe("08:30-16:30");
    const ada = toml.people.find((p) => p.id === "ada")!;
    expect(ada.timezone).toBeUndefined();
    expect(ada.workingHours).toBeUndefined();

    const json = parsePeopleText(
      JSON.stringify({
        people: { tofu: { discord_ids: [TOFU_DC], timezone: "America/New_York", working_hours: "07:00-15:00" } },
      }),
      true,
    );
    expect(json.people[0]!.timezone).toBe("America/New_York");
    expect(json.people[0]!.workingHours).toBe("07:00-15:00");
  });

  test("a bad time zone or hours makes the entry unreadable (skipped whole, no account id in the issue)", () => {
    for (const bad of [
      `timezone = "Mars/Olympus_Mons"`,
      `timezone = "+02:00"`,
      `timezone = ["Europe/Oslo", "UTC"]`,
      `working_hours = "17:00-09:00"`,
      `working_hours = "9am-5pm"`,
      `working_hours = "24:00-25:00"`,
    ]) {
      const r = parsePeopleText(`[people.tofu]\ndiscord_ids = ["${TOFU_DC}"]\nrole = "team"\n${bad}\n`, false);
      expect(r.people).toEqual([]);
      expect(r.invalid).toEqual(["tofu"]);
      expect(r.issues.join(" ")).toContain('person "tofu"');
      expect(r.issues.join(" ")).not.toContain(TOFU_DC);
    }
  });

  test("the zone and hours never match anyone; the person still resolves on stable ids only", () => {
    const dir = loadDeclaredPeople({ allowlist: { sourcePath: null }, owner: OWNER });
    expect(resolvePerson(dir, { discordId: OWNER_ID })?.role).toBe("owner");
    expect(normalizePersonTimezone("UTC")).toBe("UTC");
    expect(normalizePersonTimezone("Nope/Nowhere")).toBeUndefined();
    expect(normalizeWorkingHours("9:00 - 17:30")).toBe("09:00-17:30");
    expect(parseWorkingHours("09:00-17:30")).toEqual({ startMinute: 540, endMinute: 1050 });
    expect(parseWorkingHours("09:00-09:00")).toBeUndefined();
  });
});

const SAMPLE_TOML = `# operator notes stay
[discord]
channels = ["${CHAN}"]

[owner]
discord_id = "${OWNER_ID}"

[people.tofu]  # hand-written
display = "Tofu"
role = "team"
discord_ids = ["${TOFU_DC}"]
team = "infra"
`;

type Fixture = { path: string; ctx: SlashContext; db: Database };

async function fixture(): Promise<Fixture> {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-briefing-hours-"));
  tmpDirs.push(dir);
  const path = join(dir, "allowlist.toml");
  writeFileSync(path, SAMPLE_TOML);
  const env: NodeJS.ProcessEnv = { HOME: dir, CORVIDINHO_ALLOWLIST_FILE: path };
  const allowlist: AllowlistConfig = await loadAllowlist({ env, home: dir });
  const db = new Database(":memory:");
  migrateCorvidinhoDb(db);
  const ctx: SlashContext = {
    store: new SessionStore(),
    workStore: new WorkStore(),
    allowlist,
    agent: createEchoAgentClient({ delayMs: 0 }),
    version: "0.0.9",
    protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
    startedAt: Date.now(),
    channelIds: allowlist.discord.channels,
    owner: OWNER,
    mutedUsers: new Set(),
    env,
    recordAudit: (entry) => appendAudit(db, entry),
  };
  return { path, ctx, db };
}

async function run(f: Fixture, subcommand: string, options: SlashInteraction["options"], userId = OWNER_ID) {
  const replies: SlashReplyPayload[] = [];
  const i: SlashInteraction = {
    id: "ix_hours",
    commandName: "admin",
    subcommandGroup: "people",
    subcommand,
    channelId: CHAN,
    userId,
    options,
    reply: async (o) => {
      replies.push(o);
    },
  };
  await handleSlashInteraction(f.ctx, i);
  expect(replies).toHaveLength(1);
  expect(replies[0]?.ephemeral).toBe(true);
  return replies[0]!.content ?? "";
}

function audit(db: Database): Array<[string, string]> {
  return (db.query("SELECT action, outcome FROM audit_log ORDER BY seq").all() as Array<{ action: string; outcome: string }>).map(
    (r) => [r.action, r.outcome],
  );
}

describe("/admin people add sets a person's time zone and working hours (COS-2.a, ADMIN-3.a)", () => {
  test("owner sets and changes them: written as the person's keys only, audited, live without a restart", async () => {
    const f = await fixture();
    let out = await run(f, "add", { person: "tofu", timezone: "europe/oslo", hours: "8:30-16:30" });
    expect(out).toContain('✅ /admin people add: "tofu" (Tofu) — time zone Europe/Oslo; working hours 08:30-16:30.');
    expect(out).toContain("daily briefing follows it");
    const text = readFileSync(f.path, "utf8");
    expect(text).toContain(
      `[people.tofu]  # hand-written\ndisplay = "Tofu"\nrole = "team"\ntimezone = "Europe/Oslo"\nworking_hours = "08:30-16:30"\ndiscord_ids = ["${TOFU_DC}"]\nteam = "infra"\n`,
    );
    expect(text.startsWith("# operator notes stay\n[discord]")).toBe(true);
    expect(audit(f.db)).toEqual([
      ["admin-people-add", "started"],
      ["admin-people-add", "ok"],
    ]);
    const live = resolvePerson(loadDeclaredPeople({ allowlist: f.ctx.allowlist, owner: OWNER }), { discordId: TOFU_DC });
    expect(live?.person.timezone).toBe("Europe/Oslo");
    expect(live?.person.workingHours).toBe("08:30-16:30");
    expect(live?.role).toBe("team");

    out = await run(f, "add", { person: "tofu", timezone: "Europe/Oslo" });
    expect(out).toContain('No change: "tofu" is already declared as Tofu (time zone Europe/Oslo, hours 08:30-16:30)');

    out = await run(f, "add", { person: "tofu", hours: "10:00-18:00" });
    expect(out).toContain("working hours 08:30-16:30 → 10:00-18:00");
    expect(readFileSync(f.path, "utf8")).toContain('working_hours = "10:00-18:00"');

    out = await run(f, "list", {});
    expect(out).toContain("tz Europe/Oslo · hours 10:00-18:00");

    // A new person can be declared with them.
    out = await run(f, "add", { person: "bob", timezone: "America/New_York" });
    expect(out).toContain('✅ /admin people add: declared "bob" — time zone America/New_York.');
    expect(readFileSync(f.path, "utf8")).toContain('[people.bob]\ntimezone = "America/New_York"\n');
  });

  test("an invalid time zone or hours is refused, audited denied, and nothing is written", async () => {
    const f = await fixture();
    let out = await run(f, "add", { person: "tofu", timezone: "Mars/Olympus" });
    expect(out).toContain("Refused: timezone must be an IANA time zone name");
    out = await run(f, "add", { person: "tofu", hours: "17:00-09:00" });
    expect(out).toContain("Refused: hours must be HH:MM-HH:MM");
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE_TOML);
    expect(audit(f.db)).toEqual([
      ["admin-people-add", "denied"],
      ["admin-people-add", "denied"],
    ]);
  });

  test("a non-owner cannot set them (dispatcher + handler), and nothing changes", async () => {
    const f = await fixture();
    const out = await run(f, "add", { person: "tofu", timezone: "Europe/Oslo" }, TOFU_DC);
    expect(out.toLowerCase()).toContain("not authorized");
    expect(readFileSync(f.path, "utf8")).toBe(SAMPLE_TOML);
  });

  test("the plan writes only that person: JSON files keep every other key", () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-briefing-hours-json-"));
    tmpDirs.push(dir);
    const path = join(dir, "allowlist.json");
    writeFileSync(
      path,
      JSON.stringify({ discord: { channels: [CHAN] }, people: { tofu: { discord_ids: [TOFU_DC], note: "keep" } } }, null, 2),
    );
    const allowlist: AllowlistConfig = {
      sourcePath: path,
      github: { orgs: [], repos: [], users: [], denyOrgs: [], denyRepos: [], denyUsers: [] },
      discord: { channels: [CHAN], roles: [], users: [], denyChannels: [], denyRoles: [], denyUsers: [] },
    };
    const planned = planPeopleChange({
      allowlist,
      owner: OWNER,
      env: { CORVIDINHO_ALLOWLIST_FILE: path },
      request: { op: "add", personId: "tofu", timezone: "Asia/Tokyo", hours: "09:30-18:00" },
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.timezoneChanged).toBe(true);
    expect(planned.plan.hoursChanged).toBe(true);
    const next = JSON.parse(planned.plan.newText!);
    expect(next.people.tofu).toEqual({
      timezone: "Asia/Tokyo",
      working_hours: "09:30-18:00",
      discord_ids: [TOFU_DC],
      note: "keep",
    });
  });
});
