# SurfacePin

Lock **exact hashes** of an MCP server’s `tools/list` surface (`name`, `description`, `inputSchema`) and fail CI when it drifts silently.

This is deterministic byte-level hashing — **not** semantic / LLM / embedding drift detection. If a description character changes, the digest changes.

Spec: [SPEC.md](./SPEC.md) (canonicalization `surfacepin-jcs-v1` + lockfile format v1).

## 60-second start

```bash
# Node 20+
npm install -g surfacepin   # or: npx surfacepin … / npm install surfacepin --save-dev

# From a tools/list JSON dump (MCP ListToolsResult or { "tools": [...] })
surfacepin lock tools.json -o surfacepin.lock.json
surfacepin verify tools.json surfacepin.lock.json
surfacepin diff tools.json surfacepin.lock.json
```

Exit codes: `0` match, `1` drift, `2` usage/parse error.

Commit `surfacepin.lock.json`. Re-lock when you intentionally change the tool surface.

### Local from this repo

```bash
npm install
npm test
node dist/cli.js lock examples/tools.json -o /tmp/sp.lock.json
node dist/cli.js verify examples/tools.json examples/surfacepin.lock.json
```

## GitHub Action

```yaml
- uses: yellowgram/surfacepin/action@v1
  with:
    tools-path: path/to/tools.json
    lockfile-path: surfacepin.lock.json
```

Composite action under [`action/`](./action/). It builds/runs the CLI `verify` and fails the job on drift (exit 1).

Or call the CLI yourself after `npm install surfacepin`.

## What v1 does / does not

| Does | Does not |
|------|----------|
| Hash `name` + `description` + `inputSchema` | Pin resources / prompts |
| Offline verify from JSON files | Live MCP network client (post-v1) |
| Human-readable ADDED/REMOVED/CHANGED diff | Semantic similarity gates |
| Near-zero runtime deps (Node `crypto`) | Hosted service, telemetry, signed locks |

## License

MIT © 2026 yellowgram
