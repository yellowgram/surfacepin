/**
 * Live MCP adapter: fetch tools/list over stdio.
 * Out of band from SPEC lockfile/canonicalize — produces the same
 * { tools: [...] } shape the file path already consumes.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SurfacePinError } from "./types.js";

export interface StdioFetchOptions {
  /** Executable to spawn (first token after `--`). */
  command: string;
  /** Remaining argv after the executable. */
  args?: string[];
  cwd?: string;
  /**
   * Extra env vars merged onto `process.env` for the child.
   * (SDK replaces the whole env if `env` is set, so we merge here.)
   */
  env?: Record<string, string>;
  /** Overall deadline for connect + listTools (default 30s). */
  timeoutMs?: number;
}

export interface ToolsListDoc {
  tools: unknown[];
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new SurfacePinError(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function childEnv(extra?: Record<string, string>): Record<string, string> | undefined {
  if (!extra) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) out[k] = v;
  }
  Object.assign(out, extra);
  return out;
}

/**
 * Spawn an MCP server over stdio, run initialize + tools/list (all pages),
 * then close. Returns a ListToolsResult-shaped document.
 */
export async function fetchToolsViaStdio(
  opts: StdioFetchOptions,
): Promise<ToolsListDoc> {
  if (!opts.command || opts.command.length === 0) {
    throw new SurfacePinError("stdio command must be a non-empty string");
  }
  const timeoutMs = opts.timeoutMs ?? 30_000;

  const transport = new StdioClientTransport({
    command: opts.command,
    args: opts.args ?? [],
    cwd: opts.cwd,
    env: childEnv(opts.env),
    stderr: "inherit",
  });

  const client = new Client({
    name: "surfacepin",
    version: "1.1.0",
  });

  const run = async (): Promise<ToolsListDoc> => {
    await client.connect(transport);
    const tools: unknown[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : {});
      tools.push(...page.tools);
      cursor = page.nextCursor as string | undefined;
    } while (cursor);
    await client.close();
    return { tools };
  };

  try {
    return await withTimeout(run(), timeoutMs, "MCP stdio tools/list");
  } catch (e) {
    try {
      await client.close();
    } catch {
      /* best-effort cleanup */
    }
    if (e instanceof SurfacePinError) throw e;
    throw new SurfacePinError(
      `MCP stdio fetch failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
