/**
 * IDENTITY-11.a — only the owner and a declared team member start /work;
 * community (declared community and anyone undeclared) cannot. Tests that
 * drive /work as a non-owner declare that user team here.
 *
 * `teamPeopleFile` writes a temp allowlist file with one `[people.*]` entry
 * (`role = "team"`) per Discord id and returns its path: a bridge test passes
 * it as `CORVIDINHO_ALLOWLIST_FILE`; a handler test sets it as its ctx
 * allowlist's `sourcePath` (`declareTeam`), which the /work handler's people
 * loader reads at the time of the command.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function teamPeopleFile(...discordIds: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "corvidinho-team-people-"));
  const path = join(dir, "allowlist.toml");
  writeFileSync(
    path,
    discordIds
      .map((id, i) => `[people.team${i + 1}]\nrole = "team"\ndiscord_ids = ["${id}"]\n`)
      .join("\n"),
  );
  return path;
}

/** Point `allowlist.sourcePath` at a file declaring each id a team member. */
export function declareTeam<T extends { sourcePath: string | null }>(
  allowlist: T,
  ...discordIds: string[]
): T {
  allowlist.sourcePath = teamPeopleFile(...discordIds);
  return allowlist;
}
