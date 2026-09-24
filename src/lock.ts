import {
  overallRootDigestV2,
  promptDigest,
  promptsSectionRoot,
  resourceDigest,
  resourcesSectionRoot,
  rootDigest,
  toolDigest,
} from "./hash.js";
import {
  extractSurfaces,
  normalizePrompts,
  normalizeResources,
  normalizeTools,
  type SurfaceDoc,
} from "./normalize.js";
import type {
  Lockfile,
  LockfileV1,
  LockfileV2,
  LockNameEntry,
  LockUriEntry,
  PromptDescriptor,
  ResourceDescriptor,
  SurfaceKind,
  ToolDescriptor,
} from "./types.js";

export interface ComputedSurface {
  kinds: SurfaceKind[];
  tools?: {
    descriptors: ToolDescriptor[];
    entries: LockNameEntry[];
    root: string;
  };
  resources?: {
    descriptors: ResourceDescriptor[];
    entries: LockUriEntry[];
    root: string;
  };
  prompts?: {
    descriptors: PromptDescriptor[];
    entries: LockNameEntry[];
    root: string;
  };
  root: string;
  lockfile: Lockfile;
}

function isToolsOnly(kinds: readonly SurfaceKind[]): boolean {
  return kinds.length === 1 && kinds[0] === "tools";
}

/** Compute digests and build a lockfile from a surface document. */
export function computeSurface(
  doc: unknown,
  kinds: readonly SurfaceKind[] = ["tools"],
): ComputedSurface {
  if (kinds.length === 0) {
    throw new Error("at least one surface kind is required");
  }
  const extracted = extractSurfaces(doc, kinds);
  return computeFromExtracted(extracted, kinds);
}

export function computeFromExtracted(
  extracted: SurfaceDoc,
  kinds: readonly SurfaceKind[],
): ComputedSurface {
  const result: ComputedSurface = {
    kinds: [...kinds],
    root: "",
    lockfile: null as unknown as Lockfile,
  };

  const sectionRoots: Array<{ kind: SurfaceKind; root: string }> = [];

  if (kinds.includes("tools")) {
    const descriptors = normalizeTools(extracted.tools ?? []);
    const entries = descriptors.map((d) => ({
      name: d.name,
      digest: toolDigest(d),
    }));
    const root = rootDigest(entries);
    result.tools = { descriptors, entries, root };
    sectionRoots.push({ kind: "tools", root });
  }

  if (kinds.includes("resources")) {
    const descriptors = normalizeResources(extracted.resources ?? []);
    const entries = descriptors.map((d) => ({
      uri: d.uri,
      digest: resourceDigest(d),
    }));
    const root = resourcesSectionRoot(entries);
    result.resources = { descriptors, entries, root };
    sectionRoots.push({ kind: "resources", root });
  }

  if (kinds.includes("prompts")) {
    const descriptors = normalizePrompts(extracted.prompts ?? []);
    const entries = descriptors.map((d) => ({
      name: d.name,
      digest: promptDigest(d),
    }));
    const root = promptsSectionRoot(entries);
    result.prompts = { descriptors, entries, root };
    sectionRoots.push({ kind: "prompts", root });
  }

  if (isToolsOnly(kinds)) {
    // Backward-compatible lockfile v1.
    const tools = result.tools!;
    const lockfile: LockfileV1 = {
      version: 1,
      algorithm: "sha256",
      canonicalization: "surfacepin-jcs-v1",
      root: tools.root,
      tools: tools.entries,
    };
    result.root = tools.root;
    result.lockfile = lockfile;
    return result;
  }

  const root = overallRootDigestV2(sectionRoots);
  const lockfile: LockfileV2 = {
    version: 2,
    algorithm: "sha256",
    canonicalization: "surfacepin-jcs-v1",
    root,
  };
  if (result.tools) {
    lockfile.tools = { root: result.tools.root, entries: result.tools.entries };
  }
  if (result.resources) {
    lockfile.resources = {
      root: result.resources.root,
      entries: result.resources.entries,
    };
  }
  if (result.prompts) {
    lockfile.prompts = {
      root: result.prompts.root,
      entries: result.prompts.entries,
    };
  }
  result.root = root;
  result.lockfile = lockfile;
  return result;
}

/** Pretty-print lockfile for disk (2-space indent, trailing newline). */
export function serializeLockfile(lockfile: Lockfile): string {
  return `${JSON.stringify(lockfile, null, 2)}\n`;
}
