# sdk-default-path

Foreign insert: official MCP TypeScript SDK server factory (`createServer` + `registerTool` + stdio).

The default gate is the library, not the CLI:

```bash
npm run build
node examples/sdk-default-path/check.mjs
```

`check.mjs` calls `pinStdio` / `verifyStdio` against `server.mjs`. Commit `surfacepin.lock.json`. Drift fails closed.
