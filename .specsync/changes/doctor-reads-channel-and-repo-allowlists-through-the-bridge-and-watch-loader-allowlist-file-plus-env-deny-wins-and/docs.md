---
change: doctor-reads-channel-and-repo-allowlists-through-the-bridge-and-watch-loader-allowlist-file-plus-env-deny-wins-and
artifact: docs
---

# Docs

- `specs/cli/cli.spec.md`: `src/doctor.ts` and the new test in the files
  list; Public API rows for the `src/doctor.ts` exports; a doctor invariant;
  error-table rows for the allowlist and data-dir cases.
- `specs/cli/requirements.md` REQ-cli-003 is updated from the delta when the
  change is materialized.
- `docs/DISCORD-GO-LIVE.md`: the paragraph that said doctor's Discord check
  reads env only now says it reads the allowlist file + env like the bridge.
- `docs/BOX-UPDATE.md`: the checks that must pass include `data-dir`;
  `llm` is a warning only.
- `corvidinho --help`: the doctor line names LLM key / data dir.
- No CHANGELOG / STATUS / package.json edit (bug-fix slice).
