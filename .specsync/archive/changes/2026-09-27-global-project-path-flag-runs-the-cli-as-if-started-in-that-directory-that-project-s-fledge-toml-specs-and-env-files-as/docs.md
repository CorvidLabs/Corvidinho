---
change: global-project-path-flag-runs-the-cli-as-if-started-in-that-directory-that-project-s-fledge-toml-specs-and-env-files-as
artifact: docs
---

# Docs

- `README.md`: new "Another project without `cd` (CLI-5)" section under
  Quick start — usage, which `.env` files load and who wins, start
  directory's values dropped, project `bunfig.toml` never read, spawns keep
  `--no-env-file`, error on a bad path.
- `README.md` (review): the tools the CLI starts get the project's env too;
  `bun --no-env-file` loads none; `discord bridge` / `github watch` /
  `daemon` default their agent binary to `<path>/src/cli.ts` (set
  `CORVIDINHO_BIN` for a non-Corvidinho project).
- `.env.example` header: a checkout-root `.env` is auto-loaded for
  processes started there; with `--project <path>` the `.env` files in
  `<path>` load instead (the old text became incomplete).
- `corvidinho --help`: one `--project <path>` line.
- `docs/DAEMON.md` (`CORVIDINHO_BIN` default `<cwd>/src/cli.ts`) stays
  true: with `--project` the cwd is the project.
