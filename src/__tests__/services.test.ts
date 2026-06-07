import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { registerServiceTools } = await import("../tools/services.js");
const { HassClient } = await import("../hass/rest.js");

type ToolHandler = (args: any) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function collectTools() {
  const tools = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    },
  };
  registerServiceTools(server as any, new HassClient("http://localhost:8123", "test-token"));
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

const SERVICES = [
  { domain: "light", services: { turn_on: {}, turn_off: {}, toggle: {} } },
  { domain: "automation", services: { reload: {}, trigger: {} } },
];

describe("service tools", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("list_services returns a compact domain -> names map by default", async () => {
    mockFetch.mockResolvedValueOnce(mockJson(SERVICES));
    const res = await tools.get("list_services")!({});
    const payload = JSON.parse(res.content[0].text);
    expect(payload.count).toBe(2);
    expect(payload.domains).toContainEqual({
      domain: "light",
      services: ["turn_on", "turn_off", "toggle"],
    });
  });

  it("list_services returns full detail for a single domain", async () => {
    mockFetch.mockResolvedValueOnce(mockJson(SERVICES));
    const res = await tools.get("list_services")!({ domain: "automation" });
    const payload = JSON.parse(res.content[0].text);
    expect(payload).toEqual({ domain: "automation", services: { reload: {}, trigger: {} } });
  });

  it("list_services returns empty services for an unknown domain", async () => {
    mockFetch.mockResolvedValueOnce(mockJson(SERVICES));
    const res = await tools.get("list_services")!({ domain: "nope" });
    expect(JSON.parse(res.content[0].text)).toEqual({ domain: "nope", services: {} });
  });

  it("list_events fetches the events endpoint and returns the payload", async () => {
    const events = [{ event: "state_changed", listener_count: 5 }];
    mockFetch.mockResolvedValueOnce(mockJson(events));
    const res = await tools.get("list_events")!({});
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:8123/api/events", expect.any(Object));
    expect(JSON.parse(res.content[0].text)).toEqual(events);
  });
});
