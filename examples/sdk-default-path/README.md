# sdk-default-path

A server built the standard way with the official MCP TypeScript SDK (`createServer` + `registerTool` + stdio), gated by SurfacePin.

The default gate is the library, not the CLI:

```bash
npm run build
node examples/sdk-default-path/check.mjs
```

`check.mjs` calls `pinStdio` / `verifyStdio` against `server.mjs`. Commit `surfacepin.lock.json`. Drift fails closed.
