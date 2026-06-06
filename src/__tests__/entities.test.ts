import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.stubEnv("HASS_URL", "http://localhost:8123");
vi.stubEnv("HASS_TOKEN", "test-token");

const { registerEntityTools } = await import("../tools/entities.js");
const { HassClient } = await import("../hass/rest.js");

type ToolHandler = (args: any) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function collectTools() {
  const tools = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    },
  };
  registerEntityTools(server as any, new HassClient("http://localhost:8123", "test-token"));
  return tools;
}

const tools = collectTools();

function mockJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(body),
  };
}

const STATES = [
  { entity_id: "light.kitchen", state: "on", attributes: { friendly_name: "Kitchen Light" } },
  { entity_id: "light.bedroom", state: "off", attributes: { friendly_name: "Bedroom Light" } },
  {
    entity_id: "sensor.temp",
    state: "21.5",
    attributes: { friendly_name: "Temp", unit_of_measurement: "°C", device_class: "temperature" },
  },
];

describe("entity tools", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("list_entities returns a compact summary and hits /api/states", async () => {
    mockFetch.mockResolvedValueOnce(mockJson(STATES));
    const res = await tools.get("list_entities")!({});
    const payload = JSON.parse(res.content[0].text);
    expect(payload.count).toBe(3);
    expect(payload.entities[2]).toEqual({
      entity_id: "sensor.temp",
      state: "21.5",
      friendly_name: "Temp",
      device_class: "temperature",
      unit: "°C",
    });
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:8123/api/states", expect.any(Object));
  });

  it("list_entities filters by domain", async () => {
    mockFetch.mockResolvedValueOnce(mockJson(STATES));
    const res = await tools.get("list_entities")!({ domain: "light" });
    const payload = JSON.parse(res.content[0].text);
    expect(payload.count).toBe(2);
    expect(payload.entities.every((e: any) => e.entity_id.startsWith("light."))).toBe(true);
  });

  it("list_entities filters by search across id and friendly_name", async () => {
    mockFetch.mockResolvedValueOnce(mockJson(STATES));
    const res = await tools.get("list_entities")!({ search: "bedroom" });
    const payload = JSON.parse(res.content[0].text);
    expect(payload.count).toBe(1);
    expect(payload.entities[0].entity_id).toBe("light.bedroom");
  });

  it("get_entity fetches the single-state endpoint", async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ entity_id: "light.kitchen", state: "on" }));
    await tools.get("get_entity")!({ entity_id: "light.kitchen" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8123/api/states/light.kitchen",
      expect.any(Object),
    );
  });

  it("list_domains aggregates counts sorted by domain", async () => {
    mockFetch.mockResolvedValueOnce(mockJson(STATES));
    const res = await tools.get("list_domains")!({});
    const payload = JSON.parse(res.content[0].text);
    expect(payload.domains).toEqual([
      { domain: "light", count: 2 },
      { domain: "sensor", count: 1 },
    ]);
  });

  it("returns an MCP error when the API call fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve("bad token"),
    });
    const res = await tools.get("get_entity")!({ entity_id: "x.y" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("401");
  });
});
