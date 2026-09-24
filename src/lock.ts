import { rootDigest, toolDigest } from "./hash.js";
import { extractTools, normalizeTools } from "./normalize.js";
import type { LockfileV1, ToolDescriptor } from "./types.js";

export interface ComputedSurface {
  descriptors: ToolDescriptor[];
  tools: Array<{ name: string; digest: string }>;
  root: string;
  lockfile: LockfileV1;
}

/** Compute digests and build a v1 lockfile object from a tools document. */
export function computeSurface(doc: unknown): ComputedSurface {
  const raw = extractTools(doc);
  const descriptors = normalizeTools(raw);
  const tools = descriptors.map((d) => ({
    name: d.name,
    digest: toolDigest(d),
  }));
  const root = rootDigest(tools);
  const lockfile: LockfileV1 = {
    version: 1,
    algorithm: "sha256",
    canonicalization: "surfacepin-jcs-v1",
    root,
    tools,
  };
  return { descriptors, tools, root, lockfile };
}

/** Pretty-print lockfile for disk (2-space indent, trailing newline). */
export function serializeLockfile(lockfile: LockfileV1): string {
  return `${JSON.stringify(lockfile, null, 2)}\n`;
}
