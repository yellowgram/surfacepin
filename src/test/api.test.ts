import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { pin, pinStdio, verify, verifyStdio, diff } from "../api.js";
import { computeSurface } from "../lock.js";

const here = dirname(fileURLToPath(import.meta.url));
const testdata = join(here, "..", "..", "testdata");
const stub = join(testdata, "stub-mcp-server.mjs");

const basicTools = JSON.parse(
  readFileSync(join(testdata, "basic.tools.json"), "utf8"),
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

describe("library pin/verify/diff", () => {
  it("pin matches computeSurface + golden v3", () => {
    const result = pin(basicTools);
    assert.equal(result.root, computeSurface(basicTools).root);
    assert.deepEqual(result.lockfile, basicLockV3);
    assert.equal(result.text.endsWith("\n"), true);
    assert.deepEqual(JSON.parse(result.text), basicLockV3);
  });

  it("verify ok on golden; drift fails; field-diff does not flip ok", () => {
    const ok = verify(basicTools, basicLockV3);
    assert.equal(ok.ok, true);
    assert.equal(ok.diff.match, true);

    const drifted = structuredClone(basicTools);
    drifted.tools[0].description = `${drifted.tools[0].description}x`;
    const bad = verify(drifted, basicLockV3);
    assert.equal(bad.ok, false);
    assert.equal(bad.diff.match, false);
    const changed = bad.diff.surfaces[0].changed[0];
    assert.ok(changed);
    assert.ok(changed.fields && changed.fields.length > 0);
  });

  it("verify defaults to lockfile kinds", () => {
    const ok = verify(basicSurface, basicMultiLock);
    assert.equal(ok.ok, true);
    assert.deepEqual(
      ok.diff.surfaces.map((s) => s.kind),
      ["tools", "resources", "prompts"],
    );
  });

  it("diff is verify().diff", () => {
    const a = diff(basicTools, basicLockV3);
    const b = verify(basicTools, basicLockV3).diff;
    assert.deepEqual(a, b);
  });
});

describe("library pinStdio/verifyStdio against stub", () => {
  it("pins the stub and verifies the same process", async () => {
    const pinned = await pinStdio({
      command: process.execPath,
      args: [stub],
      surfaces: ["tools"],
      timeoutMs: 15_000,
    });
    assert.equal(pinned.root, computeSurface(basicTools).root);

    const checked = await verifyStdio({
      command: process.execPath,
      args: [stub],
      lockfile: pinned.lockfile,
      surfaces: ["tools"],
      timeoutMs: 15_000,
    });
    assert.equal(checked.ok, true);
  });
});
