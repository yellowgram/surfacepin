#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { computeSurface, serializeLockfile } from "./lock.js";
import { SurfacePinError } from "./types.js";
import { diffSurface, formatDiff, parseLockfile } from "./verify.js";

function usage(): never {
  console.error(`surfacepin — lock exact hashes of an MCP tools/list surface

Usage:
  surfacepin lock   <tools.json> [-o <lockfile>]
  surfacepin verify <tools.json> <lockfile>
  surfacepin diff   <tools.json> <lockfile>

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

function parseArgs(argv: string[]): {
  cmd: string;
  toolsPath?: string;
  lockPath?: string;
  outPath?: string;
} {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") usage();
  const cmd = args[0];
  if (cmd !== "lock" && cmd !== "verify" && cmd !== "diff") usage();

  let outPath: string | undefined;
  const positional: string[] = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "-o" || args[i] === "--output") {
      outPath = args[++i];
      if (!outPath) usage();
      continue;
    }
    if (args[i].startsWith("-")) usage();
    positional.push(args[i]);
  }

  if (cmd === "lock") {
    if (positional.length !== 1) usage();
    return {
      cmd,
      toolsPath: positional[0],
      outPath: outPath ?? "surfacepin.lock.json",
    };
  }
  if (positional.length !== 2 || outPath) usage();
  return { cmd, toolsPath: positional[0], lockPath: positional[1] };
}

function main(): void {
  try {
    const opts = parseArgs(process.argv);

    if (opts.cmd === "lock") {
      const doc = readJson(opts.toolsPath!);
      const { lockfile, root, tools } = computeSurface(doc);
      const text = serializeLockfile(lockfile);
      writeFileSync(opts.outPath!, text, "utf8");
      console.log(`Wrote ${opts.outPath}`);
      console.log(`ROOT ${root}`);
      console.log(`TOOLS ${tools.length}`);
      process.exit(0);
    }

    const doc = readJson(opts.toolsPath!);
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

main();
