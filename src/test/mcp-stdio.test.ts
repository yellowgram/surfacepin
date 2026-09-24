import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { computeSurface } from "../lock.js";
import { fetchSurfacesViaStdio, fetchToolsViaStdio } from "../mcp-stdio.js";
import { diffSurface, parseLockfile } from "../verify.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const testdata = join(root, "testdata");
const stub = join(testdata, "stub-mcp-server.mjs");
const cli = join(root, "dist", "cli.js");
const basicTools = JSON.parse(
  readFileSync(join(testdata, "basic.tools.json"), "utf8"),
);
const basicLockV1 = JSON.parse(
  readFileSync(join(testdata, "basic.lock.json"), "utf8"),
);
const basicLockV3 = JSON.parse(
  readFileSync(join(testdata, "basic.v3.lock.json"), "utf8"),
);
const basicSurface = JSON.parse(
  readFileSync(join(testdata, "basic.surface.json"), "utf8"),
);
const basicMultiLock = JSON.parse(
  readFileSync(join(testdata, "basic.multi.lock.json"), "utf8"),
);

describe("fetchToolsViaStdio", () => {
  it("returns the stub tools/list", async () => {
    const doc = await fetchToolsViaStdio({
      command: process.execPath,
      args: [stub],
      timeoutMs: 15_000,
    });
    assert.ok(Array.isArray(doc.tools));
    assert.equal(doc.tools!.length, 2);
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
    assert.equal(paged.tools!.length, 2);
    assert.equal(computeSurface(paged).root, computeSurface(basicTools).root);
  });

  it("verify matches golden lockfile via live fetch", async () => {
    const doc = await fetchToolsViaStdio({
      command: process.execPath,
      args: [stub],
      timeoutMs: 15_000,
    });
    const lock = parseLockfile(basicLockV1);
    const d = diffSurface(doc, lock);
    assert.equal(d.match, true);
  });
});

describe("fetchSurfacesViaStdio multi", () => {
  it("fetches tools+resources+prompts matching file golden", async () => {
    const notes: string[] = [];
    const doc = await fetchSurfacesViaStdio({
      command: process.execPath,
      args: [stub],
      surfaces: ["tools", "resources", "prompts"],
      timeoutMs: 15_000,
      note: (m) => notes.push(m),
    });
    assert.equal(doc.tools!.length, 2);
    assert.equal(doc.resources!.length, 2);
    assert.equal(doc.prompts!.length, 2);
    const live = computeSurface(doc, ["tools", "resources", "prompts"]);
    const file = computeSurface(basicSurface, ["tools", "resources", "prompts"]);
    assert.equal(live.root, file.root);
    assert.equal(notes.length, 0);
  });

  it("treats missing capabilities as empty with note", async () => {
    const notes: string[] = [];
    const doc = await fetchSurfacesViaStdio({
      command: process.execPath,
      args: [stub],
      env: {
        SURFACEPIN_STUB_NO_RESOURCES: "1",
        SURFACEPIN_STUB_NO_PROMPTS: "1",
      },
      surfaces: ["tools", "resources", "prompts"],
      timeoutMs: 15_000,
      note: (m) => notes.push(m),
    });
    assert.equal(doc.tools!.length, 2);
    assert.deepEqual(doc.resources, []);
    assert.deepEqual(doc.prompts, []);
    assert.ok(notes.some((n) => /resources/.test(n)));
    assert.ok(notes.some((n) => /prompts/.test(n)));
  });
});

describe("CLI --stdio", () => {
  it("lock --stdio writes a lock matching the file golden v3", () => {
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
      assert.equal(written.version, 3);
      assert.equal(written.root, basicLockV3.root);
      assert.deepEqual(written.tools, basicLockV3.tools);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lock --stdio --surface tools,resources,prompts writes v3", () => {
    const dir = mkdtempSync(join(tmpdir(), "surfacepin-"));
    const out = join(dir, "out.lock.json");
    try {
      const r = spawnSync(
        process.execPath,
        [
          cli,
          "lock",
          "--stdio",
          "--surface",
          "tools,resources,prompts",
          "-o",
          out,
          "--",
          process.execPath,
          stub,
        ],
        { encoding: "utf8", timeout: 20_000 },
      );
      assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
      const written = JSON.parse(readFileSync(out, "utf8"));
      assert.equal(written.version, 3);
      assert.equal(written.root, basicMultiLock.root);
      assert.deepEqual(written.tools, basicMultiLock.tools);
      assert.deepEqual(written.resources, basicMultiLock.resources);
      assert.deepEqual(written.prompts, basicMultiLock.prompts);
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

  it("verify --stdio multi exits 0", () => {
    const lockPath = join(testdata, "basic.multi.lock.json");
    const r = spawnSync(
      process.execPath,
      [
        cli,
        "verify",
        "--stdio",
        "--surface",
        "tools,resources,prompts",
        lockPath,
        "--",
        process.execPath,
        stub,
      ],
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
