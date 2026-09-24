# SurfacePin

Lock **exact hashes** of an MCP server’s list surfaces and fail CI when they drift silently:

- **tools** — `name`, `description`, `inputSchema`
- **resources** — `uri`, `name`, `description`, `mimeType`
- **prompts** — `name`, `description`, `arguments`

This is deterministic byte-level hashing — **not** semantic / LLM / embedding drift detection. If a description character changes, the digest changes.

Spec: [SPEC.md](./SPEC.md) (canonicalization `surfacepin-jcs-v1` + lockfile v1/v2).

## 60-second start

```bash
# Node 20+
npm install -g surfacepin   # or: npx surfacepin … / npm install surfacepin --save-dev

# Tools only (default) — lockfile v1, backward compatible
surfacepin lock tools.json -o surfacepin.lock.json
surfacepin verify tools.json surfacepin.lock.json
surfacepin diff tools.json surfacepin.lock.json

# Multi-surface — lockfile v2
surfacepin lock surface.json --surface tools,resources,prompts -o surfacepin.lock.json
surfacepin verify surface.json surfacepin.lock.json --surface tools,resources,prompts
```

File mode accepts a combined dump `{ "tools": [...], "resources": [...], "prompts": [...] }` (or List*Result-shaped). Missing selected keys → empty.

### Live MCP (stdio)

```bash
surfacepin lock --stdio -- npx -y @modelcontextprotocol/server-everything
surfacepin lock --stdio --surface tools,resources,prompts -- npx -y @modelcontextprotocol/server-everything
surfacepin verify --stdio --surface tools,resources,prompts surfacepin.lock.json -- npx -y @modelcontextprotocol/server-everything
```

Everything after `--` is the server command + args. Servers lacking a capability → empty list + stderr note.

Exit codes: `0` match, `1` drift, `2` usage/parse error.

Commit `surfacepin.lock.json`. Re-lock when you intentionally change the surface.

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

## What v1.2 does / does not

| Does | Does not |
|------|----------|
| Hash tools + resources + prompts | Structured schema field-level diffs |
| Lockfile v1 (tools) + v2 (multi-surface) | Streamable HTTP / SSE (stdio only) |
| Offline verify from JSON files | Semantic similarity gates |
| Live list* via MCP stdio (`--stdio -- …`) | Hosted service, telemetry, signed locks |
| Diff reports which surface drifted | Resource templates list |

## License

MIT © 2026 yellowgram
