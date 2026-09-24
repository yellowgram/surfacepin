# SurfacePin STATUS

**Date:** 2026-09-24 (America/New_York)  
**Founder:** yellowgram  
**Kickoff:** authorized

## Done (v1)

- [x] `SPEC.md` — `surfacepin-jcs-v1` canonicalization + lockfile format v1
- [x] TypeScript package `surfacepin` — core APIs + CLI `lock|verify|diff`
- [x] Zero runtime dependencies (Node built-in `crypto` / `fs`)
- [x] Golden vectors under `testdata/` + unit tests (`npm test`)
- [x] Composite GitHub Action under `action/`
- [x] `examples/tools.json` + `examples/surfacepin.lock.json`
- [x] MIT `LICENSE` (© 2026 yellowgram)
- [x] `README.md` 60-second path; blunt exact-hash wording
- [x] `.github/workflows/ci.yml`
- [x] Public repo `yellowgram/surfacepin` (see below)

## How to run

```bash
cd /workspace/surfacepin   # or clone the GitHub repo
npm install
npm test
node dist/cli.js lock examples/tools.json -o surfacepin.lock.json
node dist/cli.js verify examples/tools.json examples/surfacepin.lock.json
node dist/cli.js diff examples/tools.json examples/surfacepin.lock.json
```

## Repo URL

https://github.com/yellowgram/surfacepin

## Known gaps (intentional for v1)

- File-based only — no live MCP stdio/HTTP `tools/list` client
- Only tools surface (`name`, `description`, `inputSchema`); ignores annotations/outputSchema
- Diff is name-level + digest, not structured JSON Schema field diff
- Lockfiles are not signed
- Action installs from action path / npm; no published `@v1` release tag until first tag is cut

## Suggested next

1. Tag `v1.0.0` / `v1` after npm publish decision (founder gate on publish)
2. Live MCP adapter (stdio) dumping tools JSON then lock/verify
3. Pin `resources/list` + `prompts/list` with same core
4. Structured schema diff (which JSON Schema keywords changed)
5. Conformance suite packaged for external implementations
6. Optional signed lockfiles (minisign / sigstore) — still exact-hash underneath
