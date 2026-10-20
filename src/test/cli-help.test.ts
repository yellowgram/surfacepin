import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "..", "dist", "cli.js");
const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 5_000 });

describe("surfacepin --help", () => {
  for (const flag of ["--help", "-h"]) {
    it(`${flag} prints the full usage on stdout and exits 0`, () => {
      const r = run(flag);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /^surfacepin — lock exact hashes/);
      assert.match(r.stdout, /Exit codes: 0 match\/ok, 1 drift, 2 usage\/error/);
      assert.match(r.stdout, /lockfile formats v1\/v2\/v3\.\n$/);
      assert.equal(r.stderr, "");
    });
  }
  it("no arguments is still a usage error: usage on stderr, exit 2", () => {
    const r = run();
    assert.equal(r.status, 2);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /^surfacepin — lock exact hashes/);
  });
});
