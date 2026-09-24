/**
 * surfacepin-jcs-v1 — RFC 8785 JCS-compatible deterministic JSON encoding.
 * See SPEC.md §3.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Escape a string per JSON / JCS rules (ECMA-404 + RFC 8785). */
function escapeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    switch (c) {
      case 0x22: // "
        out += '\\"';
        break;
      case 0x5c: // \
        out += "\\\\";
        break;
      case 0x08:
        out += "\\b";
        break;
      case 0x0c:
        out += "\\f";
        break;
      case 0x0a:
        out += "\\n";
        break;
      case 0x0d:
        out += "\\r";
        break;
      case 0x09:
        out += "\\t";
        break;
      default:
        if (c < 0x20) {
          out += `\\u${c.toString(16).padStart(4, "0")}`;
        } else {
          out += s[i];
        }
    }
  }
  out += '"';
  return out;
}

/**
 * Serialize a finite number with ECMAScript JSON.stringify rules
 * (shortest round-trip form). Rejects NaN / Infinity.
 */
function serializeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`non-finite number not allowed in surfacepin-jcs-v1: ${n}`);
  }
  // JSON.stringify uses the ES ToString number rules JCS relies on.
  return JSON.stringify(n);
}

/**
 * Canonicalize a JSON value to a compact string (no insignificant whitespace,
 * object keys sorted by UTF-16 code unit order).
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";

  const t = typeof value;
  if (t === "string") return escapeString(value as string);
  if (t === "number") return serializeNumber(value as number);

  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const el of value) {
      if (el === undefined) {
        parts.push("null");
      } else {
        parts.push(canonicalize(el));
      }
    }
    return `[${parts.join(",")}]`;
  }

  if (isPlainObject(value) || (typeof value === "object" && value !== null)) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
    // UTF-16 code unit lexicographic order (ECMAScript default string <).
    keys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(`${escapeString(k)}:${canonicalize(obj[k])}`);
    }
    return `{${parts.join(",")}}`;
  }

  throw new Error(`unsupported JSON type in surfacepin-jcs-v1: ${t}`);
}

/** UTF-8 bytes of the canonical form. */
export function canonicalizeToBytes(value: unknown): Buffer {
  return Buffer.from(canonicalize(value), "utf8");
}
