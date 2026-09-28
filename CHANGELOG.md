# Changelog

## 1.5.0

User-facing contributor path. Lockfile format, canonicalization (`surfacepin-jcs-v1`), and the hasher are unchanged. Pass/fail remains exact-hash digest equality. `HINT_FLIP` stays a field-diff label.

- GitHub Action accepts live stdio (`server-command` + `server-args`) and multi-surface (`surface`). Existing `tools-path` + `lockfile-path` file mode still works.
- Pre-commit hook (`.githooks/pre-commit`) verifies the same lockfile shape the Action verifies. This repo's `surfacepin.precommit` targets the offline stub.
- README five-minute path: lock over stdio, commit `surfacepin.lock.json`, wire Action + pre-commit.
- Ships the library `pin` / `verify` / `diff` (and stdio helpers) plus `examples/sdk-default-path` that were already on main after 1.4.0 and were not yet published.

Not in this version: npm publish and git tag `v1.5.0` (coordinator after merge). No lockfile rename. No Streamable HTTP.
