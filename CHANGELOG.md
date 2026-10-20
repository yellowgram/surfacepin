# Changelog

## 1.6.0

Existing lockfiles keep verifying exactly as in 1.5. Re-lock to get the new pins.

- **Titles are pinned.** New locks record canonicalization `surfacepin-jcs-v2`, which also hashes `title` on tools, resources and prompts, and tool `annotations.title`. Clients show `title` to people in approval prompts, so under 1.5 a title swap passed verify. Locks that record `surfacepin-jcs-v1` are still verified with v1 rules; `verify` prints a one-line re-lock note for them.
- **New `instructions` surface.** `--surface …,instructions` pins the `instructions` text from the server's `initialize` reply. Many clients pass it to the model.
- `verify --json` prints the same `DiffResult` as `diff --json`, with the same exit codes.
- `verify` and `diff` default to the surfaces stored in the lockfile, so `--surface` no longer has to be repeated in CI.
- **Fix:** the `--stdio` server now inherits the caller's environment. Before, it got only HOME/PATH/USER-style variables, so a server that reads an API key or feature flag could expose a different surface than in the user's client.
- **Fix:** names and field paths containing control characters are printed JSON-quoted, so a server-chosen name can't forge report lines.
- **Fix:** a server that repeats a list cursor, or returns more than 10,000 pages, is an error instead of a loop until the timeout.
- **Action:** on drift it writes the diff to the job summary and puts an error annotation on the lockfile. It turns off workflow commands while server text is printed, no longer glob-expands `server-args`, installs with `npm ci` from the tag, and drops the unpinned `npm install -g` fallback. Pin `@v1.6.0`.
- The MCP client identifies itself with the package version (it said 1.2.0). `surfacepin --version` was added. The npm package no longer ships compiled tests.
- Docs: README rewritten (quickstart, CI, comparison with mcp-scan, limits and threat model). Internal planning and status files removed. A stderr tip added on main after 1.5.0 (never released) is gone.

## 1.5.0

User-facing contributor path. Lockfile format, canonicalization (`surfacepin-jcs-v1`), and the hasher are unchanged. Pass/fail remains exact-hash digest equality. `HINT_FLIP` stays a field-diff label.

- GitHub Action accepts live stdio (`server-command` + `server-args`) and multi-surface (`surface`). Existing `tools-path` + `lockfile-path` file mode still works.
- Pre-commit hook (`.githooks/pre-commit`) verifies the same lockfile shape the Action verifies. This repo's `surfacepin.precommit` targets the offline stub.
- README five-minute path: lock over stdio, commit `surfacepin.lock.json`, wire Action + pre-commit.
- Ships the library `pin` / `verify` / `diff` (and stdio helpers) plus `examples/sdk-default-path` that were already on main after 1.4.0 and were not yet published.
- Docs: pin the Action at `@v1.5.0` (exact tag) for a reproducible hasher. `@v1` is a floating major tag and may move within 1.x; it is not that pin. Today `v1` still names the older file-mode action.

No lockfile rename. No Streamable HTTP. Git tag `v1.5.0` is the exact Action pin above.
