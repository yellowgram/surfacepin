export { canonicalize, canonicalizeToBytes } from "./canonicalize.js";
export { sha256Hex, toolDigest, rootDigest } from "./hash.js";
export { extractTools, normalizeTools } from "./normalize.js";
export { computeSurface, serializeLockfile } from "./lock.js";
export { parseLockfile, diffSurface, formatDiff } from "./verify.js";
export { fetchToolsViaStdio } from "./mcp-stdio.js";
export type { StdioFetchOptions, ToolsListDoc } from "./mcp-stdio.js";
export type {
  ToolSurface,
  ToolDescriptor,
  LockToolEntry,
  LockfileV1,
  DiffResult,
} from "./types.js";
export { SurfacePinError } from "./types.js";
