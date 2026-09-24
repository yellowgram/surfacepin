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
  LockfileV3,
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

/** Exact hashed tool payload (matches toolDigest input). */
function toolSurfacePayload(d: ToolDescriptor): ToolDescriptor {
  return {
    description: d.description,
    inputSchema: d.inputSchema,
    name: d.name,
  };
}

/** Exact hashed resource payload (matches resourceDigest input). */
function resourceSurfacePayload(d: ResourceDescriptor): ResourceDescriptor {
  return {
    description: d.description,
    mimeType: d.mimeType,
    name: d.name,
    uri: d.uri,
  };
}

/** Exact hashed prompt payload (matches promptDigest input). */
function promptSurfacePayload(d: PromptDescriptor): PromptDescriptor {
  return {
    arguments: d.arguments.map((a) => ({
      description: a.description,
      name: a.name,
      required: a.required,
    })),
    description: d.description,
    name: d.name,
  };
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
    const entries: LockNameEntry[] = descriptors.map((d) => ({
      name: d.name,
      digest: toolDigest(d),
      surface: toolSurfacePayload(d),
    }));
    const root = rootDigest(entries);
    result.tools = { descriptors, entries, root };
    sectionRoots.push({ kind: "tools", root });
  }

  if (kinds.includes("resources")) {
    const descriptors = normalizeResources(extracted.resources ?? []);
    const entries: LockUriEntry[] = descriptors.map((d) => ({
      uri: d.uri,
      digest: resourceDigest(d),
      surface: resourceSurfacePayload(d),
    }));
    const root = resourcesSectionRoot(entries);
    result.resources = { descriptors, entries, root };
    sectionRoots.push({ kind: "resources", root });
  }

  if (kinds.includes("prompts")) {
    const descriptors = normalizePrompts(extracted.prompts ?? []);
    const entries: LockNameEntry[] = descriptors.map((d) => ({
      name: d.name,
      digest: promptDigest(d),
      surface: promptSurfacePayload(d),
    }));
    const root = promptsSectionRoot(entries);
    result.prompts = { descriptors, entries, root };
    sectionRoots.push({ kind: "prompts", root });
  }

  // Lockfile v3: section shape matches v2 + embedded `surface` on each entry.
  // Digests / section roots / overall root are identical to v2 for the same content.
  const root = overallRootDigestV2(sectionRoots);
  const lockfile: LockfileV3 = {
    version: 3,
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
