import {
  instructionsDigest,
  instructionsSectionRoot,
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
  normalizeInstructions,
  normalizePrompts,
  normalizeResources,
  normalizeTools,
  type SurfaceDoc,
} from "./normalize.js";
import { DEFAULT_CANONICALIZATION, SurfacePinError } from "./types.js";
import type {
  Canonicalization,
  InstructionsDescriptor,
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
  instructions?: {
    descriptors: InstructionsDescriptor[];
    entries: LockNameEntry[];
    root: string;
  };
  root: string;
  lockfile: Lockfile;
}

/** Exact hashed tool payload (matches toolDigest input). */
function toolSurfacePayload(d: ToolDescriptor): ToolDescriptor {
  const payload: ToolDescriptor = {
    description: d.description,
    inputSchema: d.inputSchema,
    name: d.name,
  };
  if (d.annotations !== undefined) payload.annotations = d.annotations;
  if (d.outputSchema !== undefined) payload.outputSchema = d.outputSchema;
  if (d.title !== undefined) payload.title = d.title;
  return payload;
}

/** Exact hashed resource payload (matches resourceDigest input). */
function resourceSurfacePayload(d: ResourceDescriptor): ResourceDescriptor {
  const payload: ResourceDescriptor = {
    description: d.description,
    mimeType: d.mimeType,
    name: d.name,
    uri: d.uri,
  };
  if (d.title !== undefined) payload.title = d.title;
  return payload;
}

/** Exact hashed prompt payload (matches promptDigest input). */
function promptSurfacePayload(d: PromptDescriptor): PromptDescriptor {
  const payload: PromptDescriptor = {
    arguments: d.arguments.map((a) => ({
      description: a.description,
      name: a.name,
      required: a.required,
    })),
    description: d.description,
    name: d.name,
  };
  if (d.title !== undefined) payload.title = d.title;
  return payload;
}

/** Compute digests and build a lockfile from a surface document. */
export function computeSurface(
  doc: unknown,
  kinds: readonly SurfaceKind[] = ["tools"],
  canon: Canonicalization = DEFAULT_CANONICALIZATION,
): ComputedSurface {
  if (kinds.length === 0) {
    throw new Error("at least one surface kind is required");
  }
  const extracted = extractSurfaces(doc, kinds);
  return computeFromExtracted(extracted, kinds, canon);
}

export function computeFromExtracted(
  extracted: SurfaceDoc,
  kinds: readonly SurfaceKind[],
  canon: Canonicalization = DEFAULT_CANONICALIZATION,
): ComputedSurface {
  const result: ComputedSurface = {
    kinds: [...kinds],
    root: "",
    lockfile: null as unknown as Lockfile,
  };

  const sectionRoots: Array<{ kind: SurfaceKind; root: string }> = [];

  if (kinds.includes("tools")) {
    const descriptors = normalizeTools(extracted.tools ?? [], canon);
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
    const descriptors = normalizeResources(extracted.resources ?? [], canon);
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
    const descriptors = normalizePrompts(extracted.prompts ?? [], canon);
    const entries: LockNameEntry[] = descriptors.map((d) => ({
      name: d.name,
      digest: promptDigest(d),
      surface: promptSurfacePayload(d),
    }));
    const root = promptsSectionRoot(entries);
    result.prompts = { descriptors, entries, root };
    sectionRoots.push({ kind: "prompts", root });
  }

  if (kinds.includes("instructions")) {
    if (canon !== "surfacepin-jcs-v2") {
      throw new SurfacePinError(
        "the instructions surface needs canonicalization surfacepin-jcs-v2",
      );
    }
    const descriptors = normalizeInstructions(extracted.instructions);
    const entries: LockNameEntry[] = descriptors.map((d) => ({
      name: d.name,
      digest: instructionsDigest(d),
      surface: { name: d.name, text: d.text },
    }));
    const root = instructionsSectionRoot(entries);
    result.instructions = { descriptors, entries, root };
    sectionRoots.push({ kind: "instructions", root });
  }

  // Lockfile v3: section shape matches v2 + embedded `surface` on each entry.
  // Digests / section roots / overall root are identical to v2 for the same content.
  const root = overallRootDigestV2(sectionRoots);
  const lockfile: LockfileV3 = {
    version: 3,
    algorithm: "sha256",
    canonicalization: canon,
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
  if (result.instructions) {
    lockfile.instructions = {
      root: result.instructions.root,
      entries: result.instructions.entries,
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
