# Examples

- `tools.json` — tiny MCP-shaped tools list
- `surfacepin.lock.json` — lockfile produced by `surfacepin lock tools.json` (v1, tools-only)

For multi-surface (lockfile v2), see `../testdata/basic.surface.json` and `../testdata/basic.multi.lock.json`.

```bash
node ../dist/cli.js verify tools.json surfacepin.lock.json
node ../dist/cli.js lock ../testdata/basic.surface.json --surface tools,resources,prompts -o /tmp/multi.lock.json
```
