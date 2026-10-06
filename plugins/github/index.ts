import { get, register } from "../../src/plugins/registry.ts";
import { githubCommands } from "./commands.ts";
import { githubPrMerge } from "./merge.ts";
import { githubPublicDocsCommands } from "./public-docs.ts";
import { githubReviewCommands } from "./review.ts";

export function loadGithubPlugins(): void {
  for (const cmd of [...githubCommands, githubPrMerge, ...githubReviewCommands, ...githubPublicDocsCommands]) {
    if (!get(cmd.name)) register(cmd);
  }
}

export { githubCommands, githubPrMerge, githubPublicDocsCommands, githubReviewCommands };
