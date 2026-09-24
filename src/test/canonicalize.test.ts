import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalize } from "../canonicalize.js";
import { sha256Hex, toolDigest, rootDigest } from "../hash.js";
import { computeSurface } from "../lock.js";
import { diffSurface, parseLockfile } from "../verify.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const testdata = join(here, "..", "..", "testdata");

describe("canonicalize surfacepin-jcs-v1", () => {
  it("emits no insignificant whitespace", () => {
    assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
  });

  it("sorts object keys recursively", () => {
    const v = { z: { y: 1, x: 2 }, a: [3, { b: 1, a: 0 }] };
    assert.equal(
      canonicalize(v),
      '{"a":[3,{"a":0,"b":1}],"z":{"x":2,"y":1}}',
    );
  });

  it("handles strings, bools, null", () => {
    assert.equal(canonicalize("hi"), '"hi"');
    assert.equal(canonicalize(true), "true");
    assert.equal(canonicalize(false), "false");
    assert.equal(canonicalize(null), "null");
  });

  it("escapes control characters", () => {
    assert.equal(canonicalize("a\nb"), '"a\\nb"');
    assert.equal(canonicalize('say "hi"'), '"say \\"hi\\""');
  });

  it("serializes numbers like JSON.stringify", () => {
    assert.equal(canonicalize(0), "0");
    assert.equal(canonicalize(1.5), "1.5");
    assert.equal(canonicalize(-0), "0");
  });

  it("is stable across calls", () => {
    const v = { name: "x", description: "d", inputSchema: { type: "object" } };
    assert.equal(canonicalize(v), canonicalize(v));
  });
});

describe("digests", () => {
  it("toolDigest is sha256 of canonical descriptor", () => {
    const d = {
      name: "echo",
      description: "Echo text",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    };
    const expected = sha256Hex(
      Buffer.from(
        canonicalize({
          description: d.description,
          inputSchema: d.inputSchema,
          name: d.name,
        }),
        "utf8",
      ),
    );
    assert.equal(toolDigest(d), expected);
  });

  it("rootDigest uses fixed concatenation", () => {
    const tools = [
      { name: "b", digest: "bb".repeat(32) },
      { name: "a", digest: "aa".repeat(32) },
    ];
    const payload =
      "surfacepin-v1\n" +
      `a\n${"aa".repeat(32)}\n` +
      `b\n${"bb".repeat(32)}\n`;
    assert.equal(rootDigest(tools), sha256Hex(payload));
  });
});

describe("golden vectors", () => {
  it("basic tools match golden lockfile", () => {
    const tools = JSON.parse(
      readFileSync(join(testdata, "basic.tools.json"), "utf8"),
    );
    const golden = JSON.parse(
      readFileSync(join(testdata, "basic.lock.json"), "utf8"),
    );
    const { lockfile } = computeSurface(tools);
    assert.deepEqual(lockfile, golden);
  });

  it("empty tools list is valid", () => {
    const tools = JSON.parse(
      readFileSync(join(testdata, "empty.tools.json"), "utf8"),
    );
    const golden = JSON.parse(
      readFileSync(join(testdata, "empty.lock.json"), "utf8"),
    );
    const { lockfile } = computeSurface(tools);
    assert.deepEqual(lockfile, golden);
  });

  it("key order in inputSchema does not affect digest", () => {
    const a = JSON.parse(
      readFileSync(join(testdata, "schema-order-a.tools.json"), "utf8"),
    );
    const b = JSON.parse(
      readFileSync(join(testdata, "schema-order-b.tools.json"), "utf8"),
    );
    const ca = computeSurface(a);
    const cb = computeSurface(b);
    assert.equal(ca.root, cb.root);
    assert.equal(ca.tools[0].digest, cb.tools[0].digest);
  });

  it("tool array/object key order does not affect digest", () => {
    const pretty = JSON.parse(
      readFileSync(join(testdata, "basic.tools.json"), "utf8"),
    ) as {
      tools: Array<{
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      }>;
    };
    const shuffled = {
      tools: [
        {
          inputSchema: pretty.tools[1].inputSchema,
          name: pretty.tools[1].name,
          description: pretty.tools[1].description,
        },
        {
          name: pretty.tools[0].name,
          inputSchema: pretty.tools[0].inputSchema,
          description: pretty.tools[0].description,
        },
      ],
    };
    assert.equal(computeSurface(pretty).root, computeSurface(shuffled).root);
  });
});

describe("verify / diff", () => {
  it("match returns match=true", () => {
    const tools = JSON.parse(
      readFileSync(join(testdata, "basic.tools.json"), "utf8"),
    );
    const lock = parseLockfile(
      JSON.parse(readFileSync(join(testdata, "basic.lock.json"), "utf8")),
    );
    const d = diffSurface(tools, lock);
    assert.equal(d.match, true);
  });

  it("detects added / removed / changed", () => {
    const tools = JSON.parse(
      readFileSync(join(testdata, "basic.tools.json"), "utf8"),
    ) as {
      tools: Array<{
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      }>;
    };
    const lock = parseLockfile(
      JSON.parse(readFileSync(join(testdata, "basic.lock.json"), "utf8")),
    );
    const drifted = structuredClone(tools);
    drifted.tools[0].description = "CHANGED";
    drifted.tools = drifted.tools.filter((t) => t.name !== "ping");
    drifted.tools.push({
      name: "boom",
      description: "explode",
      inputSchema: { type: "object" },
    });
    const d = diffSurface(drifted, lock);
    assert.equal(d.match, false);
    assert.deepEqual(d.added, ["boom"]);
    assert.deepEqual(d.removed, ["ping"]);
    assert.equal(d.changed.length, 1);
    assert.equal(d.changed[0].name, "echo");
  });

  it("defaults missing description and inputSchema", () => {
    const doc = { tools: [{ name: "bare" }] };
    const { lockfile } = computeSurface(doc);
    assert.equal(lockfile.tools.length, 1);
    assert.equal(lockfile.tools[0].name, "bare");
    const doc2 = {
      tools: [{ name: "bare", description: "", inputSchema: {} }],
    };
    assert.equal(computeSurface(doc).root, computeSurface(doc2).root);
  });

  it("rejects duplicate names", () => {
    assert.throws(
      () => computeSurface({ tools: [{ name: "a" }, { name: "a" }] }),
      /duplicate/,
    );
  });
});
