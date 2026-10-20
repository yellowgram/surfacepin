/**
 * Format lock for surfacepin-jcs-v2 (frozen; see SPEC.md "Format freeze and compatibility promise").
 *
 * The files under testdata/golden/jcs-v2/ were produced once by SurfacePin 1.6.0 and are
 * compared byte for byte. If any of these tests fails, the jcs-v2 output changed. Do not
 * regenerate the fixtures to make it pass: jcs-v2 is frozen, and a format change ships as a
 * new, separately named profile instead.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { pin, verify } from "../api.js";
import { canonicalize, canonicalizeToBytes } from "../canonicalize.js";
import {
  instructionsDigest,
  promptDigest,
  resourceDigest,
  toolDigest,
} from "../hash.js";
import { computeSurface, serializeLockfile } from "../lock.js";
import { parseLockfile } from "../verify.js";
import type { SurfaceKind } from "../types.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const dir = join(repo, "testdata", "golden", "jcs-v2");
const cli = join(repo, "dist", "cli.js");

const sha256 = (b: Buffer | string): string => createHash("sha256").update(b).digest("hex");
const bytes = (f: string): Buffer => readFileSync(join(dir, f));
const json = (f: string): unknown => JSON.parse(bytes(f).toString("utf8"));

interface GoldenEntry {
  kind: SurfaceKind;
  id: string;
  canonical: string;
  sha256: string;
}
interface GoldenCase {
  name: string;
  surface: string;
  surfaceSha256: string;
  kinds: SurfaceKind[];
  lockfile: string;
  lockfileSha256: string;
  root: string;
  sections: Partial<Record<SurfaceKind, string>>;
  entries: GoldenEntry[];
}
interface GoldenValue {
  input: string;
  canonicalHex: string;
  sha256: string;
}
const golden = json("golden.json") as {
  canonicalization: string;
  cases: GoldenCase[];
  values: GoldenValue[];
};

/**
 * Pinned here as well as in golden.json and SPEC.md §11, so editing the fixture files alone
 * cannot make a format change pass.
 */
const FROZEN = {
  full: {
    root: "07dee637abb8eb13c64d4ef779a0e2037a6fe3cf3217dee1a85dda7dc5fb6945",
    lockfileSha256: "5d91442e365b85887bb4970b6ced45e412dd488439270bb86c047078f145fb02",
    surfaceSha256: "c1981ad81f1c61f6ea92330e39611356341b55fb355881cdf3a2eca2fc7f61eb",
  },
  "tools-only": {
    root: "092658bdcbfb2d55d67e71d84ded776cc6aca42d88ca8b9f8c36e53cae7e2188",
    lockfileSha256: "7a2c9c10b697c93e5c7803a5e77d0bba62becaaf58179bc23005989ff2a7eb84",
    surfaceSha256: "b63c255c876e5b25b3d8493f9ac91e9d3161bffe59253c4972b7d023f950a153",
  },
} as const;

/** SHA-256 of golden.json itself, so no listed hash or value vector can change unnoticed. */
const GOLDEN_JSON_SHA256 = "6b5d735b828cce234bb47b8dcb2f80ff51b3feb32ac683dd253ad149524d2ab2";

const caseByName = (n: string): GoldenCase => {
  const c = golden.cases.find((x) => x.name === n);
  assert.ok(c, `golden case ${n}`);
  return c;
};

describe("surfacepin-jcs-v2 format lock (golden fixtures)", () => {
  it("golden.json is byte-identical to the frozen manifest", () => {
    assert.equal(sha256(bytes("golden.json")), GOLDEN_JSON_SHA256);
  });

  it("covers the frozen profile and both representative surfaces", () => {
    assert.equal(golden.canonicalization, "surfacepin-jcs-v2");
    assert.deepEqual(
      golden.cases.map((c) => c.name),
      Object.keys(FROZEN),
    );
    // Every surface kind and a non-trivial number of entries are exercised.
    const full = caseByName("full");
    assert.deepEqual(full.kinds, ["tools", "resources", "prompts", "instructions"]);
    assert.equal(full.entries.length, 9);
    assert.equal(caseByName("tools-only").entries.length, 2);
  });

  for (const name of Object.keys(FROZEN) as Array<keyof typeof FROZEN>) {
    describe(`case ${name}`, () => {
      const c = caseByName(name);
      const doc = json(c.surface);

      it("root and lockfile hash match the values pinned in this test", () => {
        assert.equal(c.root, FROZEN[name].root);
        assert.equal(c.lockfileSha256, FROZEN[name].lockfileSha256);
        assert.equal(sha256(bytes(c.lockfile)), FROZEN[name].lockfileSha256);
        assert.equal(c.surfaceSha256, FROZEN[name].surfaceSha256);
        assert.equal(sha256(bytes(c.surface)), FROZEN[name].surfaceSha256);
      });

      it("lock output is byte-identical to the golden lockfile", () => {
        const computed = computeSurface(doc, c.kinds, "surfacepin-jcs-v2");
        const text = serializeLockfile(computed.lockfile);
        assert.equal(text, bytes(c.lockfile).toString("utf8"));
        assert.equal(sha256(Buffer.from(text, "utf8")), c.lockfileSha256);
        assert.equal(computed.root, c.root);
        for (const kind of c.kinds) {
          assert.equal(computed[kind]?.root, c.sections[kind], `${kind} section root`);
        }
      });

      it("the default pin() writes jcs-v2 and the same bytes", () => {
        const r = pin(doc, { surfaces: c.kinds });
        assert.equal(r.lockfile.canonicalization, "surfacepin-jcs-v2");
        assert.ok(r.text === bytes(c.lockfile).toString("utf8"), "pin() text differs from golden");
        assert.equal(r.root, c.root);
      });

      it("each entry's canonical bytes and digest match the golden files", () => {
        const computed = computeSurface(doc, c.kinds, "surfacepin-jcs-v2");
        const seen: GoldenEntry[] = [];
        for (const kind of c.kinds) {
          const section = computed[kind];
          assert.ok(section, kind);
          section.entries.forEach((e, i) => {
            const g = c.entries.find((x) => x.canonical === `${c.name}.${kind}.${i}.jcs`);
            assert.ok(g, `golden entry ${kind}[${i}]`);
            seen.push(g);
            const id = "uri" in e ? e.uri : e.name;
            assert.equal(id, g.id, `${kind}[${i}] id/order`);
            const want = bytes(g.canonical);
            const got = canonicalizeToBytes(e.surface);
            assert.ok(got.equals(want), `${g.canonical}: canonical bytes differ\n got ${got}\nwant ${want}`);
            assert.equal(sha256(want), g.sha256, `${g.canonical} sha256`);
            assert.equal(e.digest, g.sha256, `${g.canonical} digest`);
          });
          // The digest functions hash exactly these bytes.
          const descriptors = section.descriptors as unknown[];
          descriptors.forEach((d, i) => {
            const g = c.entries.find((x) => x.canonical === `${c.name}.${kind}.${i}.jcs`)!;
            const digest =
              kind === "tools"
                ? toolDigest(d as Parameters<typeof toolDigest>[0])
                : kind === "resources"
                  ? resourceDigest(d as Parameters<typeof resourceDigest>[0])
                  : kind === "prompts"
                    ? promptDigest(d as Parameters<typeof promptDigest>[0])
                    : instructionsDigest(d as Parameters<typeof instructionsDigest>[0]);
            assert.equal(digest, g.sha256, `${kind}[${i}] digest function`);
          });
        }
        assert.equal(seen.length, c.entries.length, "no extra or missing golden entries");
      });

      it("the golden lockfile parses and verifies against its surface", () => {
        const lock = json(c.lockfile);
        const parsed = parseLockfile(lock);
        assert.equal(parsed.canonicalization, "surfacepin-jcs-v2");
        assert.equal(parsed.version, 3);
        assert.equal(verify(doc, lock).ok, true);
      });

      it("the CLI lock command writes the golden bytes", () => {
        const out = join(mkdtempSync(join(tmpdir(), "sp-golden-")), "lock.json");
        const surfaceFlag = c.kinds.length === 1 && c.kinds[0] === "tools" ? [] : ["--surface", c.kinds.join(",")];
        const r = spawnSync(process.execPath, [cli, "lock", join(dir, c.surface), ...surfaceFlag, "-o", out], {
          encoding: "utf8",
        });
        assert.equal(r.status, 0, r.stderr);
        assert.ok(readFileSync(out).equals(bytes(c.lockfile)), "CLI lock output differs from golden");
        const v = spawnSync(process.execPath, [cli, "verify", join(dir, c.surface), join(dir, c.lockfile)], {
          encoding: "utf8",
        });
        assert.equal(v.status, 0, v.stdout + v.stderr);
      });
    });
  }

  it("value-level canonical bytes match the golden vectors", () => {
    assert.equal(golden.values.length, 10);
    for (const v of golden.values) {
      const got = canonicalizeToBytes(JSON.parse(v.input));
      assert.equal(got.toString("hex"), v.canonicalHex, v.input);
      assert.equal(sha256(got), v.sha256, v.input);
    }
  });

  it("documented encoding rules hold (UTF-16 key order, number and string forms)", () => {
    // UTF-16 code unit order: U+1F600 (surrogate pair D83D DE00) sorts before U+FF61.
    assert.equal(canonicalize({ "\uff61": 3, "\u{1F600}": 2, "\u20ac": 1 }), '{"€":1,"😀":2,"｡":3}');
    assert.equal(canonicalize({ b: 2, a: 1, A: 0 }), '{"A":0,"a":1,"b":2}');
    assert.equal(canonicalize([1e21, 1e-7, -0, -12.5]), "[1e+21,1e-7,0,-12.5]");
    assert.equal(canonicalize("\u007f\u2028"), '"\u007f\u2028"');
    assert.equal(canonicalize("\u0000\u001f\b"), '"\\u0000\\u001f\\b"');
    // No Unicode normalization: decomposed and precomposed forms stay distinct.
    assert.equal(canonicalizeToBytes("e\u0301").toString("hex"), "2265cc8122");
    assert.equal(canonicalizeToBytes("\u00e9").toString("hex"), "22c3a922");
    // Values outside the JSON data model (library callers only): undefined members are
    // omitted and an undefined array element is written as null, as JSON.stringify does.
    assert.equal(canonicalize({ a: undefined, b: 1 }), '{"b":1}');
    assert.equal(canonicalize([undefined, 1]), "[null,1]");
    // A lone surrogate is written as the bytes of U+FFFD (documented in SPEC.md §3.1).
    assert.equal(canonicalizeToBytes("\ud800").toString("hex"), "22efbfbd22");
    // A repeated member name keeps its last value (JSON.parse; SPEC.md §3.1 rule 9).
    assert.equal(canonicalize(JSON.parse('{"a":1,"a":2}')), '{"a":2}');
  });

  it("a repeated member name in a surface file hashes as its last value (CLI)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "sp-dup-"));
    const dup = join(tmp, "dup.json");
    const dedup = join(tmp, "dedup.json");
    writeFileSync(
      dup,
      '{"tools":[{"name":"t","description":"safe","description":"evil"}]}',
    );
    writeFileSync(dedup, '{"tools":[{"name":"t","description":"evil"}]}');
    const lockA = join(tmp, "a.lock.json");
    const lockB = join(tmp, "b.lock.json");
    for (const [src, out] of [
      [dup, lockA],
      [dedup, lockB],
    ]) {
      const r = spawnSync(process.execPath, [cli, "lock", src, "-o", out], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
    }
    const rootA = (JSON.parse(readFileSync(lockA, "utf8")) as { root: string }).root;
    const rootB = (JSON.parse(readFileSync(lockB, "utf8")) as { root: string }).root;
    assert.equal(rootA, rootB);
    assert.equal(rootA, "428ad318f69f78cd9ae8fed7a508055766e5210b627d3b147a281ffddcf99244");
    const v = spawnSync(process.execPath, [cli, "verify", dedup, lockA], { encoding: "utf8" });
    assert.equal(v.status, 0, v.stdout + v.stderr);
  });

  it("a one-character change in any golden input changes its digest (drift is detected)", () => {
    const c = caseByName("full");
    const doc = json(c.surface) as { tools: Array<{ name: string; description?: string; title?: string }> };
    const changed = structuredClone(doc);
    const t = changed.tools.find((x) => x.name === "export_records")!;
    t.title = `${t.title}.`;
    assert.equal(verify(changed, json(c.lockfile)).ok, false);
  });
});
