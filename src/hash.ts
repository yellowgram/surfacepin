import { createHash } from "node:crypto";
import { canonicalizeToBytes } from "./canonicalize.js";
import type { ToolDescriptor } from "./types.js";

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Per-tool digest over the surface descriptor object. */
export function toolDigest(descriptor: ToolDescriptor): string {
  // Descriptor object keys will be sorted by canonicalize: description, inputSchema, name.
  const payload = {
    description: descriptor.description,
    inputSchema: descriptor.inputSchema,
    name: descriptor.name,
  };
  return sha256Hex(canonicalizeToBytes(payload));
}

/**
 * Root digest: SHA-256 over
 *   "surfacepin-v1\n" + for each tool (name-sorted): name + "\n" + digest + "\n"
 */
export function rootDigest(
  tools: Array<{ name: string; digest: string }>,
): string {
  const sorted = [...tools].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  let payload = "surfacepin-v1\n";
  for (const t of sorted) {
    payload += `${t.name}\n${t.digest}\n`;
  }
  return sha256Hex(payload);
}
