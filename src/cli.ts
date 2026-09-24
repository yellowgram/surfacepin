#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { computeSurface, serializeLockfile } from "./lock.js";
import { fetchSurfacesViaStdio } from "./mcp-stdio.js";
import {
  ALL_SURFACE_KINDS,
  SurfacePinError,
  type SurfaceKind,
} from "./types.js";
import {
  diffSurface,
  formatDiff,
  formatDiffJson,
  parseLockfile,
} from "./verify.js";

function usage(): never {
  console.error(`surfacepin — lock exact hashes of MCP tools/resources/prompts surfaces

Usage:
  surfacepin lock   <surface.json> [-o <lockfile>] [--surface tools[,resources][,prompts]]
  surfacepin lock   --stdio -- <command> [args...] [-o <lockfile>] [--surface ...]
  surfacepin verify <surface.json> <lockfile> [--surface ...]
  surfacepin verify --stdio <lockfile> -- <command> [args...] [--surface ...]
  surfacepin diff   <surface.json> <lockfile> [--surface ...] [--json]
  surfacepin diff   --stdio <lockfile> -- <command> [args...] [--surface ...] [--json]

--surface defaults to "tools". New locks are lockfile **v3** (section roots +
embedded \`surface\` payloads for structured field-diff). Verify still accepts
v1 (tools-only digests) and v2 (multi-surface digests).

File mode accepts a combined dump: { "tools": [...], "resources": [...], "prompts": [...] }
(or List*Result-shaped objects with those keys). Missing selected keys → empty.

Live --stdio calls tools/list, resources/list, prompts/list as selected.
Servers lacking a capability → empty list + stderr note.

diff prints ADDED/REMOVED/CHANGED ids; for CHANGED tools/resources/prompts with
a v3 lock, also prints path-level field changes (COMPATIBLE / BREAKING / HINT_FLIP).
--json emits the DiffResult object.

Exit codes: 0 match/ok, 1 drift, 2 usage/error

See SPEC.md for canonicalization and lockfile formats v1/v2/v3.`);
  process.exit(2);
}

function readJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new SurfacePinError(
      `cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    throw new SurfacePinError(
      `invalid JSON in ${path}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function parseSurfaceFlag(raw: string): SurfaceKind[] {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new SurfacePinError("--surface requires at least one kind");
  }
  const seen = new Set<SurfaceKind>();
  const out: SurfaceKind[] = [];
  for (const p of parts) {
    if (!(ALL_SURFACE_KINDS as readonly string[]).includes(p)) {
      throw new SurfacePinError(
        `unknown surface kind "${p}" (expected tools, resources, prompts)`,
      );
    }
    const k = p as SurfaceKind;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  // Stable order: tools, resources, prompts
  return ALL_SURFACE_KINDS.filter((k) => seen.has(k));
}

interface ParsedArgs {
  cmd: "lock" | "verify" | "diff";
  stdio: boolean;
  surfaces: SurfaceKind[];
  surfacePath?: string;
  lockPath?: string;
  outPath?: string;
  json: boolean;
  /** [executable, ...args] when --stdio */
  command?: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") usage();
  const cmd = args[0];
  if (cmd !== "lock" && cmd !== "verify" && cmd !== "diff") usage();

  let stdio = false;
  let outPath: string | undefined;
  let surfaces: SurfaceKind[] = ["tools"];
  let json = false;
  const positional: string[] = [];
  let command: string[] | undefined;

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      command = args.slice(i + 1);
      break;
    }
    if (a === "--stdio") {
      stdio = true;
      continue;
    }
    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "--surface" || a === "-s") {
      const v = args[++i];
      if (!v) usage();
      surfaces = parseSurfaceFlag(v);
      continue;
    }
    if (a.startsWith("--surface=")) {
      surfaces = parseSurfaceFlag(a.slice("--surface=".length));
      continue;
    }
    if (a === "-o" || a === "--output") {
      outPath = args[++i];
      if (!outPath) usage();
      continue;
    }
    if (a.startsWith("-")) usage();
    positional.push(a);
  }

  if (json && cmd !== "diff") {
    throw new SurfacePinError("--json is only valid with the diff command");
  }

  if (stdio) {
    if (!command || command.length === 0) usage();
    if (cmd === "lock") {
      if (positional.length !== 0) usage();
      return {
        cmd,
        stdio: true,
        surfaces,
        command,
        json,
        outPath: outPath ?? "surfacepin.lock.json",
      };
    }
    if (positional.length !== 1 || outPath) usage();
    return {
      cmd,
      stdio: true,
      surfaces,
      command,
      json,
      lockPath: positional[0],
    };
  }

  if (command) usage();
  if (cmd === "lock") {
    if (positional.length !== 1) usage();
    return {
      cmd,
      stdio: false,
      surfaces,
      json,
      surfacePath: positional[0],
      outPath: outPath ?? "surfacepin.lock.json",
    };
  }
  if (positional.length !== 2 || outPath) usage();
  return {
    cmd,
    stdio: false,
    surfaces,
    json,
    surfacePath: positional[0],
    lockPath: positional[1],
  };
}

async function loadSurfaceDoc(opts: ParsedArgs): Promise<unknown> {
  if (opts.stdio) {
    const [exe, ...args] = opts.command!;
    return fetchSurfacesViaStdio({
      command: exe,
      args,
      surfaces: opts.surfaces,
    });
  }
  return readJson(opts.surfacePath!);
}

async function main(): Promise<void> {
  try {
    const opts = parseArgs(process.argv);
    const doc = await loadSurfaceDoc(opts);

    if (opts.cmd === "lock") {
      const { lockfile, root, tools, resources, prompts } = computeSurface(
        doc,
        opts.surfaces,
      );
      const text = serializeLockfile(lockfile);
      writeFileSync(opts.outPath!, text, "utf8");
      console.log(`Wrote ${opts.outPath}`);
      console.log(`ROOT ${root}`);
      if (tools) console.log(`TOOLS ${tools.entries.length}`);
      if (resources) console.log(`RESOURCES ${resources.entries.length}`);
      if (prompts) console.log(`PROMPTS ${prompts.entries.length}`);
      process.exit(0);
    }

    const lock = parseLockfile(readJson(opts.lockPath!));
    const diff = diffSurface(doc, lock, opts.surfaces);
    if (opts.cmd === "diff" && opts.json) {
      process.stdout.write(formatDiffJson(diff));
    } else {
      console.log(formatDiff(diff));
    }
    process.exit(diff.match ? 0 : 1);
  } catch (e) {
    if (e instanceof SurfacePinError) {
      console.error(`error: ${e.message}`);
      process.exit(e.exitCode);
    }
    console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
}

void main();
