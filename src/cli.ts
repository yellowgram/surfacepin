#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { computeSurface, serializeLockfile } from "./lock.js";
import { fetchToolsViaStdio } from "./mcp-stdio.js";
import { SurfacePinError } from "./types.js";
import { diffSurface, formatDiff, parseLockfile } from "./verify.js";

function usage(): never {
  console.error(`surfacepin — lock exact hashes of an MCP tools/list surface

Usage:
  surfacepin lock   <tools.json> [-o <lockfile>]
  surfacepin lock   --stdio -- <command> [args...] [-o <lockfile>]
  surfacepin verify <tools.json> <lockfile>
  surfacepin verify --stdio <lockfile> -- <command> [args...]
  surfacepin diff   <tools.json> <lockfile>
  surfacepin diff   --stdio <lockfile> -- <command> [args...]

Live --stdio spawns an MCP server, calls tools/list, then locks/verifies.
Offline file mode still works (CI / Action stay file-based).

Exit codes: 0 match/ok, 1 drift, 2 usage/error

See SPEC.md for canonicalization and lockfile format v1.`);
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

interface ParsedArgs {
  cmd: "lock" | "verify" | "diff";
  stdio: boolean;
  toolsPath?: string;
  lockPath?: string;
  outPath?: string;
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
    if (a === "-o" || a === "--output") {
      outPath = args[++i];
      if (!outPath) usage();
      continue;
    }
    if (a.startsWith("-")) usage();
    positional.push(a);
  }

  if (stdio) {
    if (!command || command.length === 0) usage();
    if (cmd === "lock") {
      if (positional.length !== 0) usage();
      return {
        cmd,
        stdio: true,
        command,
        outPath: outPath ?? "surfacepin.lock.json",
      };
    }
    if (positional.length !== 1 || outPath) usage();
    return { cmd, stdio: true, command, lockPath: positional[0] };
  }

  if (command) usage();
  if (cmd === "lock") {
    if (positional.length !== 1) usage();
    return {
      cmd,
      stdio: false,
      toolsPath: positional[0],
      outPath: outPath ?? "surfacepin.lock.json",
    };
  }
  if (positional.length !== 2 || outPath) usage();
  return {
    cmd,
    stdio: false,
    toolsPath: positional[0],
    lockPath: positional[1],
  };
}

async function loadToolsDoc(opts: ParsedArgs): Promise<unknown> {
  if (opts.stdio) {
    const [exe, ...args] = opts.command!;
    return fetchToolsViaStdio({ command: exe, args });
  }
  return readJson(opts.toolsPath!);
}

async function main(): Promise<void> {
  try {
    const opts = parseArgs(process.argv);
    const doc = await loadToolsDoc(opts);

    if (opts.cmd === "lock") {
      const { lockfile, root, tools } = computeSurface(doc);
      const text = serializeLockfile(lockfile);
      writeFileSync(opts.outPath!, text, "utf8");
      console.log(`Wrote ${opts.outPath}`);
      console.log(`ROOT ${root}`);
      console.log(`TOOLS ${tools.length}`);
      process.exit(0);
    }

    const lock = parseLockfile(readJson(opts.lockPath!));
    const diff = diffSurface(doc, lock);
    console.log(formatDiff(diff));
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
