---
name: surfacepin
description: Pin and verify MCP list surfaces with exact-hash lockfiles. Use when generating or reviewing an MCP server, adding CI for tools/list drift, or attaching SurfacePin under an SDK createServer default path. Deterministic verifier only — never call an LLM to decide pass/fail.
---

# SurfacePin

Exact-hash lock of MCP `tools/list` (+ resources/prompts). Pass/fail is digest equality.

```ts
import { pin, verify, pinStdio, verifyStdio } from "surfacepin";
```

## Default attach (foreign SDK server)

1. Keep the official `createServer()` + `registerTool` + stdio factory untouched.
2. Add `surfacepin.lock.json` next to the server.
3. Gate with the library, not a prompt:

```ts
const checked = await verifyStdio({
  command: "node",
  args: ["server.mjs"],
  lockfile: JSON.parse(readFileSync("surfacepin.lock.json", "utf8")),
});
if (!checked.ok) process.exit(1);
```

Do not put an LLM on this path. Field-diff labels (`COMPATIBLE` | `BREAKING` | `HINT_FLIP`) explain mismatch; they are not the verdict.

Re-lock only when the surface change is intentional.

## CI

Commit `surfacepin.lock.json` (do not rename it). The GitHub Action verifies that file from a JSON dump (`tools-path`) or a live stdio server (`server-command` + `server-args`), with optional `surface: tools,resources,prompts`. A pre-commit hook in `.githooks/pre-commit` runs the same check. Pass/fail is digest equality.
