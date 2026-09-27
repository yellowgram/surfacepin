#!/usr/bin/env node
/**
 * Sealed demo. Committed fixtures only: no network, no API keys, no live MCP.
 *
 * 1. verify testdata/basic.tools.json against testdata/basic.v3.lock.json
 * 2. verify testdata/basic.surface.json against testdata/basic.multi.lock.json
 * 3. lock both fixtures and require the bytes to match those lockfiles
 * 4. one-character description drift of basic.tools.json must fail verify
 *    and print a COMPATIBLE field-diff (pass/fail stays digest equality)
 *
 * Exit 0 only when all of the above hold.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "cli.js");
const testdata = join(root, "testdata");

const toolsPath = join(testdata, "basic.tools.json");
const toolsLockPath = join(testdata, "basic.v3.lock.json");
const surfacePath = join(testdata, "basic.surface.json");
const multiLockPath = join(testdata, "basic.multi.lock.json");

function rel(path) {
  return path.startsWith(root) ? path.slice(root.length + 1) : path;
}

function run(args, expect) {
  const shown = args.map((a) => rel(a)).join(" ");
  console.log(`\n$ surfacepin ${shown}`);
  const r = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: root,
  });
  if (r.error) {
    console.error(`demo: failed to run CLI: ${r.error.message}`);
    process.exit(1);
  }
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const code = r.status === null ? 2 : r.status;
  if (code !== expect) {
    console.error(`demo: expected exit ${expect}, got ${code}`);
    process.exit(1);
  }
  return r.stdout ?? "";
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertSameLock(actualPath, goldenPath) {
  try {
    assert.deepEqual(readJson(actualPath), readJson(goldenPath));
  } catch {
    console.error(
      `demo: lock ${rel(actualPath)} does not match ${rel(goldenPath)}`,
    );
    process.exit(1);
  }
  console.log(`lock matches ${rel(goldenPath)}`);
}

console.log("surfacepin demo — committed fixtures only (no network)");

const toolsOk = run(["verify", toolsPath, toolsLockPath], 0);
if (!toolsOk.includes("OK: surface matches lockfile")) {
  console.error("demo: tools verify did not report a match");
  process.exit(1);
}

const multiOk = run(
  [
    "verify",
    surfacePath,
    multiLockPath,
    "--surface",
    "tools,resources,prompts",
  ],
  0,
);
if (!multiOk.includes("OK: surface matches lockfile")) {
  console.error("demo: multi-surface verify did not report a match");
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "surfacepin-demo-"));
try {
  const lockedTools = join(dir, "basic.v3.lock.json");
  const lockedMulti = join(dir, "basic.multi.lock.json");

  run(["lock", toolsPath, "-o", lockedTools], 0);
  assertSameLock(lockedTools, toolsLockPath);
  run(["verify", toolsPath, lockedTools], 0);

  run(
    [
      "lock",
      surfacePath,
      "--surface",
      "tools,resources,prompts",
      "-o",
      lockedMulti,
    ],
    0,
  );
  assertSameLock(lockedMulti, multiLockPath);
  run(
    [
      "verify",
      surfacePath,
      lockedMulti,
      "--surface",
      "tools,resources,prompts",
    ],
    0,
  );

  const doc = readJson(toolsPath);
  const before = doc.tools?.[0]?.description;
  if (typeof before !== "string" || before.length === 0) {
    console.error("demo: basic.tools.json has no tools[0].description");
    process.exit(1);
  }
  doc.tools[0].description = `${before}.`;
  const driftedPath = join(dir, "basic.drift.tools.json");
  writeFileSync(driftedPath, `${JSON.stringify(doc, null, 2)}\n`);

  console.log(
    `\n# one-character drift of testdata/basic.tools.json ("${before}" -> "${before}.")`,
  );
  const diffOut = run(["diff", driftedPath, toolsLockPath], 1);
  if (!diffOut.includes("DRIFT: surface does not match lockfile")) {
    console.error("demo: drift diff did not report DRIFT");
    process.exit(1);
  }
  if (!diffOut.includes("CHANGED description (COMPATIBLE)")) {
    console.error("demo: drift diff did not report COMPATIBLE description change");
    process.exit(1);
  }

  const verifyDrift = run(["verify", driftedPath, toolsLockPath], 1);
  if (!verifyDrift.includes("DRIFT: surface does not match lockfile")) {
    console.error("demo: drift verify did not fail closed");
    process.exit(1);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(
  "\ndemo ok: exact-hash match on committed fixtures; one-character drift failed closed",
);
