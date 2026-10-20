/** Wording of lockfile format and canonical JSON errors (outside the frozen format; exit codes unchanged). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalize } from "../canonicalize.js";
import { parseLockfile } from "../verify.js";

const testdata = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "testdata");
const read = (f: string): unknown => JSON.parse(readFileSync(join(testdata, f), "utf8"));

describe("format error messages", () => {
  it("a non-numeric lockfile version is shown quoted", () => {
    const v3 = read("titles.v3.lock.json") as Record<string, unknown>;
    assert.throws(
      () => parseLockfile({ ...v3, version: "3" }),
      (e: Error) => e.message === 'canonicalization surfacepin-jcs-v2 requires lockfile version 3 (got "3")',
    );
    const v1 = read("basic.lock.json") as Record<string, unknown>;
    assert.throws(
      () => parseLockfile({ ...v1, version: "1" }),
      (e: Error) => e.message === 'unsupported lockfile version: "1"',
    );
    assert.throws(
      () => parseLockfile({ ...v1, version: 4 }),
      (e: Error) => e.message === "unsupported lockfile version: 4",
    );
  });

  it("an unknown canonicalization is shown quoted", () => {
    const v3 = read("titles.v3.lock.json") as Record<string, unknown>;
    assert.throws(
      () => parseLockfile({ ...v3, canonicalization: "surfacepin-jcs-v2 " }),
      (e: Error) => e.message === 'unsupported canonicalization: "surfacepin-jcs-v2 "',
    );
    const { canonicalization: _omit, ...missing } = v3;
    void _omit;
    assert.throws(
      () => parseLockfile(missing),
      (e: Error) => e.message === "unsupported canonicalization: undefined",
    );
  });

  it("canonical JSON errors name both profiles", () => {
    assert.throws(
      () => canonicalize(Number.NaN),
      (e: Error) => e.message === "non-finite number not allowed in surfacepin canonical JSON (jcs-v1 and jcs-v2): NaN",
    );
    assert.throws(
      () => canonicalize(1n),
      (e: Error) => e.message === "unsupported JSON type in surfacepin canonical JSON (jcs-v1 and jcs-v2): bigint",
    );
  });
});
