# SurfacePin

Lock **exact hashes** of an MCP server’s list surfaces and fail CI when they drift silently:

- **tools** — `name`, `description`, `inputSchema`, `annotations`, `outputSchema`
- **resources** — `uri`, `name`, `description`, `mimeType`
- **prompts** — `name`, `description`, `arguments`

This is deterministic byte-level hashing — **not** semantic / LLM / embedding drift detection. If a description character changes, the digest changes.

On mismatch, **lockfile v3** also explains *what* changed with a deterministic field-diff (`COMPATIBLE` | `BREAKING` | `HINT_FLIP`). Pass/fail remains digest equality. Re-lock after upgrading to ≥1.4.

Spec: [SPEC.md](./SPEC.md) (Lockfile Spec v1.4; canonicalization `surfacepin-jcs-v1` + lockfile v1/v2/v3).

## 60-second start

```bash
# Node 20+
npm install -g surfacepin   # or: npx surfacepin … / npm install surfacepin --save-dev

# Lock (writes lockfile v3 with embedded surfaces for structured diff)
surfacepin lock tools.json -o surfacepin.lock.json
surfacepin verify tools.json surfacepin.lock.json
surfacepin diff tools.json surfacepin.lock.json

# Multi-surface
surfacepin lock surface.json --surface tools,resources,prompts -o surfacepin.lock.json
surfacepin verify surface.json surfacepin.lock.json --surface tools,resources,prompts
```

File mode accepts a combined dump `{ "tools": [...], "resources": [...], "prompts": [...] }` (or List*Result-shaped). Missing selected keys → empty.

Verify still accepts older **v1** / **v2** lockfiles (digest-only). Re-lock to get v3 field-diff.

### Live MCP (stdio)

```bash
surfacepin lock --stdio -- npx -y @modelcontextprotocol/server-everything
surfacepin lock --stdio --surface tools,resources,prompts -- npx -y @modelcontextprotocol/server-everything
surfacepin verify --stdio --surface tools,resources,prompts surfacepin.lock.json -- npx -y @modelcontextprotocol/server-everything
```

Everything after `--` is the server command + args. Servers lacking a capability → empty list + stderr note.

Exit codes: `0` match, `1` drift, `2` usage/parse error.

Commit `surfacepin.lock.json`. Re-lock when you intentionally change the surface.

### Structured diff example

When a tool’s `inputSchema` drifts under a v3 lock:

```
DRIFT: surface does not match lockfile
CHANGED echo
        f35d75b2… -> a6fdd0e9…
        CHANGED description (COMPATIBLE)
                "Echo text back" -> "Echo text back (updated)"
        ADDED   inputSchema.properties.lang (COMPATIBLE)
                + {"type":"string"}
        CHANGED inputSchema.properties.text.type (BREAKING)
                "string" -> "number"
        ADDED   inputSchema.required["lang"] (BREAKING)
                + "lang"
        CHANGED annotations.readOnlyHint (HINT_FLIP)
                true -> false
```

Machine output: `surfacepin diff … --json`.

### Local from this repo

```bash
npm install
npm test
node dist/cli.js lock examples/tools.json -o /tmp/sp.lock.json
node dist/cli.js lock testdata/basic.surface.json --surface tools,resources,prompts -o /tmp/sp-multi.lock.json
node dist/cli.js lock --stdio --surface tools,resources,prompts -- node testdata/stub-mcp-server.mjs
```

## GitHub Action

```yaml
- uses: yellowgram/surfacepin/action@v1
  with:
    tools-path: path/to/tools.json
    lockfile-path: surfacepin.lock.json
```

Composite action under [`action/`](./action/). File-based tools verify (CI usually commits a tools dump + lockfile). Live `--stdio` and multi-surface file inputs are CLI/local for now.

Or call the CLI yourself after `npm install surfacepin`.

## What v1.4 does / does not

| Does | Does not |
|------|----------|
| Hash tools (+ annotations, outputSchema) + resources + prompts | Semantic similarity gates |
| Lockfile v3 (embedded surfaces) + verify v1/v2/v3 | Streamable HTTP / SSE (stdio only) |
| Deterministic field-diff: COMPATIBLE / BREAKING / HINT_FLIP | LLM / fuzzy matching; safety verdicts from hints |
| Offline verify from JSON files | Hosted service, telemetry, signed locks |
| Live list* via MCP stdio (`--stdio -- …`) | Resource templates / initialize.instructions |
| Ignore tool title / icons / _meta | Materialize MCP annotation defaults into hashes |

## License

MIT © 2026 yellowgram
