import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { computeSurface } from "../lock.js";
import { fetchToolsViaStdio } from "../mcp-stdio.js";
import { diffSurface, parseLockfile } from "../verify.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const testdata = join(root, "testdata");
const stub = join(testdata, "stub-mcp-server.mjs");
const cli = join(root, "dist", "cli.js");
const basicTools = JSON.parse(
  readFileSync(join(testdata, "basic.tools.json"), "utf8"),
);
const basicLock = JSON.parse(
  readFileSync(join(testdata, "basic.lock.json"), "utf8"),
);

describe("fetchToolsViaStdio", () => {
  it("returns the stub tools/list", async () => {
    const doc = await fetchToolsViaStdio({
      command: process.execPath,
      args: [stub],
      timeoutMs: 15_000,
    });
    assert.ok(Array.isArray(doc.tools));
    assert.equal(doc.tools.length, 2);
    const { root: liveRoot } = computeSurface(doc);
    const { root: fileRoot } = computeSurface(basicTools);
    assert.equal(liveRoot, fileRoot);
  });

  it("paginates when nextCursor is present", async () => {
    const paged = await fetchToolsViaStdio({
      command: process.execPath,
      args: [stub],
      env: { SURFACEPIN_STUB_PAGE: "1" },
      timeoutMs: 15_000,
    });
    assert.equal(paged.tools.length, 2);
    assert.equal(computeSurface(paged).root, computeSurface(basicTools).root);
  });

  it("verify matches golden lockfile via live fetch", async () => {
    const doc = await fetchToolsViaStdio({
      command: process.execPath,
      args: [stub],
      timeoutMs: 15_000,
    });
    const lock = parseLockfile(basicLock);
    const d = diffSurface(doc, lock);
    assert.equal(d.match, true);
  });
});

describe("CLI --stdio", () => {
  it("lock --stdio writes a lock matching the file golden", () => {
    const dir = mkdtempSync(join(tmpdir(), "surfacepin-"));
    const out = join(dir, "out.lock.json");
    try {
      const r = spawnSync(
        process.execPath,
        [cli, "lock", "--stdio", "-o", out, "--", process.execPath, stub],
        { encoding: "utf8", timeout: 20_000 },
      );
      assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
      const written = JSON.parse(readFileSync(out, "utf8"));
      assert.equal(written.root, basicLock.root);
      assert.deepEqual(written.tools, basicLock.tools);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("verify --stdio exits 0 against golden lock", () => {
    const lockPath = join(testdata, "basic.lock.json");
    const r = spawnSync(
      process.execPath,
      [cli, "verify", "--stdio", lockPath, "--", process.execPath, stub],
      { encoding: "utf8", timeout: 20_000 },
    );
    assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
    assert.match(r.stdout, /OK:/);
  });

  it("diff --stdio exits 0 on match", () => {
    const lockPath = join(testdata, "basic.lock.json");
    const r = spawnSync(
      process.execPath,
      [cli, "diff", "--stdio", lockPath, "--", process.execPath, stub],
      { encoding: "utf8", timeout: 20_000 },
    );
    assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
  });

  it("verify --stdio exits 1 on drift", () => {
    const dir = mkdtempSync(join(tmpdir(), "surfacepin-"));
    const badLock = join(dir, "bad.lock.json");
    try {
      const bad = {
        version: 1,
        algorithm: "sha256",
        canonicalization: "surfacepin-jcs-v1",
        root: "aa".repeat(32),
        tools: [{ name: "echo", digest: "bb".repeat(32) }],
      };
      writeFileSync(badLock, `${JSON.stringify(bad, null, 2)}\n`);
      const r = spawnSync(
        process.execPath,
        [cli, "verify", "--stdio", badLock, "--", process.execPath, stub],
        { encoding: "utf8", timeout: 20_000 },
      );
      assert.equal(r.status, 1, `stderr=${r.stderr}\nstdout=${r.stdout}`);
      assert.match(r.stdout, /DRIFT:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("missing -- after --stdio is usage error (exit 2)", () => {
    const r = spawnSync(process.execPath, [cli, "lock", "--stdio"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    assert.equal(r.status, 2);
  });
});
