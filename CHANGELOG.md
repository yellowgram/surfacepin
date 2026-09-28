# Changelog

## 1.5.0

User-facing contributor path. Lockfile format, canonicalization (`surfacepin-jcs-v1`), and the hasher are unchanged. Pass/fail remains exact-hash digest equality. `HINT_FLIP` stays a field-diff label.

- GitHub Action accepts live stdio (`server-command` + `server-args`) and multi-surface (`surface`). Existing `tools-path` + `lockfile-path` file mode still works.
- Pre-commit hook (`.githooks/pre-commit`) verifies the same lockfile shape the Action verifies. This repo's `surfacepin.precommit` targets the offline stub.
- README five-minute path: lock over stdio, commit `surfacepin.lock.json`, wire Action + pre-commit.
- Ships the library `pin` / `verify` / `diff` (and stdio helpers) plus `examples/sdk-default-path` that were already on main after 1.4.0 and were not yet published.
- Docs: pin the Action at `@v1.5.0` (exact tag) for a reproducible hasher. `@v1` is a floating major tag and may move within 1.x; it is not that pin. Today `v1` still names the older file-mode action.

No lockfile rename. No Streamable HTTP. Git tag `v1.5.0` is the exact Action pin above.
