import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalize } from "../canonicalize.js";
import { sha256Hex, toolDigest } from "../hash.js";
import { computeSurface } from "../lock.js";
import { diffToolDescriptors } from "../schema-diff.js";
import { normalizeTools } from "../normalize.js";
import { diffSurface, parseLockfile } from "../verify.js";
import { SurfacePinError, type LockfileV3 } from "../types.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const testdata = join(here, "..", "..", "testdata");

describe("spec 1.4 — annotations + outputSchema hashing", () => {
  it("existing goldens unchanged for tools without kept annotations/outputSchema", () => {
    const tools = JSON.parse(
      readFileSync(join(testdata, "basic.tools.json"), "utf8"),
    );
    const golden = JSON.parse(
      readFileSync(join(testdata, "basic.v3.lock.json"), "utf8"),
    );
    const { lockfile } = computeSurface(tools);
    assert.deepEqual(lockfile, golden);
  });

  it("annotations+outputSchema golden lockfile v3", () => {
    const tools = JSON.parse(
      readFileSync(join(testdata, "annotations-output.tools.json"), "utf8"),
    );
    const golden = JSON.parse(
      readFileSync(join(testdata, "annotations-output.v3.lock.json"), "utf8"),
    );
    const { lockfile } = computeSurface(tools);
    assert.deepEqual(lockfile, golden);
    const v3 = lockfile as LockfileV3;
    const surf = v3.tools!.entries[0].surface as {
      annotations?: Record<string, unknown>;
      outputSchema?: Record<string, unknown>;
      title?: unknown;
    };
    assert.ok(surf.annotations);
    assert.equal(surf.annotations!.title, undefined);
    assert.equal(surf.annotations!.readOnlyHint, true);
    assert.ok(surf.outputSchema);
    assert.equal(surf.title, undefined);
  });

  it("title / icons / _meta do not change digest", () => {
    const base = {
      tools: [
        {
          name: "t",
          description: "d",
          inputSchema: { type: "object" },
        },
      ],
    };
    const decorated = {
      tools: [
        {
          name: "t",
          description: "d",
          inputSchema: { type: "object" },
          title: "Pretty Title",
          icons: [{ src: "https://example.com/i.png" }],
          _meta: { "io.modelcontextprotocol/foo": 1 },
        },
      ],
    };
    assert.equal(computeSurface(base).root, computeSurface(decorated).root);
    assert.equal(
      computeSurface(base).tools!.entries[0].digest,
      computeSurface(decorated).tools!.entries[0].digest,
    );
  });

  it("title / icons / _meta absent from diff paths", () => {
    const base = {
      tools: [
        {
          name: "t",
          description: "d",
          inputSchema: { type: "object", properties: { a: { type: "string" } } },
        },
      ],
    };
    const { lockfile } = computeSurface(base);
    const drifted = {
      tools: [
        {
          name: "t",
          description: "d2",
          title: "X",
          icons: [],
          _meta: { x: 1 },
          inputSchema: {
            type: "object",
            properties: { a: { type: "number" } },
          },
        },
      ],
    };
    const d = diffSurface(drifted, lockfile);
    assert.equal(d.match, false);
    const paths = (d.changed[0].fields ?? []).map((f) => f.path);
    for (const p of paths) {
      assert.ok(!p.includes("title"), p);
      assert.ok(!p.includes("icons"), p);
      assert.ok(!p.includes("_meta"), p);
    }
  });

  it("annotations.title dropped → same digest as no title", () => {
    const a = {
      tools: [
        {
          name: "t",
          description: "",
          inputSchema: {},
          annotations: { title: "Ignored", readOnlyHint: true },
        },
      ],
    };
    const b = {
      tools: [
        {
          name: "t",
          description: "",
          inputSchema: {},
          annotations: { readOnlyHint: true },
        },
      ],
    };
    assert.equal(
      computeSurface(a).tools!.entries[0].digest,
      computeSurface(b).tools!.entries[0].digest,
    );
  });

  it("annotations unknown key changes digest", () => {
    const a = {
      tools: [
        {
          name: "t",
          description: "",
          inputSchema: {},
          annotations: { customHint: 1 },
        },
      ],
    };
    const b = {
      tools: [
        {
          name: "t",
          description: "",
          inputSchema: {},
          annotations: { customHint: 2 },
        },
      ],
    };
    assert.notEqual(
      computeSurface(a).tools!.entries[0].digest,
      computeSurface(b).tools!.entries[0].digest,
    );
  });

  it("empty or title-only annotations omits key", () => {
    const empty = normalizeTools([
      { name: "t", annotations: {} },
    ]);
    assert.equal(empty[0].annotations, undefined);

    const titleOnly = normalizeTools([
      { name: "t", annotations: { title: "Only" } },
    ]);
    assert.equal(titleOnly[0].annotations, undefined);

    const none = normalizeTools([{ name: "t" }]);
    assert.equal(none[0].annotations, undefined);

    // Digests match across empty / title-only / absent
    assert.equal(toolDigest(empty[0]), toolDigest(titleOnly[0]));
    assert.equal(toolDigest(empty[0]), toolDigest(none[0]));
  });

  it("absent annotations ≠ explicit MCP defaults", () => {
    const absent = {
      tools: [{ name: "t", description: "", inputSchema: {} }],
    };
    const explicitDefaults = {
      tools: [
        {
          name: "t",
          description: "",
          inputSchema: {},
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
          },
        },
      ],
    };
    assert.notEqual(
      computeSurface(absent).tools!.entries[0].digest,
      computeSurface(explicitDefaults).tools!.entries[0].digest,
    );
  });

  it("outputSchema absent ≠ empty object", () => {
    const absent = {
      tools: [{ name: "t", description: "", inputSchema: {} }],
    };
    const emptyObj = {
      tools: [
        {
          name: "t",
          description: "",
          inputSchema: {},
          outputSchema: {},
        },
      ],
    };
    assert.notEqual(
      computeSurface(absent).tools!.entries[0].digest,
      computeSurface(emptyObj).tools!.entries[0].digest,
    );
    const desc = normalizeTools(emptyObj.tools as never);
    assert.deepEqual(desc[0].outputSchema, {});
    assert.equal(normalizeTools(absent.tools as never)[0].outputSchema, undefined);
  });

  it("outputSchema null is omitted; non-object is usage error", () => {
    const withNull = normalizeTools([
      { name: "t", outputSchema: null },
    ]);
    assert.equal(withNull[0].outputSchema, undefined);

    assert.throws(
      () => normalizeTools([{ name: "t", outputSchema: "nope" }]),
      (e: unknown) =>
        e instanceof SurfacePinError &&
        e.exitCode === 2 &&
        /outputSchema/.test(e.message),
    );
  });

  it("outputSchema add/remove/change never HINT_FLIP", () => {
    const oldD = {
      name: "t",
      description: "",
      inputSchema: {},
      outputSchema: { type: "object", properties: { a: { type: "string" } } },
    };
    const removed = diffToolDescriptors(oldD, {
      name: "t",
      description: "",
      inputSchema: {},
    });
    assert.ok(removed.some((c) => c.path === "outputSchema"));
    for (const c of removed.filter((c) => c.path.startsWith("outputSchema"))) {
      assert.ok(!c.kinds.includes("HINT_FLIP"), JSON.stringify(c));
      assert.ok(c.kinds.includes("BREAKING") || c.kinds.includes("COMPATIBLE"));
    }

    const added = diffToolDescriptors(
      { name: "t", description: "", inputSchema: {} },
      oldD,
    );
    assert.ok(
      added.some(
        (c) =>
          c.path === "outputSchema" &&
          c.kind === "added" &&
          c.kinds.includes("BREAKING") &&
          !c.kinds.includes("HINT_FLIP"),
      ),
    );

    const narrowed = diffToolDescriptors(oldD, {
      name: "t",
      description: "",
      inputSchema: {},
      outputSchema: { type: "object", properties: { a: { type: "number" } } },
    });
    assert.ok(
      narrowed.some(
        (c) =>
          c.path === "outputSchema.properties.a.type" &&
          c.kinds.includes("BREAKING") &&
          !c.kinds.includes("HINT_FLIP"),
      ),
    );
  });
});

describe("spec 1.4 — HINT_FLIP taxonomy", () => {
  function tool(
    ann?: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ) {
    return {
      name: "t",
      description: "",
      inputSchema: {},
      ...(ann ? { annotations: ann } : {}),
      ...extra,
    };
  }

  it("readOnlyHint true→false is HINT_FLIP", () => {
    const changes = diffToolDescriptors(
      tool({ readOnlyHint: true }),
      tool({ readOnlyHint: false }),
    );
    const c = changes.find((x) => x.path === "annotations.readOnlyHint");
    assert.ok(c);
    assert.deepEqual(c!.kinds, ["HINT_FLIP"]);
  });

  it("destructiveHint false→true is HINT_FLIP", () => {
    const changes = diffToolDescriptors(
      tool({ destructiveHint: false }),
      tool({ destructiveHint: true }),
    );
    const c = changes.find((x) => x.path === "annotations.destructiveHint");
    assert.ok(c);
    assert.deepEqual(c!.kinds, ["HINT_FLIP"]);
  });

  it("idempotentHint true→false is HINT_FLIP", () => {
    const changes = diffToolDescriptors(
      tool({ idempotentHint: true }),
      tool({ idempotentHint: false }),
    );
    const c = changes.find((x) => x.path === "annotations.idempotentHint");
    assert.ok(c);
    assert.deepEqual(c!.kinds, ["HINT_FLIP"]);
  });

  it("openWorldHint false→true is HINT_FLIP", () => {
    const changes = diffToolDescriptors(
      tool({ openWorldHint: false }),
      tool({ openWorldHint: true }),
    );
    const c = changes.find((x) => x.path === "annotations.openWorldHint");
    assert.ok(c);
    assert.deepEqual(c!.kinds, ["HINT_FLIP"]);
  });

  it("explicit default then absent still HINT_FLIP (destructiveHint false→absent)", () => {
    const changes = diffToolDescriptors(
      tool({ destructiveHint: false }),
      tool(), // absent
    );
    const c = changes.find((x) => x.path === "annotations.destructiveHint");
    assert.ok(c);
    assert.equal(c!.kind, "removed");
    assert.deepEqual(c!.kinds, ["HINT_FLIP"]);
  });

  it("safer / newly asserted known hints are COMPATIBLE not HINT_FLIP", () => {
    const cases: Array<[Record<string, unknown> | undefined, Record<string, unknown> | undefined, string]> = [
      [tool({ readOnlyHint: false }).annotations, tool({ readOnlyHint: true }).annotations, "annotations.readOnlyHint"],
      [undefined, { readOnlyHint: true }, "annotations.readOnlyHint"],
      [{ destructiveHint: true }, { destructiveHint: false }, "annotations.destructiveHint"],
      [undefined, { destructiveHint: false }, "annotations.destructiveHint"],
      [{ idempotentHint: false }, { idempotentHint: true }, "annotations.idempotentHint"],
      [{ openWorldHint: true }, { openWorldHint: false }, "annotations.openWorldHint"],
    ];
    for (const [oldA, newA, path] of cases) {
      const changes = diffToolDescriptors(
        { name: "t", description: "", inputSchema: {}, ...(oldA ? { annotations: oldA } : {}) },
        { name: "t", description: "", inputSchema: {}, ...(newA ? { annotations: newA } : {}) },
      );
      const c = changes.find((x) => x.path === path);
      assert.ok(c, `missing ${path}`);
      assert.ok(c!.kinds.includes("COMPATIBLE"), JSON.stringify(c));
      assert.ok(!c!.kinds.includes("HINT_FLIP"), JSON.stringify(c));
    }
  });

  it("unknown annotation key add/remove/change is HINT_FLIP", () => {
    const add = diffToolDescriptors(tool(), tool({ customX: 1 }));
    assert.ok(
      add.some(
        (c) =>
          c.path === "annotations.customX" &&
          c.kind === "added" &&
          c.kinds.includes("HINT_FLIP"),
      ),
    );
    const rem = diffToolDescriptors(tool({ customX: 1 }), tool());
    assert.ok(
      rem.some(
        (c) =>
          c.path === "annotations.customX" &&
          c.kind === "removed" &&
          c.kinds.includes("HINT_FLIP"),
      ),
    );
    const ch = diffToolDescriptors(tool({ customX: 1 }), tool({ customX: 2 }));
    assert.ok(
      ch.some(
        (c) =>
          c.path === "annotations.customX" &&
          c.kind === "changed" &&
          c.kinds.includes("HINT_FLIP"),
      ),
    );
  });

});

describe("spec 1.4 — dual kinds + invariants", () => {
  it("dual kinds array on same FieldChange is representable and printed", async () => {
    const { formatFieldChanges, normalizeKinds } = await import("../schema-diff.js");
    assert.deepEqual(normalizeKinds(["BREAKING", "HINT_FLIP", "COMPATIBLE"]), [
      "HINT_FLIP",
      "BREAKING",
      "COMPATIBLE",
    ]);
    const lines = formatFieldChanges([
      {
        path: "annotations.customX",
        kind: "changed",
        kinds: ["HINT_FLIP", "BREAKING"],
        oldValue: "1",
        newValue: "2",
      },
    ]);
    assert.ok(lines[0].includes("HINT_FLIP BREAKING"));
    assert.ok(lines[0].includes("annotations.customX"));
  });

  it("key order invariant (JCS) — annotations/outputSchema key order irrelevant", () => {
    const a = {
      tools: [
        {
          name: "t",
          description: "d",
          inputSchema: { type: "object", properties: { z: { type: "string" }, a: { type: "string" } } },
          annotations: { openWorldHint: false, readOnlyHint: true },
          outputSchema: { type: "object", properties: { b: { type: "number" }, a: { type: "string" } } },
        },
      ],
    };
    const b = {
      tools: [
        {
          outputSchema: { properties: { a: { type: "string" }, b: { type: "number" } }, type: "object" },
          annotations: { readOnlyHint: true, openWorldHint: false },
          inputSchema: { properties: { a: { type: "string" }, z: { type: "string" } }, type: "object" },
          description: "d",
          name: "t",
        },
      ],
    };
    assert.equal(
      computeSurface(a).tools!.entries[0].digest,
      computeSurface(b).tools!.entries[0].digest,
    );
  });

  it("v1 / v2 / v3 verify compat for tools without annotations/outputSchema", () => {
    const tools = JSON.parse(
      readFileSync(join(testdata, "basic.tools.json"), "utf8"),
    );
    const v1 = parseLockfile(
      JSON.parse(readFileSync(join(testdata, "basic.lock.json"), "utf8")),
    );
    const v3 = parseLockfile(
      JSON.parse(readFileSync(join(testdata, "basic.v3.lock.json"), "utf8")),
    );
    assert.equal(diffSurface(tools, v1).match, true);
    assert.equal(diffSurface(tools, v3).match, true);

    // Synthesize v2 from current compute (digests identical)
    const computed = computeSurface(tools);
    const v2 = parseLockfile({
      version: 2,
      algorithm: "sha256",
      canonicalization: "surfacepin-jcs-v1",
      root: computed.root,
      tools: {
        root: computed.tools!.root,
        entries: computed.tools!.entries.map(({ name, digest }) => ({
          name,
          digest,
        })),
      },
    });
    assert.equal(diffSurface(tools, v2).match, true);
  });

  it("digest changes when tool had kept annotation keys or outputSchema", () => {
    const plain = {
      tools: [{ name: "t", description: "", inputSchema: {} }],
    };
    const withAnn = {
      tools: [
        {
          name: "t",
          description: "",
          inputSchema: {},
          annotations: { readOnlyHint: true },
        },
      ],
    };
    const withOut = {
      tools: [
        {
          name: "t",
          description: "",
          inputSchema: {},
          outputSchema: { type: "object" },
        },
      ],
    };
    assert.notEqual(
      computeSurface(plain).tools!.entries[0].digest,
      computeSurface(withAnn).tools!.entries[0].digest,
    );
    assert.notEqual(
      computeSurface(plain).tools!.entries[0].digest,
      computeSurface(withOut).tools!.entries[0].digest,
    );
  });

  it("toolDigest payload includes annotations/outputSchema when present", () => {
    const d = {
      name: "t",
      description: "",
      inputSchema: {},
      annotations: { readOnlyHint: true },
      outputSchema: {},
    };
    const expected = sha256Hex(
      Buffer.from(
        canonicalize({
          annotations: { readOnlyHint: true },
          description: "",
          inputSchema: {},
          name: "t",
          outputSchema: {},
        }),
        "utf8",
      ),
    );
    assert.equal(toolDigest(d), expected);
  });

  it("integration: HINT_FLIP appears in diff -- structured fields", () => {
    const base = {
      tools: [
        {
          name: "echo",
          description: "d",
          inputSchema: { type: "object" },
          annotations: { readOnlyHint: true },
        },
      ],
    };
    const { lockfile } = computeSurface(base);
    const drifted = {
      tools: [
        {
          name: "echo",
          description: "d",
          inputSchema: { type: "object" },
          annotations: { readOnlyHint: false },
        },
      ],
    };
    const d = diffSurface(drifted, lockfile);
    assert.equal(d.match, false);
    const fields = d.changed[0].fields!;
    assert.ok(
      fields.some(
        (f) =>
          f.path === "annotations.readOnlyHint" &&
          f.kinds.includes("HINT_FLIP"),
      ),
    );
    // never leak title
    assert.ok(!fields.some((f) => f.path.includes("title")));
  });
});
