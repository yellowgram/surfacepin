#!/usr/bin/env node
/**
 * Default gate for the foreign SDK server.
 * Library API only — pinStdio + verifyStdio. No LLM.
 *
 * First run writes examples/sdk-default-path/surfacepin.lock.json if missing.
 * Subsequent runs fail closed on digest drift.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pinStdio, verifyStdio, formatDiff } from "../../dist/api.js";

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, "server.mjs");
const lockPath = join(here, "surfacepin.lock.json");
const surfaces = ["tools"];

const spawn = {
  command: process.execPath,
  args: [server],
  surfaces,
  timeoutMs: 20_000,
  cwd: join(here, "..", ".."),
};

if (!existsSync(lockPath)) {
  const pinned = await pinStdio(spawn);
  writeFileSync(lockPath, pinned.text, "utf8");
  console.log(`wrote ${lockPath}`);
  console.log(`ROOT ${pinned.root}`);
  process.exit(0);
}

const lockfile = JSON.parse(readFileSync(lockPath, "utf8"));
const checked = await verifyStdio({ ...spawn, lockfile });
console.log(formatDiff(checked.diff));
process.exit(checked.ok ? 0 : 1);
