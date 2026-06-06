export function buildQS(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      sp.set(k, v.join(","));
    } else {
      sp.set(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function ok(data: unknown) {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return { content: [{ type: "text" as const, text }] };
}

export function err(e: unknown) {
  return { content: [{ type: "text" as const, text: String(e) }], isError: true as const };
}

export interface HassState {
  entity_id: string;
  state: string;
  attributes?: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

export function domainOf(entityId: string): string {
  return entityId.split(".")[0];
}

export function summarizeState(s: HassState): Record<string, unknown> {
  const a = s.attributes ?? {};
  const out: Record<string, unknown> = { entity_id: s.entity_id, state: s.state };
  if (a.friendly_name !== undefined) out.friendly_name = a.friendly_name;
  if (a.device_class !== undefined) out.device_class = a.device_class;
  if (a.unit_of_measurement !== undefined) out.unit = a.unit_of_measurement;
  return out;
}
