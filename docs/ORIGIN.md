# Origin — why Corvidinho

Corvidinho is the **third** CorvidLabs agent-runner iteration. It keeps what
worked, drops what did not, and stays light enough for bots and VMs. This page
honors the ancestors. It does not trash them.

## 1. CorvidLabs/corvid-agent — first iteration

**corvid-agent** was the first serious agent runner. It was **highly
successful** — the team loved it. Product and ops habits that still shape
CorvidLabs (HI-first intent, Fledge lanes, SpecSync citizenship, safe secrets
handling) started there.

It was **paused** when Anthropic framed Claude Max / subscription-style use as
**not OK** for this API-shaped product path. The team moved to **full API
billing** rather than stretch a consumer subscription into an API-shaped
runner. That fork in the road is why later runners assume metered API use.

Keep stealing from corvid-agent: culture, intent discipline, and the proof that
a loved internal agent is worth building carefully.

## 2. CorvidLabs/merlin — second iteration

**merlin** was the second runner: a **full API-use** agent on
**SpecSync + Fledge**. It proved the toolchain path after the billing shift.
It got **less traction** than corvid-agent as a daily driver.

Steal from merlin (not as primary product surface):

- **Fledge plugins** and the plugin-first habit
- **Prove-before-done** gates (verify lanes, evidence before claims)
- **Bridges** between tools and runtimes

Do **not** treat iced desktop UI as Corvidinho’s primary shape. Merlin’s
desktop experiments stay optional inspiration, not the default target.

## 3. CorvidLabs/Corvidinho — third / current

**Corvidinho** is the current runner: **best of both**, kept **light**.

- Runs on **bots and VMs** (Linux-first Bun/TypeScript)
- **Any agent** on the team can use it
- Citizens of **Fledge + SpecSync** without dragging a heavy desktop shell
- HI-first (`hi/`); no invented ACCESS / bounty / MainNet surfaces

Lineage in one line: *loved corvid-agent culture → API-honest merlin toolchain →
light Corvidinho that any agent can run.*

## See also

- [`STATUS.md`](../STATUS.md) — current bootstrap status
- [`docs/CORVIDINHO-FEATURE-STEAL.md`](CORVIDINHO-FEATURE-STEAL.md) — steal/defer notes (not AC)
- [`hi/`](../hi/) — human intent criteria
