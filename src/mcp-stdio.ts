/**
 * Live MCP adapter: fetch tools/list, resources/list, prompts/list over stdio.
 * Out of band from SPEC lockfile/canonicalize — produces the same
 * document shape the file path already consumes.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { VERSION } from "./version.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { SurfaceDoc } from "./normalize.js";
import { SurfacePinError, type SurfaceKind } from "./types.js";

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
  /**
   * Which of this process's environment variables the server sees.
   * Omitted: all of them (the default, so the server shows the same surface as
   * in your client). An array: only the SDK's safe base (HOME, PATH, USER, …)
   * plus the named variables; `[]` is the clean environment.
   */
  envAllow?: readonly string[];
  /** Overall deadline for connect + list* (default 30s). */
  timeoutMs?: number;
  /** Which surfaces to fetch (default: tools). */
  surfaces?: readonly SurfaceKind[];
  /** Optional sink for capability-skip notes (default: stderr). */
  note?: (msg: string) => void;
}

/** @deprecated Use SurfaceDoc. */
export type ToolsListDoc = SurfaceDoc;

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

/**
 * The server inherits this process's environment, plus `extra`. (The MCP SDK
 * default passes only HOME/PATH/USER-style variables, so a server that reads
 * an API key or feature flag would start differently under SurfacePin than
 * in the user's client, and the wrong surface would be pinned.)
 */
function childEnv(extra?: Record<string, string>, allow?: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (allow) {
    Object.assign(out, getDefaultEnvironment());
    for (const k of allow) {
      const v = process.env[k];
      if (v !== undefined) out[k] = v;
    }
  } else {
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) out[k] = v;
    }
  }
  if (extra) Object.assign(out, extra);
  return out;
}

/** Upper bound on pages per list call (each page is a round-trip). */
const MAX_LIST_PAGES = 10_000;

async function listAllPages<T>(
  listPage: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>,
): Promise<T[]> {
  const all: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await listPage(cursor);
    all.push(...page.items);
    cursor = page.nextCursor;
    if (cursor) {
      // A server that repeats a cursor would loop until the timeout while
      // memory grows. Fail closed instead.
      if (seen.has(cursor)) {
        throw new SurfacePinError(`server repeated list cursor ${JSON.stringify(cursor)}`);
      }
      seen.add(cursor);
      if (seen.size >= MAX_LIST_PAGES) {
        throw new SurfacePinError(`server returned more than ${MAX_LIST_PAGES} list pages`);
      }
    }
  } while (cursor);
  return all;
}

/**
 * Spawn an MCP server over stdio, run initialize + selected list* calls
 * (all pages), then close. Missing server capabilities → empty array + note.
 */
export async function fetchSurfacesViaStdio(
  opts: StdioFetchOptions,
): Promise<SurfaceDoc> {
  if (!opts.command || opts.command.length === 0) {
    throw new SurfacePinError("stdio command must be a non-empty string");
  }
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const kinds: readonly SurfaceKind[] = opts.surfaces ?? ["tools"];
  const note =
    opts.note ??
    ((msg: string) => {
      console.error(`note: ${msg}`);
    });

  const transport = new StdioClientTransport({
    command: opts.command,
    args: opts.args ?? [],
    cwd: opts.cwd,
    env: childEnv(opts.env, opts.envAllow),
    stderr: "inherit",
  });

  const client = new Client({
    name: "surfacepin",
    version: VERSION,
  });

  const run = async (): Promise<SurfaceDoc> => {
    await client.connect(transport);
    const caps = client.getServerCapabilities() ?? {};
    const doc: SurfaceDoc = {};

    if (kinds.includes("tools")) {
      if (caps.tools === undefined) {
        note("server has no tools capability; treating tools as empty");
        doc.tools = [];
      } else {
        doc.tools = (await listAllPages(async (cursor) => {
          const page = await client.listTools(cursor ? { cursor } : {});
          return {
            items: [...page.tools],
            nextCursor: page.nextCursor as string | undefined,
          };
        })) as SurfaceDoc["tools"];
      }
    }

    if (kinds.includes("resources")) {
      if (caps.resources === undefined) {
        note("server has no resources capability; treating resources as empty");
        doc.resources = [];
      } else {
        doc.resources = (await listAllPages(async (cursor) => {
          const page = await client.listResources(cursor ? { cursor } : {});
          return {
            items: [...page.resources],
            nextCursor: page.nextCursor as string | undefined,
          };
        })) as SurfaceDoc["resources"];
      }
    }

    if (kinds.includes("prompts")) {
      if (caps.prompts === undefined) {
        note("server has no prompts capability; treating prompts as empty");
        doc.prompts = [];
      } else {
        doc.prompts = (await listAllPages(async (cursor) => {
          const page = await client.listPrompts(cursor ? { cursor } : {});
          return {
            items: [...page.prompts],
            nextCursor: page.nextCursor as string | undefined,
          };
        })) as SurfaceDoc["prompts"];
      }
    }

    if (kinds.includes("instructions")) {
      doc.instructions = client.getInstructions() ?? "";
    }

    await client.close();
    return doc;
  };

  try {
    return await withTimeout(run(), timeoutMs, "MCP stdio list");
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

/** @deprecated Prefer fetchSurfacesViaStdio. */
export async function fetchToolsViaStdio(
  opts: StdioFetchOptions,
): Promise<SurfaceDoc> {
  return fetchSurfacesViaStdio({ ...opts, surfaces: ["tools"] });
}
