---
change: global-project-path-flag-runs-the-cli-as-if-started-in-that-directory-that-project-s-fledge-toml-specs-and-env-files-as
artifact: docs
---

# Docs

- `README.md`: new "Another project without `cd` (CLI-5)" section under
  Quick start — usage, which `.env` files load and who wins, start
  directory's values dropped, project `bunfig.toml` never read, spawns keep
  `--no-env-file`, error on a bad path.
- `.env.example` header: a checkout-root `.env` is auto-loaded for
  processes started there; with `--project <path>` the `.env` files in
  `<path>` load instead (the old text became incomplete).
- `corvidinho --help`: one `--project <path>` line.
- `docs/DAEMON.md` (`CORVIDINHO_BIN` default `<cwd>/src/cli.ts`) stays
  true: with `--project` the cwd is the project.
