import { computeSurface } from "./lock.js";
import {
  SurfacePinError,
  type DiffResult,
  type Lockfile,
  type LockfileV1,
  type LockfileV2,
  type LockNameEntry,
  type LockUriEntry,
  type SurfaceDiff,
  type SurfaceKind,
} from "./types.js";

const HEX64 = /^[0-9a-f]{64}$/;

function parseNameEntries(
  arr: unknown,
  label: string,
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
    entries.push({ name: e.name, digest: e.digest });
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
    entries.push({ uri: e.uri, digest: e.digest });
  }
  return entries;
}

function parseNameSection(
  raw: unknown,
  label: string,
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
  return { root: o.root, entries: parseNameEntries(o.entries, `${label}.entries`) };
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
    const tools = parseNameEntries(o.tools, "tools");
    const lock: LockfileV1 = {
      version: 1,
      algorithm: "sha256",
      canonicalization: "surfacepin-jcs-v1",
      root: o.root,
      tools,
    };
    return lock;
  }

  if (o.version === 2) {
    const lock: LockfileV2 = {
      version: 2,
      algorithm: "sha256",
      canonicalization: "surfacepin-jcs-v1",
      root: o.root,
    };
    if (o.tools !== undefined) lock.tools = parseNameSection(o.tools, "tools");
    if (o.resources !== undefined) {
      lock.resources = parseUriSection(o.resources, "resources");
    }
    if (o.prompts !== undefined) {
      lock.prompts = parseNameSection(o.prompts, "prompts");
    }
    if (!lock.tools && !lock.resources && !lock.prompts) {
      throw new SurfacePinError(
        "lockfile v2 must include at least one of tools, resources, prompts",
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

function diffNameSection(
  kind: SurfaceKind,
  oldEntries: LockNameEntry[],
  newEntries: LockNameEntry[],
  rootOld: string,
  rootNew: string,
): SurfaceDiff {
  const oldMap = new Map(oldEntries.map((t) => [t.name, t.digest]));
  const newMap = new Map(newEntries.map((t) => [t.name, t.digest]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: SurfaceDiff["changed"] = [];

  for (const name of newMap.keys()) {
    if (!oldMap.has(name)) added.push(name);
  }
  for (const name of oldMap.keys()) {
    if (!newMap.has(name)) removed.push(name);
  }
  for (const [name, newDigest] of newMap) {
    const oldDigest = oldMap.get(name);
    if (oldDigest !== undefined && oldDigest !== newDigest) {
      changed.push({ id: name, oldDigest, newDigest });
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
  rootOld: string,
  rootNew: string,
): SurfaceDiff {
  const oldMap = new Map(oldEntries.map((t) => [t.uri, t.digest]));
  const newMap = new Map(newEntries.map((t) => [t.uri, t.digest]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: SurfaceDiff["changed"] = [];

  for (const uri of newMap.keys()) {
    if (!oldMap.has(uri)) added.push(uri);
  }
  for (const uri of oldMap.keys()) {
    if (!newMap.has(uri)) removed.push(uri);
  }
  for (const [uri, newDigest] of newMap) {
    const oldDigest = oldMap.get(uri);
    if (oldDigest !== undefined && oldDigest !== newDigest) {
      changed.push({ id: uri, oldDigest, newDigest });
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
 */
export function diffSurface(
  doc: unknown,
  lockfile: Lockfile,
  kinds?: readonly SurfaceKind[],
): DiffResult {
  const lockKinds = lockfileKinds(lockfile);
  const selected = kinds ?? lockKinds;

  // Selected kinds must cover exactly the lockfile sections.
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
          lockfile.prompts.root,
          computed.prompts!.root,
        ),
      );
    }
  }

  const match =
    surfaces.every((s) => s.match) && lockfile.root === computed.root;

  // Flattened convenience fields (tools surface if present, else first).
  const primary =
    surfaces.find((s) => s.kind === "tools") ?? surfaces[0] ?? null;
  const added = primary?.added ?? [];
  const removed = primary?.removed ?? [];
  const changed =
    primary?.changed.map((c) => ({
      name: c.id,
      oldDigest: c.oldDigest,
      newDigest: c.newDigest,
    })) ?? [];

  return {
    match,
    surfaces,
    added,
    removed,
    changed,
    rootOld: lockfile.root,
    rootNew: computed.root,
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
