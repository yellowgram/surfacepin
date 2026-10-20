/**
 * Lockfiles that existing users already have committed. Their roots and file hashes are
 * pinned here so that verification of existing pins can never change unnoticed, even if
 * the fixture files are regenerated (SPEC.md §0 promise 3).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { verify } from "../api.js";
import { computeSurface } from "../lock.js";
import { parseLockfile } from "../verify.js";
import type { SurfaceKind } from "../types.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const testdata = join(repo, "testdata");
const cli = join(repo, "dist", "cli.js");
const sha256 = (b: Buffer): string => createHash("sha256").update(b).digest("hex");
const read = (f: string): unknown => JSON.parse(readFileSync(join(testdata, f), "utf8"));

const FROZEN_V1: ReadonlyArray<{
  lockfile: string;
  surface: string;
  kinds: SurfaceKind[];
  version: 1 | 2 | 3;
  root: string;
  fileSha256: string;
  writtenBy: string;
}> = [
  {
    lockfile: "basic.lock.json",
    surface: "basic.tools.json",
    kinds: ["tools"],
    version: 1,
    root: "eca572b549d73a6db0c8c2a44f865982c67aaf291f4c57d80dfd6031af62c2f2",
    fileSha256: "5be933eb2511bddb6ae886e9caeb8d221ef991de4fd3fbd609db00d2cbcf9baa",
    writtenBy: "lockfile v1 (tools only)",
  },
  {
    lockfile: "basic.v2.lock.json",
    surface: "basic.surface.json",
    kinds: ["tools", "resources", "prompts"],
    version: 2,
    root: "21e88a5125e9d687ef27d1fbe4e3259c20a0fd6b0b8a0300d5cc3d5fbb371317",
    fileSha256: "ee66a0831ee75a75821ecf25d432ea6c341518c7e543e23c9eb4e9699a6278f3",
    writtenBy: "published surfacepin@1.2.0 (lockfile v2)",
  },
  {
    lockfile: "basic.v3.lock.json",
    surface: "basic.tools.json",
    kinds: ["tools"],
    version: 3,
    root: "efaec0b9f37bd16446eefaea05f562075df0506da99f1ce3204e26e6c4de70bb",
    fileSha256: "217e7832eae2a6a714afc32cd3ca4b6f080cd8e3e279a8f3af787e8300f67a38",
    writtenBy: "lockfile v3, jcs-v1, tools only",
  },
  {
    lockfile: "annotations-output.v3.lock.json",
    surface: "annotations-output.tools.json",
    kinds: ["tools"],
    version: 3,
    root: "eb3d367190d9d62f77225e211b90da7090ad11152b541190a35dda25b637dcfa",
    fileSha256: "666c5e4b7d148425fc4230830c549110eb9a44aed342a1d730739547e8f63d5f",
    writtenBy: "lockfile v3, jcs-v1, annotations and outputSchema",
  },
];

describe("existing surfacepin-jcs-v1 lockfiles keep verifying", () => {
  for (const f of FROZEN_V1) {
    describe(`${f.lockfile}: ${f.writtenBy}`, () => {
      it("file bytes, version, profile and root are the pinned values", () => {
        assert.equal(sha256(readFileSync(join(testdata, f.lockfile))), f.fileSha256);
        let lock: ReturnType<typeof parseLockfile> | undefined;
        assert.doesNotThrow(() => {
          lock = parseLockfile(read(f.lockfile));
        }, `${f.lockfile} must stay readable`);
        assert.equal(lock?.version, f.version);
        assert.equal(lock?.canonicalization, "surfacepin-jcs-v1");
        assert.equal(lock?.root, f.root);
      });

      it("recomputing the surface with jcs-v1 gives the pinned root", () => {
        const computed = computeSurface(read(f.surface), f.kinds, "surfacepin-jcs-v1");
        // Lockfile v1's root is the tools section root; v2 and v3 use the overall root.
        assert.equal(f.version === 1 ? computed.tools?.root : computed.root, f.root);
      });

      it("verifies through the library", () => {
        let ok: boolean | undefined;
        assert.doesNotThrow(() => {
          ok = verify(read(f.surface), read(f.lockfile)).ok;
        }, `${f.lockfile} must stay verifiable`);
        assert.equal(ok, true);
      });

      it("verifies through the CLI (exit 0)", () => {
        const r = spawnSync(
          process.execPath,
          [cli, "verify", join(testdata, f.surface), join(testdata, f.lockfile)],
          { encoding: "utf8" },
        );
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.match(r.stdout, /OK: surface matches lockfile/);
      });
    });
  }

  it("the real lockfile v2 still fails on drift", () => {
    const doc = read("basic.surface.json") as { prompts: Array<{ description?: string }> };
    const changed = structuredClone(doc);
    changed.prompts[0].description = `${changed.prompts[0].description ?? ""}.`;
    assert.equal(verify(changed, read("basic.v2.lock.json")).ok, false);
  });
});

