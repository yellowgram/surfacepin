# SurfacePin Lockfile Spec

Canonical specification for SurfacePin surface locking.
CLI and Action are reference clients of this document.

**Status:** v1.3 (2026-09-24)  
**Scope:** MCP `tools/list`, `resources/list`, and `prompts/list` surfaces.  
**Wire formats:** lockfile **v1** (tools digests), **v2** (multi-surface digests), **v3** (multi-surface + embedded hashed payloads for structured field-diff).  
**Not in wire format:** signed lockfiles, semantic/embedding drift, LLM-assisted diff.

---

## 1. Goals

1. **Exact hash** — pass/fail is deterministic byte comparison of digests.
2. **Offline verify** — given a surface JSON file and a lockfile, no network.
3. **Boring standards** — UTF-8, SHA-256, JSON; documented canonicalization.
4. **Adapter-ready core** — lock over generic *surface descriptors*; MCP list results are adapters.
5. **Explanatory field-diff** — on digest mismatch, optionally explain *what* changed via deterministic JSON Schema / descriptor path diffs (lockfile v3). Never affects pass/fail.

---

## 2. Surface kinds

| Kind | MCP method | Identity key | Hashed fields |
|------|------------|--------------|---------------|
| `tools` | `tools/list` | `name` | `name`, `description`, `inputSchema` |
| `resources` | `resources/list` | `uri` | `uri`, `name`, `description`, `mimeType` |
| `prompts` | `prompts/list` | `name` | `name`, `description`, `arguments` |

Canonicalization algorithm id (unchanged): `"surfacepin-jcs-v1"`.

### 2.1 Input shapes

SurfacePin accepts a combined document:

```json
{
  "tools": [ /* Tool */ ],
  "resources": [ /* Resource */ ],
  "prompts": [ /* Prompt */ ]
}
```

or List*Result-shaped objects that include those keys (other top-level fields ignored).
Selected kinds with a missing key are treated as an **empty array**.

### 2.2 Tools (unchanged from v1)

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Non-empty string. Primary identity. |
| `description` | no | If absent, treated as `""`. |
| `inputSchema` | no | If absent, treated as `{}`. Must be a JSON object when present. |

All other tool fields (`annotations`, `outputSchema`, etc.) are **ignored**.
Duplicate `name` values are a **usage error** (exit 2).

**Tool descriptor** (hashed):

```json
{ "description": "<string>", "inputSchema": { }, "name": "<string>" }
```

### 2.3 Resources

MCP Resource shape fields that matter for drift. **Ignored** (volatile / non-identity): `size`, `annotations`, `title`, `icons`, `_meta`, and any other fields.

| Field | Required | Notes |
|-------|----------|-------|
| `uri` | yes | Non-empty string. Primary identity. |
| `name` | yes | Non-empty string. |
| `description` | no | If absent, treated as `""`. |
| `mimeType` | no | If absent, treated as `""`. |

Duplicate `uri` values are a **usage error** (exit 2).

**Resource descriptor** (hashed):

```json
{
  "description": "<string>",
  "mimeType": "<string>",
  "name": "<string>",
  "uri": "<string>"
}
```

Sort resources by `uri` (UTF-16 code unit order) for the section root.

### 2.4 Prompts

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Non-empty string. Primary identity. |
| `description` | no | If absent, treated as `""`. |
| `arguments` | no | If absent, treated as `[]`. MCP PromptArgument list; **order preserved**. |

Ignored: `title`, `icons`, `_meta`, and any other fields.
Duplicate prompt `name` values are a **usage error** (exit 2).

**PromptArgument** (each element normalized):

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Non-empty string. |
| `description` | no | If absent, treated as `""`. |
| `required` | no | If absent, treated as `false`. |

**Prompt descriptor** (hashed):

```json
{
  "arguments": [
    { "description": "<string>", "name": "<string>", "required": false }
  ],
  "description": "<string>",
  "name": "<string>"
}
```

Sort prompts by `name` for the section root. Argument array order is **not** sorted.

---

## 3. Canonicalization: `surfacepin-jcs-v1`

Algorithm id recorded in lockfiles: `"surfacepin-jcs-v1"`.

This is an **RFC 8785 JCS-compatible** deterministic JSON encoding for the JSON data model subset used by SurfacePin (objects, arrays, strings, numbers, booleans, null). Implementation uses Node’s `JSON.parse` / ECMAScript number model.

### 3.1 Rules

1. **Encoding:** UTF-8. No BOM.
2. **Whitespace:** None (no spaces, tabs, newlines between tokens).
3. **Objects:** Keys sorted by UTF-16 code unit lexicographic order (ECMAScript default string comparison: `(a < b ? -1 : a > b ? 1 : 0)`).
4. **Arrays:** Preserve order. Recursively canonicalize elements.
5. **Strings:** JSON string encoding per ECMA-404 / RFC 8259.
6. **Booleans / null:** `true`, `false`, `null`.
7. **Numbers:** ECMAScript `Number` serialization via `JSON.stringify` rules for finite numbers. `NaN` / `±Infinity` are **not allowed**.
8. **No `undefined`:** omit object members that would be undefined.

Canonical bytes = UTF-8 encoding of `canonicalize(descriptor)`.

### 3.2 Digests

- Item digest = lowercase hex SHA-256 of the item’s canonical UTF-8 bytes.
- Section / overall roots use fixed concatenation (not JSON-canonicalized as a whole).

**Tools section root** (also lockfile v1 `root`):

```
"surfacepin-v1\n" +
for each tool in name-sorted order:
  name + "\n" + toolDigest + "\n"
```

Empty tools → `"surfacepin-v1\n"` only.

**Resources section root:**

```
"surfacepin-resources-v1\n" +
for each resource in uri-sorted order:
  uri + "\n" + resourceDigest + "\n"
```

**Prompts section root:**

```
"surfacepin-prompts-v1\n" +
for each prompt in name-sorted order:
  name + "\n" + promptDigest + "\n"
```

**Overall root (lockfile v2 / v3):**

```
"surfacepin-v2\n" +
for each selected kind in fixed order [tools, resources, prompts]:
  kind + "\n" + sectionRoot + "\n"
```

Only selected (present) sections are included. Digests and roots are **identical** across v2 and v3 for the same surface content; v3 only adds embedded payloads.

---

## 4. Lockfile formats

### 4.1 Lockfile v1 — tools only (legacy write; still verified)

Written by SurfacePin ≤1.2 when the selected surface was **tools only**.

```json
{
  "version": 1,
  "algorithm": "sha256",
  "canonicalization": "surfacepin-jcs-v1",
  "root": "<64 lowercase hex chars>",
  "tools": [
    { "name": "<tool name>", "digest": "<64 lowercase hex chars>" }
  ]
}
```

`tools` sorted by `name`. `root` = tools section root.

### 4.2 Lockfile v2 — multi-surface digests (legacy write; still verified)

Written by SurfacePin 1.2 when any non-tools surface was selected.
Only selected sections are present. Each section has its own `root` + `entries`.

```json
{
  "version": 2,
  "algorithm": "sha256",
  "canonicalization": "surfacepin-jcs-v1",
  "root": "<overall root>",
  "tools": {
    "root": "<tools section root>",
    "entries": [{ "name": "<tool name>", "digest": "<hex>" }]
  },
  "resources": {
    "root": "<resources section root>",
    "entries": [{ "uri": "<resource uri>", "digest": "<hex>" }]
  },
  "prompts": {
    "root": "<prompts section root>",
    "entries": [{ "name": "<prompt name>", "digest": "<hex>" }]
  }
}
```

### 4.3 Lockfile v3 — multi-surface + embedded surfaces (current write)

**Written by SurfacePin ≥1.3 for all new locks** (including tools-only).
Same section/root digest rules as v2. Each entry includes `surface`: the **exact** object that was hashed (tool / resource / prompt descriptor). This enables offline structured field-diff without a second baseline file.

```json
{
  "version": 3,
  "algorithm": "sha256",
  "canonicalization": "surfacepin-jcs-v1",
  "root": "<overall root>",
  "tools": {
    "root": "<tools section root>",
    "entries": [
      {
        "name": "echo",
        "digest": "<hex>",
        "surface": {
          "description": "...",
          "inputSchema": { },
          "name": "echo"
        }
      }
    ]
  },
  "resources": {
    "root": "<resources section root>",
    "entries": [
      {
        "uri": "file:///x",
        "digest": "<hex>",
        "surface": {
          "description": "...",
          "mimeType": "...",
          "name": "...",
          "uri": "file:///x"
        }
      }
    ]
  },
  "prompts": {
    "root": "<prompts section root>",
    "entries": [
      {
        "name": "greet",
        "digest": "<hex>",
        "surface": {
          "arguments": [
            { "description": "...", "name": "who", "required": true }
          ],
          "description": "...",
          "name": "greet"
        }
      }
    ]
  }
}
```

| Field | Rule |
|-------|------|
| `version` | Must be `3`. |
| `algorithm` | `"sha256"`. |
| `canonicalization` | `"surfacepin-jcs-v1"`. |
| `root` | Overall root over present sections (same algorithm as v2). |
| `tools` / `resources` / `prompts` | Optional; at least one required. |
| `entries[].surface` | Required when writing v3; exact hashed descriptor. |

Unknown top-level fields: **ignored** (forward compatible).  
Missing required fields: **usage / format error**.

Lockfiles **should** use 2-space indent + trailing newline. File formatting is **not** hashed.

**Compatibility:** Verifiers MUST accept v1, v2, and v3. Item digests and section roots are identical across versions for the same surface content. Overall root for tools-only v3 uses the v2 overall-root algorithm (differs from v1 `root`, which is the tools section root alone).

---

## 5. Operations

### 5.1 `lock`

1. Parse surface JSON (or live adapter output) for selected kinds.
2. Normalize → descriptors; reject duplicates / invalid.
3. Compute per-item digests + section roots + overall root.
4. Write lockfile JSON **v3** with embedded `surface` payloads.

Exit `0` on success, `2` on usage/parse error.

### 5.2 `verify`

1. Parse surface JSON + lockfile.
2. Recompute digests for lockfile’s surfaces (selection must match lock sections).
3. Compare section roots, overall/root, and each named/uri entry; detect added/removed ids.

Pass/fail is **digest equality only**. Embedded surfaces are not required for verify.

Exit `0` if exact match, `1` if drift, `2` on usage/parse/format error.

### 5.3 `diff`

Same computation as verify; always print human-readable summary:

- Per surface kind (when multi): `[tools]`, `[resources]`, `[prompts]`
- `ADDED` / `REMOVED` / `CHANGED` ids (digest mismatch) with old → new digest
- For `CHANGED` items when the lockfile entry has `surface` (v3): path-level field changes (see §6)
- `SECTION` old → new if section root differs
- `ROOT` old → new if overall/root differs

Optional `--json` emits the structured `DiffResult` object (including `fields` arrays).

Exit codes same as verify (0 match, 1 drift, 2 error).

---

## 6. Structured field-diff (explanatory)

Deterministic only — **no** LLM, embeddings, or fuzzy similarity. Classification does **not** affect exit codes.

### 6.1 Scope

When a lock entry embeds `surface` and the item digest changed, compare old `surface` vs the newly computed descriptor:

| Kind | Diff engine |
|------|-------------|
| tools | descriptor `description` + recursive JSON Schema diff on `inputSchema` |
| resources | `uri` / `name` / `description` / `mimeType` field compares |
| prompts | `description` + arguments matched **by name** |

### 6.2 Output lines

Stable sorted by `path`, then `kind`. Each change:

```
ADDED|REMOVED|CHANGED <path> (BREAKING|non-breaking)
        <old> -> <new>   # or + value / - value
```

Paths use dotted JSON-ish form, e.g. `inputSchema.properties.text.type`, `inputSchema.required["lang"]`, `arguments["who"].required`.

### 6.3 Breaking vs non-breaking (deterministic rules)

**Breaking** (examples):

- Remove a `properties` entry
- Add a name to `required`
- Narrow `type` (remove an allowed type, or replace with a disjoint type)
- Remove an `enum` value; change `const`
- Tighten numeric/length constraints (`minimum`↑, `maximum`↓, `minLength`↑, …)
- `additionalProperties: true → false`
- Resource `mimeType` / `name` / `uri` change
- Prompt argument removed; new required argument; `required: false → true`

**Non-breaking** (examples):

- Add an optional property (not listed in `required`)
- Remove a name from `required`
- Widen `type` (old type set ⊆ new)
- Add an `enum` value; remove `const` / loosen constraints
- `description` / `title` / `$comment` / `$id` / `examples` / `default` changes
- Prompt argument description change; `required: true → false`; argument reorder only
- Add optional prompt argument (`required: false`)

Unknown keyword value changes default to **breaking** (fail-closed classification). Meta keys listed above are always non-breaking.

---

## 7. Exit codes (CLI)

| Code | Meaning |
|------|---------|
| 0 | Success / surfaces match |
| 1 | Drift / mismatch |
| 2 | Usage, I/O, parse, or format error |

---

## 8. Adapters (out of band)

Live MCP clients (stdio, etc.) are **reference adapters** that produce the input
shape in §2. They are **not** part of the lockfile wire format.

The reference CLI supports `surfacepin … --stdio -- <command> [args…]` (package
≥1.1.0) and `--surface tools,resources,prompts` (package ≥1.2.0). After
initialize, the adapter calls `tools/list`, `resources/list`, and/or
`prompts/list` as selected. If the server omits a capability, the adapter
treats that surface as **empty** and prints a clear stderr note.

Streamable HTTP / SSE live fetch is not required for lockfile conformance.

## 9. Explicitly out of scope

- Signed lockfiles / provenance
- Semantic or embedding “similarity” gates
- Resource templates (`resources/templates/list`) — not pinned in 1.3
- LLM / fuzzy schema matching

## 10. Conformance

Golden vectors under `testdata/` are normative for digests. Implementations MUST match those digests for the given inputs. Structured field-diff classification rules in §6 are normative for the reference CLI’s explanatory output.
