import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diffJsonSchema,
  diffPromptDescriptors,
  diffToolDescriptors,
  formatFieldChanges,
} from "../schema-diff.js";
import { computeSurface } from "../lock.js";
import { diffSurface, formatDiff, parseLockfile } from "../verify.js";

describe("diffJsonSchema breaking / non-breaking", () => {
  it("adding optional property is non-breaking", () => {
    const oldS = {
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
    };
    const newS = {
      type: "object",
      properties: {
        a: { type: "string" },
        b: { type: "number" },
      },
      required: ["a"],
    };
    const changes = diffJsonSchema(oldS, newS);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].path, "properties.b");
    assert.equal(changes[0].kind, "added");
    assert.equal(changes[0].severity, "non-breaking");
  });

  it("removing property is breaking", () => {
    const oldS = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
    };
    const newS = {
      type: "object",
      properties: { a: { type: "string" } },
    };
    const changes = diffJsonSchema(oldS, newS);
    assert.ok(changes.some((c) => c.path === "properties.b" && c.kind === "removed" && c.severity === "breaking"));
  });

  it("adding to required is breaking", () => {
    const oldS = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
      required: ["a"],
    };
    const newS = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
      required: ["a", "b"],
    };
    const changes = diffJsonSchema(oldS, newS);
    assert.ok(
      changes.some(
        (c) =>
          c.path.includes("required") &&
          c.kind === "added" &&
          c.severity === "breaking",
      ),
    );
  });

  it("removing from required is non-breaking", () => {
    const oldS = {
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
    };
    const newS = {
      type: "object",
      properties: { a: { type: "string" } },
      required: [],
    };
    const changes = diffJsonSchema(oldS, newS);
    assert.ok(
      changes.some(
        (c) =>
          c.path.includes("required") &&
          c.kind === "removed" &&
          c.severity === "non-breaking",
      ),
    );
  });

  it("narrowing type is breaking; widening is non-breaking", () => {
    const narrow = diffJsonSchema(
      { type: ["string", "number"] },
      { type: "string" },
    );
    assert.ok(
      narrow.some(
        (c) => c.path === "type" && c.severity === "breaking",
      ),
    );
    const widen = diffJsonSchema(
      { type: "string" },
      { type: ["string", "null"] },
    );
    assert.ok(
      widen.some(
        (c) => c.path === "type" && c.severity === "non-breaking",
      ),
    );
  });

  it("description-only change is non-breaking", () => {
    const changes = diffJsonSchema(
      { type: "string", description: "old" },
      { type: "string", description: "new" },
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].path, "description");
    assert.equal(changes[0].severity, "non-breaking");
  });

  it("enum value removal is breaking; add is non-breaking", () => {
    const rem = diffJsonSchema(
      { enum: ["a", "b"] },
      { enum: ["a"] },
    );
    assert.ok(rem.some((c) => c.kind === "removed" && c.severity === "breaking"));
    const add = diffJsonSchema(
      { enum: ["a"] },
      { enum: ["a", "b"] },
    );
    assert.ok(add.some((c) => c.kind === "added" && c.severity === "non-breaking"));
  });

  it("paths are sorted stably", () => {
    const changes = diffJsonSchema(
      {
        type: "object",
        properties: { z: { type: "string" }, a: { type: "string" } },
      },
      {
        type: "object",
        properties: { z: { type: "number" }, a: { type: "number" } },
      },
    );
    const paths = changes.map((c) => c.path);
    const sorted = [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    assert.deepEqual(paths, sorted);
  });
});

describe("diffToolDescriptors / prompts", () => {
  it("tool description change is non-breaking; schema type change breaking", () => {
    const oldD = {
      name: "t",
      description: "old",
      inputSchema: {
        type: "object",
        properties: { x: { type: "string" } },
        required: ["x"],
      },
    };
    const newD = {
      name: "t",
      description: "new",
      inputSchema: {
        type: "object",
        properties: { x: { type: "number" } },
        required: ["x"],
      },
    };
    const changes = diffToolDescriptors(oldD, newD);
    assert.ok(
      changes.some(
        (c) => c.path === "description" && c.severity === "non-breaking",
      ),
    );
    assert.ok(
      changes.some(
        (c) =>
          c.path === "inputSchema.properties.x.type" &&
          c.severity === "breaking",
      ),
    );
  });

  it("prompt required true←false is breaking", () => {
    const oldD = {
      name: "p",
      description: "",
      arguments: [{ name: "x", description: "", required: false }],
    };
    const newD = {
      name: "p",
      description: "",
      arguments: [{ name: "x", description: "", required: true }],
    };
    const changes = diffPromptDescriptors(oldD, newD);
    assert.ok(
      changes.some(
        (c) =>
          c.path.includes("required") &&
          c.kind === "changed" &&
          c.severity === "breaking",
      ),
    );
  });
});

describe("lockfile v3 structured diff integration", () => {
  it("diff includes field paths for changed tool schema", () => {
    const base = {
      tools: [
        {
          name: "echo",
          description: "Echo text back",
          inputSchema: {
            type: "object",
            properties: {
              text: { type: "string", description: "Text to echo" },
            },
            required: ["text"],
          },
        },
      ],
    };
    const { lockfile } = computeSurface(base);
    assert.equal(lockfile.version, 3);

    const drifted = structuredClone(base) as {
      tools: Array<{
        name: string;
        description: string;
        inputSchema: {
          type: string;
          properties: Record<string, unknown>;
          required: string[];
        };
      }>;
    };
    // breaking: narrow type + add required prop
    drifted.tools[0].inputSchema.properties.text = { type: "number" };
    drifted.tools[0].inputSchema.properties.lang = { type: "string" };
    drifted.tools[0].inputSchema.required = ["text", "lang"];
    drifted.tools[0].description = "Echo text back (v2)";

    const d = diffSurface(drifted, lockfile);
    assert.equal(d.match, false);
    assert.equal(d.changed.length, 1);
    assert.ok(d.changed[0].fields && d.changed[0].fields.length > 0);
    const fields = d.changed[0].fields!;
    assert.ok(
      fields.some(
        (f) =>
          f.path === "inputSchema.properties.text.type" &&
          f.severity === "breaking",
      ),
    );
    assert.ok(
      fields.some(
        (f) =>
          f.path === "inputSchema.properties.lang" &&
          f.kind === "added" &&
          f.severity === "non-breaking",
      ),
    );
    assert.ok(
      fields.some(
        (f) =>
          f.path.includes("required") &&
          f.kind === "added" &&
          f.severity === "breaking",
      ),
    );
    assert.ok(
      fields.some(
        (f) => f.path === "description" && f.severity === "non-breaking",
      ),
    );

    const text = formatDiff(d);
    assert.match(text, /BREAKING/);
    assert.match(text, /inputSchema\.properties\.text\.type/);
    assert.match(text, /non-breaking/);
  });

  it("v1 lock still verifies by digest without field paths", () => {
    const tools = {
      tools: [
        {
          name: "echo",
          description: "Echo text back",
          inputSchema: {
            type: "object",
            properties: {
              text: { type: "string", description: "Text to echo" },
            },
            required: ["text"],
          },
        },
        {
          name: "ping",
          description: "Health check",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    };
    // Simulate v1 lock (no surfaces)
    const computed = computeSurface(tools);
    const v1 = {
      version: 1 as const,
      algorithm: "sha256" as const,
      canonicalization: "surfacepin-jcs-v1" as const,
      root: computed.tools!.root,
      tools: computed.tools!.entries.map(({ name, digest }) => ({
        name,
        digest,
      })),
    };
    const lock = parseLockfile(v1);
    const ok = diffSurface(tools, lock);
    assert.equal(ok.match, true);

    const drifted = structuredClone(tools) as {
      tools: Array<{
        name: string;
        description: string;
        inputSchema: {
          type: string;
          properties: Record<string, unknown>;
          required?: string[];
        };
      }>;
    };
    drifted.tools[0].inputSchema.properties.text = { type: "boolean" };
    const d = diffSurface(drifted, lock);
    assert.equal(d.match, false);
    assert.equal(d.changed.length, 1);
    assert.equal(d.changed[0].fields, undefined);
  });

  it("formatFieldChanges is stable", () => {
    const lines = formatFieldChanges([
      {
        path: "inputSchema.properties.a",
        kind: "removed",
        severity: "breaking",
        oldValue: '{"type":"string"}',
      },
      {
        path: "description",
        kind: "changed",
        severity: "non-breaking",
        oldValue: '"x"',
        newValue: '"y"',
      },
    ]);
    assert.ok(lines.some((l) => l.includes("BREAKING")));
    assert.ok(lines.some((l) => l.includes("non-breaking")));
  });
});
