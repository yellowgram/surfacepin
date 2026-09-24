export { canonicalize, canonicalizeToBytes } from "./canonicalize.js";
export {
  sha256Hex,
  toolDigest,
  resourceDigest,
  promptDigest,
  rootDigest,
  resourcesSectionRoot,
  promptsSectionRoot,
  overallRootDigestV2,
  sectionRootDigest,
} from "./hash.js";
export {
  extractTools,
  extractSurfaces,
  normalizeTools,
  normalizeResources,
  normalizePrompts,
} from "./normalize.js";
export type { SurfaceDoc } from "./normalize.js";
export { computeSurface, computeFromExtracted, serializeLockfile } from "./lock.js";
export {
  parseLockfile,
  lockfileKinds,
  diffSurface,
  formatDiff,
  formatDiffJson,
} from "./verify.js";
export {
  diffJsonSchema,
  diffToolDescriptors,
  diffResourceDescriptors,
  diffPromptDescriptors,
  formatFieldChanges,
  compactJson,
} from "./schema-diff.js";
export type {
  FieldChange,
  ChangeSeverity,
  ChangeKind,
  DiffTaxonomyKind,
} from "./schema-diff.js";
export { normalizeKinds } from "./schema-diff.js";
export { fetchToolsViaStdio, fetchSurfacesViaStdio } from "./mcp-stdio.js";
export type { StdioFetchOptions, ToolsListDoc } from "./mcp-stdio.js";
export type {
  SurfaceKind,
  ToolSurface,
  ToolDescriptor,
  ResourceSurface,
  ResourceDescriptor,
  PromptSurface,
  PromptDescriptor,
  PromptArgumentSurface,
  PromptArgumentDescriptor,
  LockToolEntry,
  LockNameEntry,
  LockUriEntry,
  LockNameSection,
  LockUriSection,
  LockfileV1,
  LockfileV2,
  LockfileV3,
  Lockfile,
  DiffResult,
  SurfaceDiff,
} from "./types.js";
export { SurfacePinError, ALL_SURFACE_KINDS } from "./types.js";
