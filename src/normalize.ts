import { SurfacePinError, type ToolDescriptor, type ToolSurface } from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

/** Extract tools array from ListToolsResult-shaped or bare {tools:[...]} JSON. */
export function extractTools(doc: unknown): ToolSurface[] {
  if (!isPlainObject(doc)) {
    throw new SurfacePinError("tools JSON must be an object");
  }
  if (!Array.isArray(doc.tools)) {
    throw new SurfacePinError('tools JSON must contain a "tools" array');
  }
  return doc.tools as ToolSurface[];
}

export function normalizeTools(raw: ToolSurface[]): ToolDescriptor[] {
  const seen = new Set<string>();
  const out: ToolDescriptor[] = [];

  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (!isPlainObject(t)) {
      throw new SurfacePinError(`tools[${i}] must be an object`);
    }
    if (typeof t.name !== "string" || t.name.length === 0) {
      throw new SurfacePinError(`tools[${i}].name must be a non-empty string`);
    }
    if (seen.has(t.name)) {
      throw new SurfacePinError(`duplicate tool name: ${t.name}`);
    }
    seen.add(t.name);

    let description = "";
    if (t.description !== undefined) {
      if (typeof t.description !== "string") {
        throw new SurfacePinError(
          `tools[${i}].description must be a string when present`,
        );
      }
      description = t.description;
    }

    let inputSchema: Record<string, unknown> = {};
    if (t.inputSchema !== undefined) {
      if (!isPlainObject(t.inputSchema)) {
        throw new SurfacePinError(
          `tools[${i}].inputSchema must be an object when present`,
        );
      }
      inputSchema = t.inputSchema as Record<string, unknown>;
    }

    out.push({ name: t.name, description, inputSchema });
  }

  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}
