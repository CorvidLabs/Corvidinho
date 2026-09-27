# agent.3md (light adopt)

Corvidinho ships a root [`agent.3md`](../agent.3md) — a guidance-only
[agent3md/1](https://github.com/CorvidLabs/agent-3md) catalog (Magpie/let
convention for `let find agents`).

- **Plane 0** — identity (HI-first, SpecSync, Discord bridge rules, SAFE plugins).
- **Skill planes** — playbooks only (`hi-first`, `discord-ask`, `specsync`,
  `no-secrets`, `safe-plugins`). **No** `tool=` bindings; real tools stay in
  `plugins/` (SAFE registry).
- **Loader** — `@corvidlabs/agent3md` is a package dependency; smoke:
  `bun test tests/agent3md.smoke.test.ts`.
- **Not AGENT-13** — the agent loop does **not** load this file for progressive
  disclosure yet. See `hi/agent.md` Notes and `STATUS.md`.

```ts
import { Agent, validateAgent } from "@corvidlabs/agent3md";
import { readFileSync } from "node:fs";

const src = readFileSync("agent.3md", "utf8");
validateAgent(src); // .ok
const agent = new Agent(src);
agent.route("discord ephemeral ask")[0].skill.name; // "discord-ask"
```
