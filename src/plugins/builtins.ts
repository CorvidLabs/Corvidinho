import { loadDiscordPlugins } from "../../plugins/discord/index.ts";
import { loadGithubPlugins } from "../../plugins/github/index.ts";
import { loadMetaPlugins } from "../../plugins/meta/index.ts";
import { loadSpecsyncPlugins } from "../../plugins/specsync/index.ts";
import { size } from "./registry.ts";

let loaded = false;

/** Register in-repo built-in plugins once per process (retry after clearRegistry). */
export function loadBuiltins(): void {
  if (loaded && size() > 0) return;
  loadGithubPlugins();
  loadMetaPlugins();
  loadSpecsyncPlugins();
  loadDiscordPlugins();
  loaded = true;
}
