#!/usr/bin/env node
/**
 * Minimal MCP stdio stub for SurfacePin integration tests.
 * Speaks initialize + tools/list (+ optional pagination via SURFACEPIN_STUB_PAGE=1).
 * Fixed tools match testdata/basic.tools.json.
 */
import { createInterface } from "node:readline";

const ALL_TOOLS = [
  {
    name: "echo",
    description: "Echo text back",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to echo" },
      },
      required: ["text"],
    },
  },
  {
    name: "ping",
    description: "Health check",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

const paginate = process.env.SURFACEPIN_STUB_PAGE === "1";

function write(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }

  if (msg.method === "initialize") {
    write({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: msg.params?.protocolVersion ?? "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "surfacepin-stub", version: "0.0.0" },
      },
    });
    return;
  }

  if (msg.method === "notifications/initialized") {
    return;
  }

  if (msg.method === "tools/list") {
    if (!paginate) {
      write({
        jsonrpc: "2.0",
        id: msg.id,
        result: { tools: ALL_TOOLS },
      });
      return;
    }
    const cursor = msg.params?.cursor;
    if (!cursor) {
      write({
        jsonrpc: "2.0",
        id: msg.id,
        result: { tools: [ALL_TOOLS[0]], nextCursor: "page-2" },
      });
    } else {
      write({
        jsonrpc: "2.0",
        id: msg.id,
        result: { tools: [ALL_TOOLS[1]] },
      });
    }
    return;
  }

  if (msg.method === "ping") {
    write({ jsonrpc: "2.0", id: msg.id, result: {} });
    return;
  }

  if (msg.id !== undefined) {
    write({
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: -32601, message: `Method not found: ${msg.method}` },
    });
  }
});
