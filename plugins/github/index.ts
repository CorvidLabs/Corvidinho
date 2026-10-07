import { get, register } from "../../src/plugins/registry.ts";
import { githubCommands } from "./commands.ts";
import { githubPrMerge } from "./merge.ts";
import { githubPublicDocsCommands } from "./public-docs.ts";
import { githubReviewCommands } from "./review.ts";

export function loadGithubPlugins(): void {
  // GITHUB-7.a: the gated github-pr-merge registers first, so no other
  // GitHub command list can take its name (a later duplicate is skipped).
  for (const cmd of [githubPrMerge, ...githubCommands, ...githubReviewCommands, ...githubPublicDocsCommands]) {
    if (!get(cmd.name)) register(cmd);
  }
}

export { githubCommands, githubPrMerge, githubPublicDocsCommands, githubReviewCommands };
