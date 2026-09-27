#!/usr/bin/env node
/**
 * Foreign default path: official MCP TypeScript SDK server shape
 * (createServer + registerTool + StdioServerTransport).
 * Not SurfacePin internals. Pin/verify attach outside this file.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export function createServer() {
  const server = new McpServer({
    name: "sdk-default-path",
    version: "1.0.0",
  });
  server.registerTool(
    "greet",
    {
      description: "Greet someone by name",
      inputSchema: { name: z.string() },
    },
    async ({ name }) => ({
      content: [{ type: "text", text: `Hello, ${name}!` }],
    }),
  );
  return server;
}

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
