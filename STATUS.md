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
- [x] Published to npm: `surfacepin@1.1.0` on 2026-09-24

### v1.2.0
- [x] Exact-hash pin for `resources/list` + `prompts/list` (same `surfacepin-jcs-v1` core)
- [x] Lockfile **v2** multi-surface sections `{ tools, resources, prompts }` with per-section root + overall root
- [x] Tools-only default still wrote **v1** (backward compatible); verify accepts v1 + v2
- [x] CLI `--surface tools,resources,prompts` (default `tools`)
- [x] Stdio adapter lists selected surfaces; missing capabilities → empty + stderr note
- [x] Diff reports which surface drifted
- [x] Golden vectors + tests; Action stays tools-file-based
- [x] Published to npm: `surfacepin@1.2.0`

### v1.3.0
- [x] Lockfile **v3**: embed exact hashed `surface` payload on each entry (offline structured diff)
- [x] New locks always write v3 (tools-only included); verify still accepts v1 + v2 + v3
- [x] Deterministic JSON Schema field-diff for tool `inputSchema` (+ prompt args / resource fields)
- [x] Breaking vs non-breaking classification (SPEC §6); pass/fail remains digest equality
- [x] `surfacepin diff` prints path-level changes; `--json` for machine output
- [x] Golden cases + unit/integration tests; `npm test` green
- [x] No new runtime deps
- [x] Published to npm: `surfacepin@1.3.0` on 2026-09-24

## How to run

```bash
git clone https://github.com/yellowgram/surfacepin.git
cd surfacepin
npm install
npm test
node dist/cli.js lock examples/tools.json -o surfacepin.lock.json
node dist/cli.js verify examples/tools.json examples/surfacepin.lock.json
node dist/cli.js lock testdata/basic.surface.json --surface tools,resources,prompts -o /tmp/multi.lock.json
node dist/cli.js lock --stdio --surface tools,resources,prompts -- node testdata/stub-mcp-server.mjs
```

Exit: 0 match, 1 drift, 2 usage/error.

## Repo URL

https://github.com/yellowgram/surfacepin

### v1.4.0

- [x] Complete agent-visible tool descriptor: hash `annotations` (drop `title`) + `outputSchema`
- [x] Keep 1.3 coercions for `description` / `inputSchema`; do not materialize MCP annotation defaults
- [x] Diff taxonomy: `COMPATIBLE` | `BREAKING` | `HINT_FLIP` (`kinds` array); pass/fail still digest-only
- [x] SPEC / STATUS / README + golden tests; lockfile write remains v3; algorithm id unchanged
- [x] Action unchanged; no new runtime deps
- [ ] npm publish / git tag — founder-gated

### v1.5.0

- [x] Five-minute path in README: lock live stdio → commit `surfacepin.lock.json` → Action + pre-commit verify that file
- [x] Action: `surface`, `server-command`, `server-args` (stdio + multi-surface). `tools-path` + `lockfile-path` file mode kept
- [x] Pre-commit: `.githooks/pre-commit` + `surfacepin.precommit` (offline stub; same stdio verify as CI `stdio-stub`)
- [x] CI `action-verify` matrix: file-tools, file-multi, stdio stub, sdk-default-path stdio (`uses: ./action`)
- [x] Library `pin` / `verify` / `diff` (+ stdio helpers) and `examples/sdk-default-path` (landed on main after 1.4.0; shipping in this version)
- [ ] npm publish and git tag `v1.5.0` — coordinator after merge (no npm credentials here; tag not pushed)

### Still not this cut

- [ ] Official MCP SDK example/generator PR
- [ ] ClaimPin / attestation registry — after a real dependent exists

## Known gaps (intentional — document, do not implement this cut)

- `initialize.instructions` not pinned
- Resource templates (`resources/templates/list`) not pinned
- `tool.title` / `tool.icons` / `tool._meta` ignored (decorative)
- `resource.annotations` not hashed
- `prompt.title` / `prompt.icons` / `prompt._meta` ignored
- No Streamable HTTP / SSE live fetch yet (stdio is enough; Action can run that stdio command)
- Lockfiles are not signed

## Suggested next

1. Use `sdk-default-path` as the template for one generator/skill PR under the MCP SDK — do not invent a new product
2. Optional Streamable HTTP live fetch (if cheap)
3. ClaimPin / attestation only after a real dependent exists
