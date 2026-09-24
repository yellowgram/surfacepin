import { computeSurface } from "./lock.js";
import { SurfacePinError, type DiffResult, type LockfileV1 } from "./types.js";

const HEX64 = /^[0-9a-f]{64}$/;

export function parseLockfile(doc: unknown): LockfileV1 {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new SurfacePinError("lockfile must be a JSON object");
  }
  const o = doc as Record<string, unknown>;
  if (o.version !== 1) {
    throw new SurfacePinError(`unsupported lockfile version: ${String(o.version)}`);
  }
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
  if (!Array.isArray(o.tools)) {
    throw new SurfacePinError('lockfile "tools" must be an array');
  }
  const tools: LockfileV1["tools"] = [];
  for (let i = 0; i < o.tools.length; i++) {
    const t = o.tools[i];
    if (t === null || typeof t !== "object" || Array.isArray(t)) {
      throw new SurfacePinError(`lockfile tools[${i}] must be an object`);
    }
    const e = t as Record<string, unknown>;
    if (typeof e.name !== "string" || e.name.length === 0) {
      throw new SurfacePinError(`lockfile tools[${i}].name must be a non-empty string`);
    }
    if (typeof e.digest !== "string" || !HEX64.test(e.digest)) {
      throw new SurfacePinError(
        `lockfile tools[${i}].digest must be 64 lowercase hex chars`,
      );
    }
    tools.push({ name: e.name, digest: e.digest });
  }
  return {
    version: 1,
    algorithm: "sha256",
    canonicalization: "surfacepin-jcs-v1",
    root: o.root,
    tools,
  };
}

/** Compare a tools document against a parsed lockfile. */
export function diffSurface(doc: unknown, lockfile: LockfileV1): DiffResult {
  const computed = computeSurface(doc);
  const oldMap = new Map(lockfile.tools.map((t) => [t.name, t.digest]));
  const newMap = new Map(computed.tools.map((t) => [t.name, t.digest]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: DiffResult["changed"] = [];

  for (const name of newMap.keys()) {
    if (!oldMap.has(name)) added.push(name);
  }
  for (const name of oldMap.keys()) {
    if (!newMap.has(name)) removed.push(name);
  }
  for (const [name, newDigest] of newMap) {
    const oldDigest = oldMap.get(name);
    if (oldDigest !== undefined && oldDigest !== newDigest) {
      changed.push({ name, oldDigest, newDigest });
    }
  }

  added.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  removed.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  changed.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const match =
    added.length === 0 &&
    removed.length === 0 &&
    changed.length === 0 &&
    lockfile.root === computed.root;

  return {
    match,
    added,
    removed,
    changed,
    rootOld: lockfile.root,
    rootNew: computed.root,
  };
}

export function formatDiff(diff: DiffResult): string {
  const lines: string[] = [];
  if (diff.match) {
    lines.push("OK: surface matches lockfile");
    lines.push(`ROOT ${diff.rootNew}`);
    return lines.join("\n");
  }
  lines.push("DRIFT: surface does not match lockfile");
  for (const name of diff.added) {
    lines.push(`ADDED   ${name}`);
  }
  for (const name of diff.removed) {
    lines.push(`REMOVED ${name}`);
  }
  for (const c of diff.changed) {
    lines.push(`CHANGED ${c.name}`);
    lines.push(`        ${c.oldDigest} -> ${c.newDigest}`);
  }
  if (diff.rootOld !== diff.rootNew) {
    lines.push(`ROOT    ${diff.rootOld} -> ${diff.rootNew}`);
  }
  return lines.join("\n");
}
