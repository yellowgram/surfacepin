# Examples

- `sdk-default-path/`: a server built with the official MCP SDK, gated with the library's `verifyStdio` (`npm run sdk-path`)
- `tools.json`: a small MCP tools list
- `surfacepin.lock.json`: the lockfile `surfacepin lock tools.json` writes

For multi-surface (lockfile v3), see `../testdata/basic.surface.json` and `../testdata/basic.multi.lock.json`.
Lockfiles from older versions (still verified): `../testdata/basic.lock.json` (v1) and `../testdata/basic.v3.lock.json` (v3, surfacepin-jcs-v1).

```bash
node ../dist/cli.js verify tools.json surfacepin.lock.json
node ../dist/cli.js diff tools.json surfacepin.lock.json
node ../dist/cli.js lock ../testdata/basic.surface.json --surface tools,resources,prompts -o /tmp/multi.lock.json
```
