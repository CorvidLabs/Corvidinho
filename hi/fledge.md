---
hi: 1
families: [FLEDGE]
owner: leif
---

# Fledge

## Intent

Fledge is how Corvidinho projects declare work and prove it. Corvidinho does not replace Fledge; it runs as a careful citizen of `fledge.toml`, lanes, and plugins so the same verify story works for humans and for the agent.

## Criteria

- **FLEDGE-1**  A Corvidinho project can be driven from a `fledge.toml` that names tasks and lanes the same way our other CorvidLabs repos do.
- **FLEDGE-2**  When the agent finishes a change, it runs the project’s verify lane through Fledge instead of inventing its own ad-hoc checklist.
- **FLEDGE-3**  I can run the same verify lane myself from the shell and get the same gate the agent is held to.
- **FLEDGE-4**  Corvidinho can discover and call Fledge plugins that are registered for the project, including ones I author.
- **FLEDGE-5**  Plugin schemas stay small enough that the agent can afford them; I can see when the tool surface is blowing the context budget.
- **FLEDGE-6**  Spec checking is available as a Fledge task on the verify path, not a separate secret ritual.
- **FLEDGE-7**  On Linux I can install and use Corvidinho against Fledge without needing a desktop app or a Windows toolchain.
