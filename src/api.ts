/**
 * SDK-shaped library API.
 * pin / verify / diff are the public verbs. CLI and Action are clients of these.
 * Pass/fail is digest equality. No LLM on this path.
 */
import { computeSurface, serializeLockfile } from "./lock.js";
import { fetchSurfacesViaStdio, type StdioFetchOptions } from "./mcp-stdio.js";
import type { SurfaceKind } from "./types.js";
import {
  diffSurface,
  formatDiff,
  formatDiffJson,
  lockfileKinds,
  parseLockfile,
} from "./verify.js";
import type { ComputedSurface } from "./lock.js";
import type { DiffResult, Lockfile } from "./types.js";

export interface PinOptions {
  /** Surface kinds to hash. Default: tools. */
  surfaces?: readonly SurfaceKind[];
}

export interface PinResult {
  lockfile: Lockfile;
  root: string;
  /** Pretty-printed lockfile (2-space indent, trailing newline). */
  text: string;
  computed: ComputedSurface;
}

export interface VerifyOptions {
  /**
   * Surface kinds to check. Default: kinds present in the lockfile.
   * Must match the lockfile exactly when provided (same rule as CLI).
   */
  surfaces?: readonly SurfaceKind[];
}

export interface VerifyResult {
  /** Digest equality. Field-diff never flips this. */
  ok: boolean;
  diff: DiffResult;
}

function kindsOrTools(surfaces?: readonly SurfaceKind[]): SurfaceKind[] {
  return surfaces && surfaces.length > 0 ? [...surfaces] : ["tools"];
}

/** Hash a surface document into a lockfile v3. */
export function pin(doc: unknown, options?: PinOptions): PinResult {
  const computed = computeSurface(doc, kindsOrTools(options?.surfaces));
  return {
    lockfile: computed.lockfile,
    root: computed.root,
    text: serializeLockfile(computed.lockfile),
    computed,
  };
}

/** Compare a surface document to a lockfile. Pass/fail is digest equality. */
export function verify(
  doc: unknown,
  lockfile: unknown,
  options?: VerifyOptions,
): VerifyResult {
  const lock = parseLockfile(lockfile);
  const surfaces = options?.surfaces ?? lockfileKinds(lock);
  const diff = diffSurface(doc, lock, surfaces);
  return { ok: diff.match, diff };
}

/** Same as verify().diff — explanatory field-diff, not a second verdict. */
export function diff(
  doc: unknown,
  lockfile: unknown,
  options?: VerifyOptions,
): DiffResult {
  return verify(doc, lockfile, options).diff;
}

export interface PinStdioOptions extends StdioFetchOptions {}

/** Fetch a live stdio server, then pin. */
export async function pinStdio(opts: PinStdioOptions): Promise<PinResult> {
  const surfaces = kindsOrTools(opts.surfaces);
  const doc = await fetchSurfacesViaStdio({ ...opts, surfaces });
  return pin(doc, { surfaces });
}

export interface VerifyStdioOptions extends StdioFetchOptions {
  lockfile: unknown;
}

/** Fetch a live stdio server, then verify against a lockfile. */
export async function verifyStdio(
  opts: VerifyStdioOptions,
): Promise<VerifyResult> {
  const lock = parseLockfile(opts.lockfile);
  const surfaces = opts.surfaces ?? lockfileKinds(lock);
  const doc = await fetchSurfacesViaStdio({ ...opts, surfaces });
  return verify(doc, lock, { surfaces });
}

export { formatDiff, formatDiffJson };
