import { loadDiscordPlugins } from "../../plugins/discord/index.ts";
import { loadGithubPlugins } from "../../plugins/github/index.ts";
import { loadMetaPlugins } from "../../plugins/meta/index.ts";
import { loadSpecsyncPlugins } from "../../plugins/specsync/index.ts";

let loaded = false;

/** Register in-repo built-in plugins once per process. */
export function loadBuiltins(): void {
  if (loaded) return;
  loadGithubPlugins();
  loadMetaPlugins();
  loadSpecsyncPlugins();
  loadDiscordPlugins();
  loaded = true;
}
