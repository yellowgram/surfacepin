import { createHash } from "node:crypto";
import { canonicalizeToBytes } from "./canonicalize.js";
import type {
  PromptDescriptor,
  ResourceDescriptor,
  SurfaceKind,
  ToolDescriptor,
} from "./types.js";

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Per-tool digest over the surface descriptor object. */
export function toolDigest(descriptor: ToolDescriptor): string {
  const payload = {
    description: descriptor.description,
    inputSchema: descriptor.inputSchema,
    name: descriptor.name,
  };
  return sha256Hex(canonicalizeToBytes(payload));
}

/** Per-resource digest: uri, name, description, mimeType. */
export function resourceDigest(descriptor: ResourceDescriptor): string {
  const payload = {
    description: descriptor.description,
    mimeType: descriptor.mimeType,
    name: descriptor.name,
    uri: descriptor.uri,
  };
  return sha256Hex(canonicalizeToBytes(payload));
}

/** Per-prompt digest: name, description, arguments (order preserved). */
export function promptDigest(descriptor: PromptDescriptor): string {
  const payload = {
    arguments: descriptor.arguments.map((a) => ({
      description: a.description,
      name: a.name,
      required: a.required,
    })),
    description: descriptor.description,
    name: descriptor.name,
  };
  return sha256Hex(canonicalizeToBytes(payload));
}

/**
 * Tools section / v1 root digest:
 *   "surfacepin-v1\n" + for each tool (name-sorted): name + "\n" + digest + "\n"
 */
export function rootDigest(
  tools: Array<{ name: string; digest: string }>,
): string {
  return sectionRootDigest("surfacepin-v1", tools.map((t) => [t.name, t.digest]));
}

/**
 * Generic section root over id-sorted (id, digest) pairs with a fixed prefix line.
 */
export function sectionRootDigest(
  prefix: string,
  entries: Array<[string, string]>,
): string {
  const sorted = [...entries].sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  );
  let payload = `${prefix}\n`;
  for (const [id, digest] of sorted) {
    payload += `${id}\n${digest}\n`;
  }
  return sha256Hex(payload);
}

export function resourcesSectionRoot(
  entries: Array<{ uri: string; digest: string }>,
): string {
  return sectionRootDigest(
    "surfacepin-resources-v1",
    entries.map((e) => [e.uri, e.digest]),
  );
}

export function promptsSectionRoot(
  entries: Array<{ name: string; digest: string }>,
): string {
  return sectionRootDigest(
    "surfacepin-prompts-v1",
    entries.map((e) => [e.name, e.digest]),
  );
}

/**
 * Overall v2 root:
 *   "surfacepin-v2\n" + for each selected kind in [tools, resources, prompts]:
 *     kind + "\n" + sectionRoot + "\n"
 */
export function overallRootDigestV2(
  sections: Array<{ kind: SurfaceKind; root: string }>,
): string {
  const order: SurfaceKind[] = ["tools", "resources", "prompts"];
  const map = new Map(sections.map((s) => [s.kind, s.root]));
  let payload = "surfacepin-v2\n";
  for (const kind of order) {
    const root = map.get(kind);
    if (root !== undefined) {
      payload += `${kind}\n${root}\n`;
    }
  }
  return sha256Hex(payload);
}
