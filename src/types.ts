/** Surface kinds SurfacePin can pin. */
export type SurfaceKind = "tools" | "resources" | "prompts";

export const ALL_SURFACE_KINDS: readonly SurfaceKind[] = [
  "tools",
  "resources",
  "prompts",
] as const;

/** MCP Tool fields used by SurfacePin. */
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

/** MCP Resource fields used by SurfacePin (volatile fields ignored). */
export interface ResourceSurface {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/** Normalized descriptor hashed for a single resource. */
export interface ResourceDescriptor {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/** MCP PromptArgument fields used by SurfacePin. */
export interface PromptArgumentSurface {
  name: string;
  description?: string;
  required?: boolean;
}

/** MCP Prompt fields used by SurfacePin. */
export interface PromptSurface {
  name: string;
  description?: string;
  arguments?: PromptArgumentSurface[];
}

/** Normalized prompt argument. */
export interface PromptArgumentDescriptor {
  name: string;
  description: string;
  required: boolean;
}

/** Normalized descriptor hashed for a single prompt. */
export interface PromptDescriptor {
  name: string;
  description: string;
  arguments: PromptArgumentDescriptor[];
}

/** One named entry in a lock section (tools / prompts). */
export interface LockNameEntry {
  name: string;
  digest: string;
}

/** One URI-keyed entry in a resources lock section. */
export interface LockUriEntry {
  uri: string;
  digest: string;
}

/** @deprecated Alias for LockNameEntry — tools entries in v1. */
export type LockToolEntry = LockNameEntry;

/** Lockfile section for tools or prompts (name-keyed). */
export interface LockNameSection {
  root: string;
  entries: LockNameEntry[];
}

/** Lockfile section for resources (uri-keyed). */
export interface LockUriSection {
  root: string;
  entries: LockUriEntry[];
}

/** SurfacePin lockfile v1 — tools only (backward compatible). */
export interface LockfileV1 {
  version: 1;
  algorithm: "sha256";
  canonicalization: "surfacepin-jcs-v1";
  root: string;
  tools: LockNameEntry[];
}

/**
 * SurfacePin lockfile v2 — multi-surface.
 * Only selected surface sections are present.
 */
export interface LockfileV2 {
  version: 2;
  algorithm: "sha256";
  canonicalization: "surfacepin-jcs-v1";
  root: string;
  tools?: LockNameSection;
  resources?: LockUriSection;
  prompts?: LockNameSection;
}

export type Lockfile = LockfileV1 | LockfileV2;

/** Per-surface item-level diff. */
export interface SurfaceDiff {
  kind: SurfaceKind;
  match: boolean;
  added: string[];
  removed: string[];
  changed: Array<{ id: string; oldDigest: string; newDigest: string }>;
  rootOld: string;
  rootNew: string;
}

export interface DiffResult {
  match: boolean;
  /** Present for multi-surface (v2) diffs; tools-only v1 fills `surfaces` with one tools entry. */
  surfaces: SurfaceDiff[];
  /** Flattened convenience (tools / primary surface) — kept for simple callers. */
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
