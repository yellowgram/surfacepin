# SurfacePin

Lock **exact hashes** of an MCP server’s list surfaces and fail CI when they drift silently:

- **tools** — `name`, `description`, `inputSchema`, `annotations`, `outputSchema`
- **resources** — `uri`, `name`, `description`, `mimeType`
- **prompts** — `name`, `description`, `arguments`

This is deterministic byte-level hashing — **not** semantic / LLM / embedding drift detection. If a description character changes, the digest changes.

On mismatch, **lockfile v3** also explains *what* changed with a deterministic field-diff (`COMPATIBLE` | `BREAKING` | `HINT_FLIP`). Pass/fail remains digest equality. Re-lock after upgrading to ≥1.4.

Spec: [SPEC.md](./SPEC.md) (Lockfile Spec v1.4; canonicalization `surfacepin-jcs-v1` + lockfile v1/v2/v3).

## Quick start

Node 20+. From a clone, `npm install` once, then `npm run demo`. The demo builds and runs the CLI on committed fixtures only (no network, no API keys).

```bash
git clone https://github.com/yellowgram/surfacepin.git
cd surfacepin
npm install
npm run demo
```

`npm run demo` proves exact-hash lockfile verify on committed fixtures (`testdata/basic.tools.json` against `basic.v3.lock.json`, and multi-surface `basic.surface.json`) and that a one-character description drift fails verify. Pass/fail is digest equality. `HINT_FLIP` is a field-diff label, not a safety verdict.

```bash
# Installed package: npm install -g surfacepin
# or: npx surfacepin … / npm install surfacepin --save-dev

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

Commit `surfacepin.lock.json`. Re-lock when you intentionally change the surface. The default contributor loop is [Five-minute path](#five-minute-path).

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

### Library (`pin` / `verify` / `diff`)

CLI is a client of these. No LLM on the gate.

```ts
import { pin, verify, diff, pinStdio, verifyStdio } from "surfacepin";

const { lockfile, text } = pin(doc); // lockfile v3
const { ok, diff: report } = verify(doc, lockfile);
const live = await verifyStdio({
  command: "node",
  args: ["server.mjs"],
  lockfile,
});
```

Foreign default path (official SDK `createServer` + this library as the gate): `npm run sdk-path`.

### Local from this repo

`npm run demo` is the fixture proof above (`npm install` first; the script builds). Unit tests and other local CLI checks:

```bash
npm test
node dist/cli.js lock examples/tools.json -o /tmp/sp.lock.json
node dist/cli.js lock testdata/basic.surface.json --surface tools,resources,prompts -o /tmp/sp-multi.lock.json
node dist/cli.js lock --stdio --surface tools,resources,prompts -- node testdata/stub-mcp-server.mjs
```

## Five-minute path

Lock a live MCP server over stdio, commit `surfacepin.lock.json` (that exact name), and verify that same file in GitHub Actions and a pre-commit hook.

Pass/fail is exact-hash digest equality. `HINT_FLIP` is a field-diff label, not a safety verdict.

### 1. Lock live stdio

Offline stub already in this repo (no network):

```bash
surfacepin lock --stdio --surface tools,resources,prompts -- node testdata/stub-mcp-server.mjs
```

That writes `surfacepin.lock.json`. The committed golden for this stub is `testdata/basic.multi.lock.json` (same bytes). A tools-only server uses the same command without `--surface`.

Same shape against the everything reference server (needs a network fetch of the package):

```bash
surfacepin lock --stdio --surface tools,resources,prompts -- npx -y @modelcontextprotocol/server-everything
```

### 2. Commit the lockfile

```bash
git add surfacepin.lock.json
```

Do not rename it.

### 3. Verify that file in Actions and pre-commit

GitHub Action (live stdio — the command after `--` in the CLI). Pin `@v1.5.0` once that tag exists; the current `v1` tag is the older file-mode action.

```yaml
- uses: yellowgram/surfacepin/action@v1.5.0
  with:
    lockfile-path: surfacepin.lock.json
    surface: tools,resources,prompts
    server-command: node
    server-args: testdata/stub-mcp-server.mjs
```

File mode still works when you commit a dump instead of a server command:

```yaml
- uses: yellowgram/surfacepin/action@v1.5.0
  with:
    tools-path: testdata/basic.surface.json
    lockfile-path: testdata/basic.multi.lock.json
    surface: tools,resources,prompts
```

`tools-path` + `lockfile-path` with no `surface` remains the tools-only file check (`examples/tools.json`).

Pre-commit uses [`.githooks/pre-commit`](./.githooks/pre-commit) (no extra dependencies). Enable it once per clone:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```

`npm run build` first so `dist/cli.js` exists (or install `surfacepin` so the bin is on `PATH`). This repo’s [`surfacepin.precommit`](./surfacepin.precommit) verifies `testdata/basic.multi.lock.json` with `node testdata/stub-mcp-server.mjs` and `--surface tools,resources,prompts` — the same stdio check as the Action. For your server, edit that file:

```
LOCKFILE=surfacepin.lock.json
SURFACE=tools,resources,prompts
SERVER_COMMAND=node
SERVER_ARGS=server.mjs
TOOLS=
```

Environment variables (`SURFACEPIN_LOCKFILE`, `SURFACEPIN_SURFACE`, `SURFACEPIN_SERVER_COMMAND`, `SURFACEPIN_SERVER_ARGS`, `SURFACEPIN_TOOLS`) override the file. Set `SURFACEPIN_SERVER_COMMAND` empty and `SURFACEPIN_TOOLS` to a JSON dump for file mode.

## GitHub Action

Composite action under [`action/`](./action/). Inputs:

| Input | Required | Role |
| --- | --- | --- |
| `lockfile-path` | yes | Path to `surfacepin.lock.json` |
| `tools-path` | file mode | Surface JSON dump (tools-only or combined) |
| `server-command` | stdio mode | Executable; runs `surfacepin verify --stdio … <lock> -- <command> [args]` |
| `server-args` | no | Arguments (whitespace-separated, or one per line) |
| `surface` | no | `tools`, `resources`, `prompts` (comma-separated). Omit for tools only |
| `working-directory` | no | Default `.` |

Set `tools-path` or `server-command`, not both. `surface` must match the lockfile. See [Five-minute path](#five-minute-path).

Use `yellowgram/surfacepin/action@v1.5.0` for these inputs. Tag `v1` currently points at the file-mode action (`tools-path` + `lockfile-path` only). This repo’s CI calls `./action` so the pull request runs the inputs above. Moving `v1` or pushing `v1.5.0` is a coordinator step after merge.

## What v1.4 does / does not

| Does | Does not |
|------|----------|
| Hash tools (+ annotations, outputSchema) + resources + prompts | Semantic similarity gates |
| Lockfile v3 (embedded surfaces) + verify v1/v2/v3 | Streamable HTTP / SSE (stdio only) |
| Deterministic field-diff: COMPATIBLE / BREAKING / HINT_FLIP | LLM / fuzzy matching; safety verdicts from hints |
| Offline verify from JSON files | Hosted service, telemetry, signed locks |
| Live list* via MCP stdio (`--stdio -- …`) | Resource templates / initialize.instructions |
| Ignore tool title / icons / _meta | Materialize MCP annotation defaults into hashes |
| GitHub Action file mode and live `--stdio` (optional `--surface`) | A safety verdict from `HINT_FLIP` |

As of 1.5.0 the Action and the pre-commit hook run the same verifies as the CLI, including multi-surface and live stdio. Lockfile format is unchanged.

## License

MIT © 2026 yellowgram
