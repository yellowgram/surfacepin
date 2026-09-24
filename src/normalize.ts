import {
  SurfacePinError,
  type PromptArgumentDescriptor,
  type PromptDescriptor,
  type PromptSurface,
  type ResourceDescriptor,
  type ResourceSurface,
  type SurfaceKind,
  type ToolDescriptor,
  type ToolSurface,
} from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Combined surface document from file or stdio adapter. */
export interface SurfaceDoc {
  tools?: ToolSurface[];
  resources?: ResourceSurface[];
  prompts?: PromptSurface[];
}

/** Extract selected surfaces from a JSON document. Missing arrays → []. */
export function extractSurfaces(
  doc: unknown,
  kinds: readonly SurfaceKind[],
): SurfaceDoc {
  if (!isPlainObject(doc)) {
    throw new SurfacePinError("surface JSON must be an object");
  }
  const out: SurfaceDoc = {};
  for (const kind of kinds) {
    const raw = doc[kind];
    if (raw === undefined) {
      out[kind] = [];
      continue;
    }
    if (!Array.isArray(raw)) {
      throw new SurfacePinError(`surface JSON "${kind}" must be an array when present`);
    }
    if (kind === "tools") out.tools = raw as ToolSurface[];
    else if (kind === "resources") out.resources = raw as ResourceSurface[];
    else out.prompts = raw as PromptSurface[];
  }
  return out;
}

/** @deprecated Prefer extractSurfaces — tools-only helper. */
export function extractTools(doc: unknown): ToolSurface[] {
  return extractSurfaces(doc, ["tools"]).tools ?? [];
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

    // annotations: omit if absent/non-object; drop title; omit if empty after drop.
    // Do not materialize MCP defaults into hashed fields.
    let annotations: Record<string, unknown> | undefined;
    const rawAnn = t.annotations;
    if (rawAnn !== undefined && rawAnn !== null) {
      if (!isPlainObject(rawAnn)) {
        // Non-object annotations → omit key (same as absent)
        annotations = undefined;
      } else {
        const kept: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rawAnn)) {
          if (k === "title") continue;
          kept[k] = v;
        }
        if (Object.keys(kept).length > 0) {
          annotations = kept;
        }
      }
    }

    // outputSchema: absent/null → omit; {} → include; non-object → usage error.
    let outputSchema: Record<string, unknown> | undefined;
    const rawOut = t.outputSchema;
    if (rawOut !== undefined && rawOut !== null) {
      if (!isPlainObject(rawOut)) {
        throw new SurfacePinError(
          `tools[${i}].outputSchema must be an object when present`,
        );
      }
      outputSchema = rawOut as Record<string, unknown>;
    }

    const desc: ToolDescriptor = { name: t.name, description, inputSchema };
    if (annotations !== undefined) desc.annotations = annotations;
    if (outputSchema !== undefined) desc.outputSchema = outputSchema;
    out.push(desc);
  }

  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

export function normalizeResources(raw: ResourceSurface[]): ResourceDescriptor[] {
  const seen = new Set<string>();
  const out: ResourceDescriptor[] = [];

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (!isPlainObject(r)) {
      throw new SurfacePinError(`resources[${i}] must be an object`);
    }
    if (typeof r.uri !== "string" || r.uri.length === 0) {
      throw new SurfacePinError(`resources[${i}].uri must be a non-empty string`);
    }
    if (typeof r.name !== "string" || r.name.length === 0) {
      throw new SurfacePinError(`resources[${i}].name must be a non-empty string`);
    }
    if (seen.has(r.uri)) {
      throw new SurfacePinError(`duplicate resource uri: ${r.uri}`);
    }
    seen.add(r.uri);

    let description = "";
    if (r.description !== undefined) {
      if (typeof r.description !== "string") {
        throw new SurfacePinError(
          `resources[${i}].description must be a string when present`,
        );
      }
      description = r.description;
    }

    let mimeType = "";
    if (r.mimeType !== undefined) {
      if (typeof r.mimeType !== "string") {
        throw new SurfacePinError(
          `resources[${i}].mimeType must be a string when present`,
        );
      }
      mimeType = r.mimeType;
    }

    out.push({ uri: r.uri, name: r.name, description, mimeType });
  }

  out.sort((a, b) => (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0));
  return out;
}

function normalizePromptArguments(
  raw: unknown,
  promptIndex: number,
): PromptArgumentDescriptor[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new SurfacePinError(
      `prompts[${promptIndex}].arguments must be an array when present`,
    );
  }
  const out: PromptArgumentDescriptor[] = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (!isPlainObject(a)) {
      throw new SurfacePinError(
        `prompts[${promptIndex}].arguments[${i}] must be an object`,
      );
    }
    if (typeof a.name !== "string" || a.name.length === 0) {
      throw new SurfacePinError(
        `prompts[${promptIndex}].arguments[${i}].name must be a non-empty string`,
      );
    }
    let description = "";
    if (a.description !== undefined) {
      if (typeof a.description !== "string") {
        throw new SurfacePinError(
          `prompts[${promptIndex}].arguments[${i}].description must be a string when present`,
        );
      }
      description = a.description;
    }
    let required = false;
    if (a.required !== undefined) {
      if (typeof a.required !== "boolean") {
        throw new SurfacePinError(
          `prompts[${promptIndex}].arguments[${i}].required must be a boolean when present`,
        );
      }
      required = a.required;
    }
    out.push({ name: a.name, description, required });
  }
  // Preserve declaration order (MCP PromptArgument list is ordered).
  return out;
}

export function normalizePrompts(raw: PromptSurface[]): PromptDescriptor[] {
  const seen = new Set<string>();
  const out: PromptDescriptor[] = [];

  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (!isPlainObject(p)) {
      throw new SurfacePinError(`prompts[${i}] must be an object`);
    }
    if (typeof p.name !== "string" || p.name.length === 0) {
      throw new SurfacePinError(`prompts[${i}].name must be a non-empty string`);
    }
    if (seen.has(p.name)) {
      throw new SurfacePinError(`duplicate prompt name: ${p.name}`);
    }
    seen.add(p.name);

    let description = "";
    if (p.description !== undefined) {
      if (typeof p.description !== "string") {
        throw new SurfacePinError(
          `prompts[${i}].description must be a string when present`,
        );
      }
      description = p.description;
    }

    const args = normalizePromptArguments(p.arguments, i);
    out.push({ name: p.name, description, arguments: args });
  }

  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}
