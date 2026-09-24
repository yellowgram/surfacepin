# SurfacePin STATUS

**Date:** 2026-09-24 (America/New_York)  
**Founder:** yellowgram  
**Kickoff:** authorized

## Done

### v1.0.0
- [x] `SPEC.md` — `surfacepin-jcs-v1` canonicalization + lockfile format v1
- [x] TypeScript package `surfacepin` — core APIs + CLI `lock|verify|diff`
- [x] Golden vectors under `testdata/` + unit tests
- [x] Composite GitHub Action under `action/` (`uses: yellowgram/surfacepin/action@v1`)
- [x] `examples/`, MIT `LICENSE`, `README.md`, CI
- [x] Published to npm: `surfacepin@1.0.0`

### v1.1.0
- [x] Live MCP **stdio** adapter (`--stdio -- <command> [args…]`) for `lock` / `verify` / `diff`
- [x] Reuses existing canonicalize/hash/lock/verify; adapter only produces `{ tools: [...] }`
- [x] Stub MCP child + integration tests; Action remains file-based
- [x] Dep: `@modelcontextprotocol/sdk` (+ `zod` peer) for Client + StdioClientTransport
- [x] Wire format unchanged (adapter out of band); version `1.1.0`
- [x] Published to npm: `surfacepin@1.1.0` (https://www.npmjs.com/package/surfacepin) on 2026-09-24

## How to run

```bash
git clone https://github.com/yellowgram/surfacepin.git
cd surfacepin
npm install
npm test
node dist/cli.js lock examples/tools.json -o surfacepin.lock.json
node dist/cli.js verify examples/tools.json examples/surfacepin.lock.json
node dist/cli.js lock --stdio -- node testdata/stub-mcp-server.mjs
node dist/cli.js verify --stdio surfacepin.lock.json -- node testdata/stub-mcp-server.mjs
```

Exit: 0 match, 1 drift, 2 usage/error.

## Repo URL

https://github.com/yellowgram/surfacepin

## Known gaps (intentional)

- No Streamable HTTP / SSE live fetch yet (stdio is enough this cut)
- Only tools surface (`name`, `description`, `inputSchema`); ignores annotations/outputSchema
- Diff is name-level + digest, not structured JSON Schema field diff
- Lockfiles are not signed
- Action stays file-based (live stdio is local/CLI)

## Suggested next

1. Pin `resources/list` + `prompts/list` with same core
2. Optional Streamable HTTP live fetch (if cheap)
3. Structured schema diff (which JSON Schema keywords changed)
4. Conformance suite packaged for external implementations
5. Optional signed lockfiles (minisign / sigstore) — still exact-hash underneath
