# SurfacePin Lockfile Spec v1

Canonical specification for SurfacePin surface locking.
CLI and Action are reference clients of this document.

**Status:** v1 (2026-09-24)  
**Scope:** MCP `tools/list` surface only (`name`, `description`, `inputSchema`).  
**Not in v1:** resources, prompts, signed lockfiles, network MCP clients, semantic/embedding drift.

---

## 1. Goals

1. **Exact hash** — pass/fail is deterministic byte comparison of digests.
2. **Offline verify** — given a tools JSON file and a lockfile, no network.
3. **Boring standards** — UTF-8, SHA-256, JSON; documented canonicalization.
4. **Adapter-ready core** — lock over a generic *surface descriptor*; MCP tools are the first adapter.

---

## 2. Input shapes

SurfacePin accepts either:

```json
{ "tools": [ /* Tool */ ] }
```

or a full MCP `ListToolsResult`-shaped object that includes `tools` (other top-level fields ignored).

### 2.1 Tool fields used in v1

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Non-empty string. Primary identity. |
| `description` | no | If absent, treated as empty string `""` for hashing. |
| `inputSchema` | no | If absent, treated as `{}` for hashing. Must be a JSON object when present. |

All other tool fields (`annotations`, `outputSchema`, etc.) are **ignored** in v1.

Duplicate `name` values are a **usage error** (exit 2).

---

## 3. Canonicalization: `surfacepin-jcs-v1`

Algorithm id recorded in lockfiles: `"surfacepin-jcs-v1"`.

This is an **RFC 8785 JCS-compatible** deterministic JSON encoding for the JSON data model subset used by SurfacePin (objects, arrays, strings, numbers, booleans, null). Implementation uses Node’s `JSON.parse` / ECMAScript number model.

### 3.1 Rules

1. **Encoding:** UTF-8. No BOM.
2. **Whitespace:** None (no spaces, tabs, newlines between tokens).
3. **Objects:**
   - Keys sorted by UTF-16 code unit order (ECMAScript string `<` / `localeCompare` with undefined locales is **not** used; sort with `a < b` on JS strings, which is UTF-16 code unit lexicographic order — identical to UTF-8 byte order for BMP content typical in schemas; see note below).
   - Actually for v1 we specify: **sort object keys by UTF-8 byte order** of the key string (after JSON string unescaping). For keys consisting only of BMP characters without unpaired surrogates, UTF-8 byte order matches UTF-16 code unit order for ASCII and most schema keys.
   - Practical rule used by the reference implementation: sort keys with JavaScript `localeCompare` disabled — use `(a < b ? -1 : a > b ? 1 : 0)` which is UTF-16 code unit order. Documented as **UTF-16 code unit lexicographic order** (ECMAScript default string comparison). This matches RFC 8785 §3.2.3 for the BMP / no-surrogate keys used in MCP schemas.
4. **Arrays:** Preserve order. Recursively canonicalize elements.
5. **Strings:** JSON string encoding per ECMA-404 / RFC 8259 (`JSON.stringify` string rules): `"`, `\`, and control chars U+0000–U+001F escaped; other Unicode as literal UTF-8 in the output bytes after the JSON text is encoded as UTF-8.
6. **Booleans / null:** `true`, `false`, `null`.
7. **Numbers:** ECMAScript `Number` serialization via the same rules as `JSON.stringify` for finite numbers (shortest round-trip decimal form). `NaN` / `±Infinity` are **not allowed** (usage error if present after parse).
8. **No `undefined`:** JSON has no undefined; omit object members that would be undefined (standard JSON).

### 3.2 Surface descriptor (per tool)

For each tool, build a plain object:

```json
{
  "description": "<string>",
  "inputSchema": { /* object */ },
  "name": "<string>"
}
```

Keys appear in sorted order in the canonical form (`description`, `inputSchema`, `name`).

Canonical bytes = UTF-8 encoding of `canonicalize(descriptor)`.

### 3.3 Tool order for the root

Sort tools by `name` using **UTF-8 byte order** (equivalent to UTF-16 code unit order for typical MCP tool names: `[a-zA-Z0-9_-]`).

### 3.4 Digests

- `toolDigest` = lowercase hex SHA-256 of the tool’s canonical UTF-8 bytes.
- `rootDigest` = lowercase hex SHA-256 of the **root payload** defined below.

**Root payload** (not JSON-canonicalized as a whole — fixed concatenation to keep the root independent of lockfile pretty-printing):

```
"surfacepin-v1\n" +
for each tool in name-sorted order:
  name + "\n" + toolDigest + "\n"
```

Empty tools list → root over `"surfacepin-v1\n"` only.

---

## 4. Lockfile format v1

File: typically `surfacepin.lock.json` (name is conventional, not mandated).

```json
{
  "version": 1,
  "algorithm": "sha256",
  "canonicalization": "surfacepin-jcs-v1",
  "root": "<64 lowercase hex chars>",
  "tools": [
    {
      "name": "<tool name>",
      "digest": "<64 lowercase hex chars>"
    }
  ]
}
```

### 4.1 Field rules

| Field | Type | Rule |
|-------|------|------|
| `version` | number | Must be `1` for this spec. |
| `algorithm` | string | Must be `"sha256"`. |
| `canonicalization` | string | Must be `"surfacepin-jcs-v1"`. |
| `root` | string | 64 lowercase hex chars; must equal recomputed root. |
| `tools` | array | Sorted by `name` (UTF-8 / UTF-16 code unit order). Each entry has `name` + `digest`. |

Unknown top-level fields: **ignored** by v1 verifiers (forward compatible).  
Missing required fields: **usage / format error**.

Lockfiles **should** be written with stable formatting: 2-space indent, trailing newline, tools already sorted (human-diff friendly). Formatting of the lockfile file itself is **not** hashed; only digests matter.

### 4.2 JSON Schema (informative)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/yellowgram/surfacepin/schemas/lockfile-v1.json",
  "type": "object",
  "required": ["version", "algorithm", "canonicalization", "root", "tools"],
  "properties": {
    "version": { "const": 1 },
    "algorithm": { "const": "sha256" },
    "canonicalization": { "const": "surfacepin-jcs-v1" },
    "root": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "tools": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "digest"],
        "properties": {
          "name": { "type": "string", "minLength": 1 },
          "digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" }
        },
        "additionalProperties": true
      }
    }
  },
  "additionalProperties": true
}
```

---

## 5. Operations

### 5.1 `lock`

1. Parse tools JSON.
2. Normalize tools → descriptors; reject duplicates / invalid.
3. Compute per-tool digests + root.
4. Write lockfile JSON.

Exit `0` on success, `2` on usage/parse error.

### 5.2 `verify`

1. Parse tools JSON + lockfile.
2. Recompute digests from tools JSON.
3. Compare to lockfile: root and each named tool digest; detect added/removed names.

Exit `0` if exact match, `1` if drift, `2` on usage/parse/format error.

### 5.3 `diff`

Same computation as verify; always print human-readable summary:

- `ADDED` tool names
- `REMOVED` tool names
- `CHANGED` tool names (digest mismatch) with old → new digest
- `ROOT` old → new if different

Exit codes same as verify (0 match, 1 drift, 2 error).

---

## 6. Exit codes (CLI)

| Code | Meaning |
|------|---------|
| 0 | Success / surfaces match |
| 1 | Drift / mismatch |
| 2 | Usage, I/O, parse, or format error |

---

## 7. Post-v1 (explicitly out of scope)

- Live MCP `tools/list` over stdio/HTTP (network client)
- Pinning `resources/list` / `prompts/list`
- Structured schema field-level diffs
- Signed lockfiles / provenance
- Semantic or embedding “similarity” gates

---

## 8. Conformance

Golden vectors under `testdata/` are normative for digests. Implementations MUST match those digests for the given inputs.
