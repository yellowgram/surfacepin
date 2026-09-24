# Examples

- `tools.json` — tiny MCP-shaped tools list
- `surfacepin.lock.json` — lockfile produced by `surfacepin lock tools.json` (v3, tools-only + embedded surfaces)

For multi-surface (lockfile v3), see `../testdata/basic.surface.json` and `../testdata/basic.multi.lock.json`.
Legacy digest-only goldens: `../testdata/basic.lock.json` (v1).

```bash
node ../dist/cli.js verify tools.json surfacepin.lock.json
node ../dist/cli.js diff tools.json surfacepin.lock.json
node ../dist/cli.js lock ../testdata/basic.surface.json --surface tools,resources,prompts -o /tmp/multi.lock.json
```
