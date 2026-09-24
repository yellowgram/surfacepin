/**
 * Deterministic JSON Schema / descriptor field-diff.
 * Exact structural comparison only — no LLM, embeddings, or fuzzy similarity.
 */

export type ChangeSeverity = "breaking" | "non-breaking";
export type ChangeKind = "added" | "removed" | "changed";

export interface FieldChange {
  /** Dot-path from descriptor root, e.g. "inputSchema.properties.text.type" */
  path: string;
  kind: ChangeKind;
  severity: ChangeSeverity;
  /** Compact JSON for display (optional). */
  oldValue?: string;
  newValue?: string;
}

const META_KEYS = new Set([
  "description",
  "title",
  "$comment",
  "$id",
  "$schema",
  "examples",
  "default",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Stable JSON for display (sorted keys via recursive canonicalize-lite). */
export function compactJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!isPlainObject(value)) return value;
  const keys = Object.keys(value).sort(cmpStr);
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = sortKeysDeep(value[k]);
  return out;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a).sort(cmpStr);
    const bk = Object.keys(b).sort(cmpStr);
    if (ak.length !== bk.length) return false;
    for (let i = 0; i < ak.length; i++) {
      if (ak[i] !== bk[i]) return false;
      if (!deepEqual(a[ak[i]], b[bk[i]])) return false;
    }
    return true;
  }
  return false;
}

function push(
  out: FieldChange[],
  path: string,
  kind: ChangeKind,
  severity: ChangeSeverity,
  oldValue?: unknown,
  newValue?: unknown,
): void {
  const c: FieldChange = { path, kind, severity };
  if (oldValue !== undefined) c.oldValue = compactJson(oldValue);
  if (newValue !== undefined) c.newValue = compactJson(newValue);
  out.push(c);
}

/** Normalize JSON Schema `type` to a sorted unique string list. */
function typeSet(t: unknown): string[] | null {
  if (typeof t === "string") return [t];
  if (Array.isArray(t) && t.every((x) => typeof x === "string")) {
    return [...new Set(t as string[])].sort(cmpStr);
  }
  return null;
}

/**
 * Type narrowing: every new type was already allowed in old → non-breaking widen reverse.
 * Removing a allowed type, or switching to a disjoint type → breaking.
 * null alone handling: treat as set comparison.
 */
function typeChangeSeverity(oldT: unknown, newT: unknown): ChangeSeverity {
  const o = typeSet(oldT);
  const n = typeSet(newT);
  if (o === null || n === null) {
    // Non-standard type forms — treat inequality as breaking.
    return deepEqual(oldT, newT) ? "non-breaking" : "breaking";
  }
  const oSet = new Set(o);
  const nSet = new Set(n);
  // Widening: old ⊆ new
  let widened = true;
  for (const x of oSet) {
    if (!nSet.has(x)) {
      widened = false;
      break;
    }
  }
  if (widened && nSet.size >= oSet.size) return "non-breaking";
  // Narrowing or replacement → breaking
  return "breaking";
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  if (!v.every((x) => typeof x === "string")) return null;
  return v as string[];
}

/** Diff JSON Schema `required` arrays as sets. */
function diffRequired(
  out: FieldChange[],
  path: string,
  oldReq: unknown,
  newReq: unknown,
): void {
  const o = asStringArray(oldReq) ?? [];
  const n = asStringArray(newReq) ?? [];
  const oSet = new Set(o);
  const nSet = new Set(n);
  const added: string[] = [];
  const removed: string[] = [];
  for (const x of nSet) if (!oSet.has(x)) added.push(x);
  for (const x of oSet) if (!nSet.has(x)) removed.push(x);
  added.sort(cmpStr);
  removed.sort(cmpStr);
  for (const name of added) {
    // Adding to required = breaking
    push(out, `${path}[${JSON.stringify(name)}]`, "added", "breaking", undefined, name);
  }
  for (const name of removed) {
    // Removing from required = non-breaking
    push(out, `${path}[${JSON.stringify(name)}]`, "removed", "non-breaking", name, undefined);
  }
}

function diffEnumClean(
  out: FieldChange[],
  path: string,
  oldEnum: unknown,
  newEnum: unknown,
): void {
  if (!Array.isArray(oldEnum) || !Array.isArray(newEnum)) {
    if (!deepEqual(oldEnum, newEnum)) {
      push(out, path, "changed", "breaking", oldEnum, newEnum);
    }
    return;
  }
  const oMap = new Map(oldEnum.map((x) => [compactJson(x), x]));
  const nMap = new Map(newEnum.map((x) => [compactJson(x), x]));
  const added = [...nMap.keys()].filter((k) => !oMap.has(k)).sort(cmpStr);
  const removed = [...oMap.keys()].filter((k) => !nMap.has(k)).sort(cmpStr);
  for (const k of added) {
    push(out, `${path}[]`, "added", "non-breaking", undefined, nMap.get(k));
  }
  for (const k of removed) {
    push(out, `${path}[]`, "removed", "breaking", oMap.get(k), undefined);
  }
}

/** Numeric / length constraint tightening → breaking; loosening → non-breaking. */
function constraintSeverity(
  key: string,
  oldV: unknown,
  newV: unknown,
): ChangeSeverity {
  if (typeof oldV !== "number" || typeof newV !== "number") {
    return "breaking";
  }
  // Higher minimum / minLength / minItems / minProperties = tighter
  if (
    key === "minimum" ||
    key === "exclusiveMinimum" ||
    key === "minLength" ||
    key === "minItems" ||
    key === "minProperties"
  ) {
    return newV > oldV ? "breaking" : "non-breaking";
  }
  // Lower maximum / maxLength / maxItems / maxProperties = tighter
  if (
    key === "maximum" ||
    key === "exclusiveMaximum" ||
    key === "maxLength" ||
    key === "maxItems" ||
    key === "maxProperties"
  ) {
    return newV < oldV ? "breaking" : "non-breaking";
  }
  return "breaking";
}

/**
 * Recursively diff two JSON Schema (or schema-like) values.
 */
export function diffJsonSchema(
  oldSchema: unknown,
  newSchema: unknown,
  basePath = "",
): FieldChange[] {
  const out: FieldChange[] = [];
  diffSchemaNode(out, basePath, oldSchema, newSchema);
  out.sort((a, b) => cmpStr(a.path, b.path) || cmpStr(a.kind, b.kind));
  return out;
}

function diffSchemaNode(
  out: FieldChange[],
  path: string,
  oldV: unknown,
  newV: unknown,
): void {
  if (deepEqual(oldV, newV)) return;

  if (oldV === undefined && newV !== undefined) {
    push(out, path || "$", "added", pathIsMeta(path) ? "non-breaking" : "breaking", undefined, newV);
    return;
  }
  if (oldV !== undefined && newV === undefined) {
    push(out, path || "$", "removed", pathIsMeta(path) ? "non-breaking" : "breaking", oldV, undefined);
    return;
  }

  // Both defined, not equal
  if (isPlainObject(oldV) && isPlainObject(newV)) {
    diffSchemaObject(out, path, oldV, newV);
    return;
  }

  // Array at this path (e.g. items as tuple, or bare) — fall through to value change
  if (Array.isArray(oldV) || Array.isArray(newV)) {
    push(out, path || "$", "changed", "breaking", oldV, newV);
    return;
  }

  // Primitive mismatch
  const sev = pathIsMeta(path) ? "non-breaking" : "breaking";
  push(out, path || "$", "changed", sev, oldV, newV);
}

function pathIsMeta(path: string): boolean {
  const leaf = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1) : path;
  return META_KEYS.has(leaf);
}

function joinPath(base: string, key: string): string {
  if (!base) return key;
  return `${base}.${key}`;
}

function diffSchemaObject(
  out: FieldChange[],
  path: string,
  oldO: Record<string, unknown>,
  newO: Record<string, unknown>,
): void {
  const keys = new Set([...Object.keys(oldO), ...Object.keys(newO)]);
  const sorted = [...keys].sort(cmpStr);

  for (const key of sorted) {
    const p = joinPath(path, key);
    const ov = oldO[key];
    const nv = newO[key];

    if (deepEqual(ov, nv)) continue;

    if (key === "properties" && isPlainObject(ov ?? {}) && isPlainObject(nv ?? {})) {
      diffPropertiesMap(out, p, (ov ?? {}) as Record<string, unknown>, (nv ?? {}) as Record<string, unknown>);
      continue;
    }

    if (key === "required") {
      // If one side missing, treat as []
      diffRequired(out, p, ov ?? [], nv ?? []);
      continue;
    }

    if (key === "type") {
      if (ov === undefined) {
        push(out, p, "added", "breaking", undefined, nv);
      } else if (nv === undefined) {
        push(out, p, "removed", "breaking", ov, undefined);
      } else {
        push(out, p, "changed", typeChangeSeverity(ov, nv), ov, nv);
      }
      continue;
    }

    if (key === "enum") {
      if (ov === undefined) {
        push(out, p, "added", "breaking", undefined, nv);
      } else if (nv === undefined) {
        push(out, p, "removed", "non-breaking", ov, undefined);
      } else {
        diffEnumClean(out, p, ov, nv);
      }
      continue;
    }

    if (key === "const") {
      if (ov === undefined) {
        push(out, p, "added", "breaking", undefined, nv);
      } else if (nv === undefined) {
        push(out, p, "removed", "non-breaking", ov, undefined);
      } else {
        push(out, p, "changed", "breaking", ov, nv);
      }
      continue;
    }

    if (key === "additionalProperties") {
      diffAdditionalProperties(out, p, ov, nv);
      continue;
    }

    if (key === "items") {
      if (ov === undefined) {
        push(out, p, "added", "breaking", undefined, nv);
      } else if (nv === undefined) {
        push(out, p, "removed", "non-breaking", ov, undefined);
      } else {
        diffSchemaNode(out, p, ov, nv);
      }
      continue;
    }

    if (
      key === "minimum" ||
      key === "maximum" ||
      key === "exclusiveMinimum" ||
      key === "exclusiveMaximum" ||
      key === "minLength" ||
      key === "maxLength" ||
      key === "minItems" ||
      key === "maxItems" ||
      key === "minProperties" ||
      key === "maxProperties"
    ) {
      if (ov === undefined) {
        // Adding a constraint = tightening = breaking
        push(out, p, "added", "breaking", undefined, nv);
      } else if (nv === undefined) {
        push(out, p, "removed", "non-breaking", ov, undefined);
      } else {
        push(out, p, "changed", constraintSeverity(key, ov, nv), ov, nv);
      }
      continue;
    }

    if (META_KEYS.has(key)) {
      if (ov === undefined) {
        push(out, p, "added", "non-breaking", undefined, nv);
      } else if (nv === undefined) {
        push(out, p, "removed", "non-breaking", ov, undefined);
      } else {
        push(out, p, "changed", "non-breaking", ov, nv);
      }
      continue;
    }

    // Nested schema keywords (oneOf/anyOf/allOf/$defs/definitions/patternProperties/…)
    // or unknown: recurse if both objects, else value-level change (fail-closed = breaking)
    if (ov === undefined) {
      push(out, p, "added", "breaking", undefined, nv);
    } else if (nv === undefined) {
      push(out, p, "removed", "breaking", ov, undefined);
    } else if (isPlainObject(ov) && isPlainObject(nv)) {
      diffSchemaObject(out, p, ov, nv);
    } else if (
      (key === "oneOf" || key === "anyOf" || key === "allOf") &&
      Array.isArray(ov) &&
      Array.isArray(nv)
    ) {
      // Length/content change — treat whole keyword as changed (breaking if removed branches)
      if (nv.length < ov.length) {
        push(out, p, "changed", "breaking", ov, nv);
      } else if (nv.length > ov.length) {
        push(out, p, "changed", "non-breaking", ov, nv);
      } else {
        // Same length: element-wise
        for (let i = 0; i < ov.length; i++) {
          diffSchemaNode(out, `${p}[${i}]`, ov[i], nv[i]);
        }
      }
    } else {
      push(out, p, "changed", "breaking", ov, nv);
    }
  }
}

function diffPropertiesMap(
  out: FieldChange[],
  path: string,
  oldP: Record<string, unknown>,
  newP: Record<string, unknown>,
): void {
  const keys = new Set([...Object.keys(oldP), ...Object.keys(newP)]);
  for (const key of [...keys].sort(cmpStr)) {
    const p = `${path}.${key}`;
    const ov = oldP[key];
    const nv = newP[key];
    if (deepEqual(ov, nv)) continue;
    if (ov === undefined) {
      // Adding an optional property = non-breaking (required handled separately)
      push(out, p, "added", "non-breaking", undefined, nv);
    } else if (nv === undefined) {
      push(out, p, "removed", "breaking", ov, undefined);
    } else {
      diffSchemaNode(out, p, ov, nv);
    }
  }
}

function diffAdditionalProperties(
  out: FieldChange[],
  path: string,
  oldV: unknown,
  newV: unknown,
): void {
  if (deepEqual(oldV, newV)) return;
  if (oldV === undefined) {
    // Adding additionalProperties: false = breaking; true = non-breaking
    const sev = newV === false ? "breaking" : newV === true ? "non-breaking" : "breaking";
    push(out, path, "added", sev, undefined, newV);
    return;
  }
  if (newV === undefined) {
    const sev = oldV === false ? "non-breaking" : "breaking";
    push(out, path, "removed", sev, oldV, undefined);
    return;
  }
  // true → false = breaking; false → true = non-breaking
  if (oldV === true && newV === false) {
    push(out, path, "changed", "breaking", oldV, newV);
    return;
  }
  if (oldV === false && newV === true) {
    push(out, path, "changed", "non-breaking", oldV, newV);
    return;
  }
  if (isPlainObject(oldV) && isPlainObject(newV)) {
    diffSchemaObject(out, path, oldV, newV);
    return;
  }
  push(out, path, "changed", "breaking", oldV, newV);
}

// --- Descriptor-level diffs (tool / resource / prompt) ---

/** Diff two tool descriptors (name/description/inputSchema). */
export function diffToolDescriptors(
  oldD: { name: string; description: string; inputSchema: Record<string, unknown> },
  newD: { name: string; description: string; inputSchema: Record<string, unknown> },
): FieldChange[] {
  const out: FieldChange[] = [];
  if (oldD.name !== newD.name) {
    push(out, "name", "changed", "breaking", oldD.name, newD.name);
  }
  if (oldD.description !== newD.description) {
    push(out, "description", "changed", "non-breaking", oldD.description, newD.description);
  }
  out.push(...diffJsonSchema(oldD.inputSchema, newD.inputSchema, "inputSchema"));
  out.sort((a, b) => cmpStr(a.path, b.path) || cmpStr(a.kind, b.kind));
  return out;
}

/** Diff two resource descriptors. */
export function diffResourceDescriptors(
  oldD: { uri: string; name: string; description: string; mimeType: string },
  newD: { uri: string; name: string; description: string; mimeType: string },
): FieldChange[] {
  const out: FieldChange[] = [];
  if (oldD.uri !== newD.uri) {
    push(out, "uri", "changed", "breaking", oldD.uri, newD.uri);
  }
  if (oldD.name !== newD.name) {
    push(out, "name", "changed", "breaking", oldD.name, newD.name);
  }
  if (oldD.description !== newD.description) {
    push(out, "description", "changed", "non-breaking", oldD.description, newD.description);
  }
  if (oldD.mimeType !== newD.mimeType) {
    // mimeType change can break clients expecting a type — classify breaking
    push(out, "mimeType", "changed", "breaking", oldD.mimeType, newD.mimeType);
  }
  out.sort((a, b) => cmpStr(a.path, b.path) || cmpStr(a.kind, b.kind));
  return out;
}

/** Diff two prompt descriptors (arguments matched by name). */
export function diffPromptDescriptors(
  oldD: {
    name: string;
    description: string;
    arguments: Array<{ name: string; description: string; required: boolean }>;
  },
  newD: {
    name: string;
    description: string;
    arguments: Array<{ name: string; description: string; required: boolean }>;
  },
): FieldChange[] {
  const out: FieldChange[] = [];
  if (oldD.name !== newD.name) {
    push(out, "name", "changed", "breaking", oldD.name, newD.name);
  }
  if (oldD.description !== newD.description) {
    push(out, "description", "changed", "non-breaking", oldD.description, newD.description);
  }

  const oldMap = new Map(oldD.arguments.map((a) => [a.name, a]));
  const newMap = new Map(newD.arguments.map((a) => [a.name, a]));
  const names = new Set([...oldMap.keys(), ...newMap.keys()]);
  for (const name of [...names].sort(cmpStr)) {
    const o = oldMap.get(name);
    const n = newMap.get(name);
    const base = `arguments[${JSON.stringify(name)}]`;
    if (!o && n) {
      // New argument: required=true → breaking; optional → non-breaking
      push(out, base, "added", n.required ? "breaking" : "non-breaking", undefined, n);
      continue;
    }
    if (o && !n) {
      push(out, base, "removed", "breaking", o, undefined);
      continue;
    }
    if (o && n) {
      if (o.required !== n.required) {
        // false→true breaking; true→false non-breaking
        push(
          out,
          `${base}.required`,
          "changed",
          !o.required && n.required ? "breaking" : "non-breaking",
          o.required,
          n.required,
        );
      }
      if (o.description !== n.description) {
        push(
          out,
          `${base}.description`,
          "changed",
          "non-breaking",
          o.description,
          n.description,
        );
      }
    }
  }

  // Argument order change (same names) — non-breaking informational
  const oldOrder = oldD.arguments.map((a) => a.name).join("\0");
  const newOrder = newD.arguments.map((a) => a.name).join("\0");
  if (
    oldOrder !== newOrder &&
    oldMap.size === newMap.size &&
    [...oldMap.keys()].every((k) => newMap.has(k))
  ) {
    push(
      out,
      "arguments",
      "changed",
      "non-breaking",
      oldD.arguments.map((a) => a.name),
      newD.arguments.map((a) => a.name),
    );
  }

  out.sort((a, b) => cmpStr(a.path, b.path) || cmpStr(a.kind, b.kind));
  return out;
}

/** Format field changes as stable sorted lines for CLI. */
export function formatFieldChanges(changes: FieldChange[], indent = "        "): string[] {
  const lines: string[] = [];
  for (const c of changes) {
    const tag = c.severity === "breaking" ? "BREAKING" : "non-breaking";
    let line = `${indent}${c.kind.toUpperCase().padEnd(7)} ${c.path} (${tag})`;
    if (c.kind === "changed" && c.oldValue !== undefined && c.newValue !== undefined) {
      lines.push(line);
      lines.push(`${indent}        ${c.oldValue} -> ${c.newValue}`);
    } else if (c.kind === "added" && c.newValue !== undefined) {
      lines.push(line);
      lines.push(`${indent}        + ${c.newValue}`);
    } else if (c.kind === "removed" && c.oldValue !== undefined) {
      lines.push(line);
      lines.push(`${indent}        - ${c.oldValue}`);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

