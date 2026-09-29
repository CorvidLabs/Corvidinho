import { get, register } from "../../src/plugins/registry.ts";
import { githubCommands } from "./commands.ts";
import { githubPublicDocsCommands } from "./public-docs.ts";
import { githubReviewCommands } from "./review.ts";

export function loadGithubPlugins(): void {
  for (const cmd of [...githubCommands, ...githubReviewCommands, ...githubPublicDocsCommands]) {
    if (!get(cmd.name)) register(cmd);
  }
}

export { githubCommands, githubPublicDocsCommands, githubReviewCommands };
