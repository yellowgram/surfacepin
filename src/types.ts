/** MCP Tool fields used by SurfacePin v1. */
export interface ToolSurface {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Normalized descriptor hashed for a single tool. */
export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** One entry in a v1 lockfile. */
export interface LockToolEntry {
  name: string;
  digest: string;
}

/** SurfacePin lockfile v1. */
export interface LockfileV1 {
  version: 1;
  algorithm: "sha256";
  canonicalization: "surfacepin-jcs-v1";
  root: string;
  tools: LockToolEntry[];
}

export interface DiffResult {
  match: boolean;
  added: string[];
  removed: string[];
  changed: Array<{ name: string; oldDigest: string; newDigest: string }>;
  rootOld: string;
  rootNew: string;
}

export class SurfacePinError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 2) {
    super(message);
    this.name = "SurfacePinError";
    this.exitCode = exitCode;
  }
}
