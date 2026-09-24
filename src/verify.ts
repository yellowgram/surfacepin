import { computeSurface } from "./lock.js";
import {
  diffPromptDescriptors,
  diffResourceDescriptors,
  diffToolDescriptors,
  formatFieldChanges,
  type FieldChange,
} from "./schema-diff.js";
import {
  SurfacePinError,
  type DiffResult,
  type Lockfile,
  type LockfileV1,
  type LockfileV2,
  type LockfileV3,
  type LockNameEntry,
  type LockUriEntry,
  type PromptDescriptor,
  type ResourceDescriptor,
  type SurfaceDiff,
  type SurfaceKind,
  type ToolDescriptor,
} from "./types.js";

const HEX64 = /^[0-9a-f]{64}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseToolSurface(raw: unknown, label: string): ToolDescriptor | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    throw new SurfacePinError(`${label}.surface must be an object when present`);
  }
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    throw new SurfacePinError(`${label}.surface.name must be a non-empty string`);
  }
  if (typeof raw.description !== "string") {
    throw new SurfacePinError(`${label}.surface.description must be a string`);
  }
  if (!isPlainObject(raw.inputSchema)) {
    throw new SurfacePinError(`${label}.surface.inputSchema must be an object`);
  }
  return {
    name: raw.name,
    description: raw.description,
    inputSchema: raw.inputSchema as Record<string, unknown>,
  };
}

function parseResourceSurface(
  raw: unknown,
  label: string,
): ResourceDescriptor | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    throw new SurfacePinError(`${label}.surface must be an object when present`);
  }
  if (typeof raw.uri !== "string" || raw.uri.length === 0) {
    throw new SurfacePinError(`${label}.surface.uri must be a non-empty string`);
  }
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    throw new SurfacePinError(`${label}.surface.name must be a non-empty string`);
  }
  if (typeof raw.description !== "string") {
    throw new SurfacePinError(`${label}.surface.description must be a string`);
  }
  if (typeof raw.mimeType !== "string") {
    throw new SurfacePinError(`${label}.surface.mimeType must be a string`);
  }
  return {
    uri: raw.uri,
    name: raw.name,
    description: raw.description,
    mimeType: raw.mimeType,
  };
}

function parsePromptSurface(
  raw: unknown,
  label: string,
): PromptDescriptor | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    throw new SurfacePinError(`${label}.surface must be an object when present`);
  }
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    throw new SurfacePinError(`${label}.surface.name must be a non-empty string`);
  }
  if (typeof raw.description !== "string") {
    throw new SurfacePinError(`${label}.surface.description must be a string`);
  }
  if (!Array.isArray(raw.arguments)) {
    throw new SurfacePinError(`${label}.surface.arguments must be an array`);
  }
  const args: PromptDescriptor["arguments"] = [];
  for (let i = 0; i < raw.arguments.length; i++) {
    const a = raw.arguments[i];
    if (!isPlainObject(a)) {
      throw new SurfacePinError(
        `${label}.surface.arguments[${i}] must be an object`,
      );
    }
    if (typeof a.name !== "string" || a.name.length === 0) {
      throw new SurfacePinError(
        `${label}.surface.arguments[${i}].name must be a non-empty string`,
      );
    }
    if (typeof a.description !== "string") {
      throw new SurfacePinError(
        `${label}.surface.arguments[${i}].description must be a string`,
      );
    }
    if (typeof a.required !== "boolean") {
      throw new SurfacePinError(
        `${label}.surface.arguments[${i}].required must be a boolean`,
      );
    }
    args.push({
      name: a.name,
      description: a.description,
      required: a.required,
    });
  }
  return { name: raw.name, description: raw.description, arguments: args };
}

function parseNameEntries(
  arr: unknown,
  label: string,
  kind: "tools" | "prompts",
): LockNameEntry[] {
  if (!Array.isArray(arr)) {
    throw new SurfacePinError(`lockfile "${label}" must be an array`);
  }
  const entries: LockNameEntry[] = [];
  for (let i = 0; i < arr.length; i++) {
    const t = arr[i];
    if (t === null || typeof t !== "object" || Array.isArray(t)) {
      throw new SurfacePinError(`lockfile ${label}[${i}] must be an object`);
    }
    const e = t as Record<string, unknown>;
    if (typeof e.name !== "string" || e.name.length === 0) {
      throw new SurfacePinError(
        `lockfile ${label}[${i}].name must be a non-empty string`,
      );
    }
    if (typeof e.digest !== "string" || !HEX64.test(e.digest)) {
      throw new SurfacePinError(
        `lockfile ${label}[${i}].digest must be 64 lowercase hex chars`,
      );
    }
    const entry: LockNameEntry = { name: e.name, digest: e.digest };
    if (e.surface !== undefined) {
      entry.surface =
        kind === "tools"
          ? parseToolSurface(e.surface, `${label}[${i}]`)
          : parsePromptSurface(e.surface, `${label}[${i}]`);
    }
    entries.push(entry);
  }
  return entries;
}

function parseUriEntries(arr: unknown, label: string): LockUriEntry[] {
  if (!Array.isArray(arr)) {
    throw new SurfacePinError(`lockfile "${label}" must be an array`);
  }
  const entries: LockUriEntry[] = [];
  for (let i = 0; i < arr.length; i++) {
    const t = arr[i];
    if (t === null || typeof t !== "object" || Array.isArray(t)) {
      throw new SurfacePinError(`lockfile ${label}[${i}] must be an object`);
    }
    const e = t as Record<string, unknown>;
    if (typeof e.uri !== "string" || e.uri.length === 0) {
      throw new SurfacePinError(
        `lockfile ${label}[${i}].uri must be a non-empty string`,
      );
    }
    if (typeof e.digest !== "string" || !HEX64.test(e.digest)) {
      throw new SurfacePinError(
        `lockfile ${label}[${i}].digest must be 64 lowercase hex chars`,
      );
    }
    const entry: LockUriEntry = { uri: e.uri, digest: e.digest };
    if (e.surface !== undefined) {
      entry.surface = parseResourceSurface(e.surface, `${label}[${i}]`);
    }
    entries.push(entry);
  }
  return entries;
}

function parseNameSection(
  raw: unknown,
  label: string,
  kind: "tools" | "prompts",
): { root: string; entries: LockNameEntry[] } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SurfacePinError(`lockfile "${label}" must be an object`);
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.root !== "string" || !HEX64.test(o.root)) {
    throw new SurfacePinError(
      `lockfile "${label}.root" must be 64 lowercase hex chars`,
    );
  }
  return {
    root: o.root,
    entries: parseNameEntries(o.entries, `${label}.entries`, kind),
  };
}

function parseUriSection(
  raw: unknown,
  label: string,
): { root: string; entries: LockUriEntry[] } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SurfacePinError(`lockfile "${label}" must be an object`);
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.root !== "string" || !HEX64.test(o.root)) {
    throw new SurfacePinError(
      `lockfile "${label}.root" must be 64 lowercase hex chars`,
    );
  }
  return { root: o.root, entries: parseUriEntries(o.entries, `${label}.entries`) };
}

export function parseLockfile(doc: unknown): Lockfile {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new SurfacePinError("lockfile must be a JSON object");
  }
  const o = doc as Record<string, unknown>;
  if (o.algorithm !== "sha256") {
    throw new SurfacePinError(`unsupported algorithm: ${String(o.algorithm)}`);
  }
  if (o.canonicalization !== "surfacepin-jcs-v1") {
    throw new SurfacePinError(
      `unsupported canonicalization: ${String(o.canonicalization)}`,
    );
  }
  if (typeof o.root !== "string" || !HEX64.test(o.root)) {
    throw new SurfacePinError('lockfile "root" must be 64 lowercase hex chars');
  }

  if (o.version === 1) {
    const tools = parseNameEntries(o.tools, "tools", "tools");
    const lock: LockfileV1 = {
      version: 1,
      algorithm: "sha256",
      canonicalization: "surfacepin-jcs-v1",
      root: o.root,
      tools,
    };
    return lock;
  }

  if (o.version === 2 || o.version === 3) {
    const lock: LockfileV2 | LockfileV3 = {
      version: o.version,
      algorithm: "sha256",
      canonicalization: "surfacepin-jcs-v1",
      root: o.root,
    };
    if (o.tools !== undefined) {
      lock.tools = parseNameSection(o.tools, "tools", "tools");
    }
    if (o.resources !== undefined) {
      lock.resources = parseUriSection(o.resources, "resources");
    }
    if (o.prompts !== undefined) {
      lock.prompts = parseNameSection(o.prompts, "prompts", "prompts");
    }
    if (!lock.tools && !lock.resources && !lock.prompts) {
      throw new SurfacePinError(
        `lockfile v${o.version} must include at least one of tools, resources, prompts`,
      );
    }
    return lock;
  }

  throw new SurfacePinError(`unsupported lockfile version: ${String(o.version)}`);
}

/** Surface kinds present in a lockfile. */
export function lockfileKinds(lockfile: Lockfile): SurfaceKind[] {
  if (lockfile.version === 1) return ["tools"];
  const kinds: SurfaceKind[] = [];
  if (lockfile.tools) kinds.push("tools");
  if (lockfile.resources) kinds.push("resources");
  if (lockfile.prompts) kinds.push("prompts");
  return kinds;
}

function fieldsForToolChange(
  oldEntry: LockNameEntry,
  newDesc: ToolDescriptor | undefined,
): FieldChange[] | undefined {
  if (!oldEntry.surface || !newDesc) return undefined;
  const old = oldEntry.surface as ToolDescriptor;
  if (!("inputSchema" in old)) return undefined;
  return diffToolDescriptors(old, newDesc);
}

function fieldsForPromptChange(
  oldEntry: LockNameEntry,
  newDesc: PromptDescriptor | undefined,
): FieldChange[] | undefined {
  if (!oldEntry.surface || !newDesc) return undefined;
  const old = oldEntry.surface as PromptDescriptor;
  if (!("arguments" in old)) return undefined;
  return diffPromptDescriptors(old, newDesc);
}

function fieldsForResourceChange(
  oldEntry: LockUriEntry,
  newDesc: ResourceDescriptor | undefined,
): FieldChange[] | undefined {
  if (!oldEntry.surface || !newDesc) return undefined;
  return diffResourceDescriptors(oldEntry.surface, newDesc);
}

function diffNameSection(
  kind: "tools" | "prompts",
  oldEntries: LockNameEntry[],
  newEntries: LockNameEntry[],
  newDescriptors: Array<ToolDescriptor | PromptDescriptor> | undefined,
  rootOld: string,
  rootNew: string,
): SurfaceDiff {
  const oldMap = new Map(oldEntries.map((t) => [t.name, t]));
  const newMap = new Map(newEntries.map((t) => [t.name, t]));
  const descMap = new Map(
    (newDescriptors ?? []).map((d) => [d.name, d] as const),
  );
  const added: string[] = [];
  const removed: string[] = [];
  const changed: SurfaceDiff["changed"] = [];

  for (const name of newMap.keys()) {
    if (!oldMap.has(name)) added.push(name);
  }
  for (const name of oldMap.keys()) {
    if (!newMap.has(name)) removed.push(name);
  }
  for (const [name, newEntry] of newMap) {
    const oldEntry = oldMap.get(name);
    if (oldEntry !== undefined && oldEntry.digest !== newEntry.digest) {
      const desc = descMap.get(name);
      const fields =
        kind === "tools"
          ? fieldsForToolChange(oldEntry, desc as ToolDescriptor | undefined)
          : fieldsForPromptChange(oldEntry, desc as PromptDescriptor | undefined);
      const row: SurfaceDiff["changed"][number] = {
        id: name,
        oldDigest: oldEntry.digest,
        newDigest: newEntry.digest,
      };
      if (fields && fields.length > 0) row.fields = fields;
      changed.push(row);
    }
  }
  added.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  removed.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  changed.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const match =
    added.length === 0 &&
    removed.length === 0 &&
    changed.length === 0 &&
    rootOld === rootNew;

  return { kind, match, added, removed, changed, rootOld, rootNew };
}

function diffUriSection(
  kind: SurfaceKind,
  oldEntries: LockUriEntry[],
  newEntries: LockUriEntry[],
  newDescriptors: ResourceDescriptor[] | undefined,
  rootOld: string,
  rootNew: string,
): SurfaceDiff {
  const oldMap = new Map(oldEntries.map((t) => [t.uri, t]));
  const newMap = new Map(newEntries.map((t) => [t.uri, t]));
  const descMap = new Map((newDescriptors ?? []).map((d) => [d.uri, d]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: SurfaceDiff["changed"] = [];

  for (const uri of newMap.keys()) {
    if (!oldMap.has(uri)) added.push(uri);
  }
  for (const uri of oldMap.keys()) {
    if (!newMap.has(uri)) removed.push(uri);
  }
  for (const [uri, newEntry] of newMap) {
    const oldEntry = oldMap.get(uri);
    if (oldEntry !== undefined && oldEntry.digest !== newEntry.digest) {
      const fields = fieldsForResourceChange(oldEntry, descMap.get(uri));
      const row: SurfaceDiff["changed"][number] = {
        id: uri,
        oldDigest: oldEntry.digest,
        newDigest: newEntry.digest,
      };
      if (fields && fields.length > 0) row.fields = fields;
      changed.push(row);
    }
  }
  added.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  removed.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  changed.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const match =
    added.length === 0 &&
    removed.length === 0 &&
    changed.length === 0 &&
    rootOld === rootNew;

  return { kind, match, added, removed, changed, rootOld, rootNew };
}

/**
 * Compare a surface document against a parsed lockfile.
 * `kinds` defaults to the kinds present in the lockfile.
 * Pass/fail remains digest equality. Structured field diffs are explanatory.
 */
export function diffSurface(
  doc: unknown,
  lockfile: Lockfile,
  kinds?: readonly SurfaceKind[],
): DiffResult {
  const lockKinds = lockfileKinds(lockfile);
  const selected = kinds ?? lockKinds;

  const selSet = new Set(selected);
  const lockSet = new Set(lockKinds);
  if (
    selected.length !== lockKinds.length ||
    lockKinds.some((k) => !selSet.has(k)) ||
    selected.some((k) => !lockSet.has(k))
  ) {
    throw new SurfacePinError(
      `surface selection [${selected.join(",")}] does not match lockfile surfaces [${lockKinds.join(",")}]`,
    );
  }

  const computed = computeSurface(doc, selected);
  const surfaces: SurfaceDiff[] = [];

  if (lockfile.version === 1) {
    surfaces.push(
      diffNameSection(
        "tools",
        lockfile.tools,
        computed.tools!.entries,
        computed.tools!.descriptors,
        lockfile.root,
        computed.tools!.root,
      ),
    );
  } else {
    if (lockfile.tools) {
      surfaces.push(
        diffNameSection(
          "tools",
          lockfile.tools.entries,
          computed.tools!.entries,
          computed.tools!.descriptors,
          lockfile.tools.root,
          computed.tools!.root,
        ),
      );
    }
    if (lockfile.resources) {
      surfaces.push(
        diffUriSection(
          "resources",
          lockfile.resources.entries,
          computed.resources!.entries,
          computed.resources!.descriptors,
          lockfile.resources.root,
          computed.resources!.root,
        ),
      );
    }
    if (lockfile.prompts) {
      surfaces.push(
        diffNameSection(
          "prompts",
          lockfile.prompts.entries,
          computed.prompts!.entries,
          computed.prompts!.descriptors,
          lockfile.prompts.root,
          computed.prompts!.root,
        ),
      );
    }
  }

  // Root comparison: v1 root is tools section root; v2/v3 use overall root.
  const computedOverallRoot =
    lockfile.version === 1 ? computed.tools!.root : computed.root;

  const match =
    surfaces.every((s) => s.match) && lockfile.root === computedOverallRoot;

  const primary =
    surfaces.find((s) => s.kind === "tools") ?? surfaces[0] ?? null;
  const added = primary?.added ?? [];
  const removed = primary?.removed ?? [];
  const changed =
    primary?.changed.map((c) => ({
      name: c.id,
      oldDigest: c.oldDigest,
      newDigest: c.newDigest,
      ...(c.fields ? { fields: c.fields } : {}),
    })) ?? [];

  return {
    match,
    surfaces,
    added,
    removed,
    changed,
    rootOld: lockfile.root,
    rootNew: computedOverallRoot,
  };
}

export function formatDiff(diff: DiffResult): string {
  const lines: string[] = [];
  const multi = diff.surfaces.length > 1;

  if (diff.match) {
    lines.push("OK: surface matches lockfile");
    if (multi) {
      for (const s of diff.surfaces) {
        lines.push(`[${s.kind}] ROOT ${s.rootNew}`);
      }
    }
    lines.push(`ROOT ${diff.rootNew}`);
    return lines.join("\n");
  }

  lines.push("DRIFT: surface does not match lockfile");
  for (const s of diff.surfaces) {
    if (s.match && !multi) continue;
    if (multi || diff.surfaces.length > 1) {
      lines.push(`[${s.kind}]${s.match ? " ok" : ""}`);
    }
    if (s.match) continue;
    for (const name of s.added) {
      lines.push(`ADDED   ${name}`);
    }
    for (const name of s.removed) {
      lines.push(`REMOVED ${name}`);
    }
    for (const c of s.changed) {
      lines.push(`CHANGED ${c.id}`);
      lines.push(`        ${c.oldDigest} -> ${c.newDigest}`);
      if (c.fields && c.fields.length > 0) {
        lines.push(...formatFieldChanges(c.fields, "        "));
      }
    }
    if (s.rootOld !== s.rootNew) {
      lines.push(`SECTION ${s.rootOld} -> ${s.rootNew}`);
    }
  }
  if (diff.rootOld !== diff.rootNew) {
    lines.push(`ROOT    ${diff.rootOld} -> ${diff.rootNew}`);
  }
  return lines.join("\n");
}

/** Machine-readable JSON for `surfacepin diff --json`. */
export function formatDiffJson(diff: DiffResult): string {
  return `${JSON.stringify(diff, null, 2)}\n`;
}
