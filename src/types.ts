import type { FieldChange } from "./schema-diff.js";

/**
 * Surface kinds SurfacePin can pin. `instructions` is the server's
 * initialize.instructions text (1.6.0+, jcs-v2 locks only).
 */
export type SurfaceKind = "tools" | "resources" | "prompts" | "instructions";

export const ALL_SURFACE_KINDS: readonly SurfaceKind[] = [
  "tools",
  "resources",
  "prompts",
  "instructions",
] as const;

/** Normalized initialize.instructions (one entry, present only when non-empty). */
export interface InstructionsDescriptor {
  name: "instructions";
  text: string;
}

/**
 * Canonicalization profile recorded in the lockfile.
 * - surfacepin-jcs-v1: title ignored everywhere (locks written by <= 1.5).
 * - surfacepin-jcs-v2: v1 plus tool/resource/prompt `title` and tool
 *   `annotations.title`. Default for new locks since 1.6.0.
 */
export type Canonicalization = "surfacepin-jcs-v1" | "surfacepin-jcs-v2";

export const DEFAULT_CANONICALIZATION: Canonicalization = "surfacepin-jcs-v2";

/** MCP Tool fields used by SurfacePin (icons/_meta ignored; title hashed under jcs-v2). */
export interface ToolSurface {
  name: string;
  title?: unknown;
  description?: string;
  inputSchema?: Record<string, unknown>;
  /** Client hints; title dropped; absent/non-object omitted from hash. */
  annotations?: unknown;
  /** Structured output contract; absent/null omitted; {} kept; non-object → error. */
  outputSchema?: unknown;
}

/** Normalized descriptor hashed for a single tool. */
export interface ToolDescriptor {
  name: string;
  /** jcs-v2 only: present when the tool has a string title. */
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Present only when tool.annotations is an object with keys after dropping title. */
  annotations?: Record<string, unknown>;
  /** Present only when tool.outputSchema is a (possibly empty) object. */
  outputSchema?: Record<string, unknown>;
}

/** MCP Resource fields used by SurfacePin (volatile fields ignored). */
export interface ResourceSurface {
  uri: string;
  name: string;
  title?: unknown;
  description?: string;
  mimeType?: string;
}

/** Normalized descriptor hashed for a single resource. */
export interface ResourceDescriptor {
  uri: string;
  name: string;
  /** jcs-v2 only. */
  title?: string;
  description: string;
  mimeType: string;
}

/** MCP PromptArgument fields used by SurfacePin. */
export interface PromptArgumentSurface {
  name: string;
  title?: unknown;
  description?: string;
  required?: boolean;
}

/** MCP Prompt fields used by SurfacePin. */
export interface PromptSurface {
  name: string;
  title?: unknown;
  description?: string;
  arguments?: PromptArgumentSurface[];
}

/** Normalized prompt argument. */
export interface PromptArgumentDescriptor {
  name: string;
  /** jcs-v2 only. Clients show it in the argument form in place of `name`. */
  title?: string;
  description: string;
  required: boolean;
}

/** Normalized descriptor hashed for a single prompt. */
export interface PromptDescriptor {
  name: string;
  /** jcs-v2 only. */
  title?: string;
  description: string;
  arguments: PromptArgumentDescriptor[];
}

/** One named entry in a lock section (tools / prompts). */
export interface LockNameEntry {
  name: string;
  digest: string;
  /**
   * Exact hashed descriptor payload (lockfile v3+).
   * Tools: ToolDescriptor; prompts: PromptDescriptor; instructions: InstructionsDescriptor.
   */
  surface?: ToolDescriptor | PromptDescriptor | InstructionsDescriptor;
}

/** One URI-keyed entry in a resources lock section. */
export interface LockUriEntry {
  uri: string;
  digest: string;
  /** Exact hashed descriptor payload (lockfile v3+). */
  surface?: ResourceDescriptor;
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
 * SurfacePin lockfile v2 — multi-surface (digests only).
 * Only selected surface sections are present.
 */
export interface LockfileV2 {
  version: 2;
  algorithm: "sha256";
  canonicalization: Canonicalization;
  root: string;
  tools?: LockNameSection;
  resources?: LockUriSection;
  prompts?: LockNameSection;
}

/**
 * SurfacePin lockfile v3 — multi-surface + embedded hashed payloads.
 * Same section/root digests as v2; each entry includes `surface` (exact
 * object that was hashed) so `diff` can emit structured field changes offline.
 */
export interface LockfileV3 {
  version: 3;
  algorithm: "sha256";
  canonicalization: Canonicalization;
  root: string;
  tools?: LockNameSection;
  resources?: LockUriSection;
  prompts?: LockNameSection;
  /** jcs-v2 only. */
  instructions?: LockNameSection;
}

export type Lockfile = LockfileV1 | LockfileV2 | LockfileV3;

/** Per-surface item-level diff. */
export interface SurfaceDiff {
  kind: SurfaceKind;
  match: boolean;
  added: string[];
  removed: string[];
  changed: Array<{
    id: string;
    oldDigest: string;
    newDigest: string;
    /** Structured field changes when lockfile embeds surfaces (v3). */
    fields?: FieldChange[];
  }>;
  rootOld: string;
  rootNew: string;
}

export interface DiffResult {
  match: boolean;
  /** Present for multi-surface (v2/v3) diffs; tools-only v1 fills `surfaces` with one tools entry. */
  surfaces: SurfaceDiff[];
  /** Flattened convenience (tools / primary surface) — kept for simple callers. */
  added: string[];
  removed: string[];
  changed: Array<{
    name: string;
    oldDigest: string;
    newDigest: string;
    fields?: FieldChange[];
  }>;
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
