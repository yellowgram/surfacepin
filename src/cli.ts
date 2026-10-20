#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { pin, verify, formatDiff, formatDiffJson } from "./api.js";
import { lockfileKinds, parseLockfile } from "./verify.js";
import { VERSION } from "./version.js";
import { fetchSurfacesViaStdio } from "./mcp-stdio.js";
import {
  ALL_SURFACE_KINDS,
  SurfacePinError,
  type SurfaceKind,
} from "./types.js";

function usage(): never {
  console.error(`surfacepin — lock exact hashes of MCP tools/resources/prompts surfaces

Usage:
  surfacepin --version
  surfacepin lock   <surface.json> [-o <lockfile>] [--surface tools[,resources][,prompts][,instructions]]
  surfacepin lock   --stdio -- <command> [args...] [-o <lockfile>] [--surface ...]
  surfacepin verify <surface.json> <lockfile> [--surface ...] [--json]
  surfacepin verify --stdio [--surface ...] [--json] <lockfile> -- <command> [args...]
  surfacepin diff   <surface.json> <lockfile> [--surface ...] [--json]
  surfacepin diff   --stdio [--surface ...] [--json] <lockfile> -- <command> [args...]

--surface takes a comma list of tools, resources, prompts, instructions
(instructions = the server's initialize.instructions text).
lock: --surface defaults to "tools".
verify/diff: --surface defaults to the surfaces stored in the lockfile; if you
pass it, it must match them exactly.

New locks are lockfile v3 with canonicalization surfacepin-jcs-v2 (hashes
titles too). Verify still accepts v1, v2 and v3 locks written by older
versions (surfacepin-jcs-v1) and checks them exactly as before.

File mode accepts a combined dump: { "tools": [...], "resources": [...],
"prompts": [...], "instructions": "..." } (or List*Result-shaped objects with
those keys). Missing selected keys are treated as empty.

Live --stdio runs initialize, then tools/list, resources/list, prompts/list as
selected (all pages).
Servers lacking a capability → empty list + stderr note.

verify and diff print the same report: ADDED/REMOVED/CHANGED ids and, with a v3
lock, path-level field changes (COMPATIBLE / BREAKING / HINT_FLIP). These labels
describe compatibility for callers, not safety: review every change.
--json prints the DiffResult object instead (same exit codes).

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
        `unknown surface kind "${p}" (expected tools, resources, prompts, instructions)`,
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
  /** Undefined when --surface was not given (verify/diff then use the lockfile's). */
  surfaces?: SurfaceKind[];
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
  if (args[0] === "--version" || args[0] === "-v") {
    console.log(VERSION);
    process.exit(0);
  }
  const cmd = args[0];
  if (cmd !== "lock" && cmd !== "verify" && cmd !== "diff") usage();

  let stdio = false;
  let outPath: string | undefined;
  let surfaces: SurfaceKind[] | undefined;
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

  if (json && cmd === "lock") {
    throw new SurfacePinError("--json is only valid with verify and diff");
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

async function loadSurfaceDoc(
  opts: ParsedArgs,
  surfaces: SurfaceKind[],
): Promise<unknown> {
  if (opts.stdio) {
    const [exe, ...args] = opts.command!;
    return fetchSurfacesViaStdio({
      command: exe,
      args,
      surfaces,
    });
  }
  return readJson(opts.surfacePath!);
}

async function main(): Promise<void> {
  try {
    const opts = parseArgs(process.argv);

    if (opts.cmd === "lock") {
      const surfaces = opts.surfaces ?? ["tools"];
      const doc = await loadSurfaceDoc(opts, surfaces);
      const { text, root, computed } = pin(doc, { surfaces });
      writeFileSync(opts.outPath!, text, "utf8");
      console.log(`Wrote ${opts.outPath}`);
      console.log(`ROOT ${root}`);
      if (computed.tools) console.log(`TOOLS ${computed.tools.entries.length}`);
      if (computed.resources)
        console.log(`RESOURCES ${computed.resources.entries.length}`);
      if (computed.prompts)
        console.log(`PROMPTS ${computed.prompts.entries.length}`);
      if (computed.instructions)
        console.log(`INSTRUCTIONS ${computed.instructions.entries.length}`);
      process.exit(0);
    }

    // Read the lock first: it decides which surfaces to fetch.
    const lock = parseLockfile(readJson(opts.lockPath!));
    const surfaces = opts.surfaces ?? lockfileKinds(lock);
    const doc = await loadSurfaceDoc(opts, surfaces);
    const checked = verify(doc, lock, { surfaces });
    if (lock.canonicalization === "surfacepin-jcs-v1") {
      console.error(
        "note: this lockfile predates surfacepin 1.6 (surfacepin-jcs-v1) and does not pin titles. " +
          "Re-run surfacepin lock after reviewing the surface to pin them.",
      );
    }
    if (opts.json) {
      process.stdout.write(formatDiffJson(checked.diff));
    } else {
      console.log(formatDiff(checked.diff));
    }
    process.exit(checked.ok ? 0 : 1);
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
