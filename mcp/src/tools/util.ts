export function jsonResult(data: unknown): {
  content: { type: "text"; text: string }[];
} {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Transform a flat args object with `filter.<field>` keys into Spiffy's
 * bracketed filter syntax (`filter[<field>]`). Drops undefined/null values.
 *
 * Example:
 *   { customer_id: 1, "filter.status": "active", "filter.created_at.gte": "2026-01-01" }
 * becomes:
 *   { customer_id: 1, "filter[status]": "active", "filter[created_at.gte]": "2026-01-01" }
 */
export function normalizeFilterArgs(
  args: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) continue;
    const key = k.startsWith("filter.") ? `filter[${k.slice(7)}]` : k;
    out[key] = v as string | number | boolean;
  }
  return out;
}
