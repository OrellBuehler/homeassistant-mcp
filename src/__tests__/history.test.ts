import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.stubEnv("HASS_URL", "http://localhost:8123");
vi.stubEnv("HASS_TOKEN", "test-token");

const { registerHistoryTools } = await import("../tools/history.js");
const { HassClient } = await import("../hass/rest.js");

type ToolHandler = (args: any) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function collectTools() {
  const tools = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    },
  };
  registerHistoryTools(server as any, new HassClient("http://localhost:8123", "test-token"));
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

describe("history tools", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("get_history builds the period URL with start timestamp and filters", async () => {
    mockFetch.mockResolvedValueOnce(mockJson([]));
    await tools.get("get_history")!({
      entity_id: "sensor.temp",
      start: "2026-06-01T00:00:00",
      minimal_response: true,
    });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/history/period/2026-06-01T00%3A00%3A00");
    expect(url).toContain("filter_entity_id=sensor.temp");
    expect(url).toContain("minimal_response=true");
  });

  it("get_history uses the base period path when no start is given", async () => {
    mockFetch.mockResolvedValueOnce(mockJson([]));
    await tools.get("get_history")!({ entity_id: "sensor.temp" });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url.startsWith("http://localhost:8123/api/history/period?")).toBe(true);
    expect(url).not.toContain("minimal_response");
  });

  it("get_logbook builds the logbook URL", async () => {
    mockFetch.mockResolvedValueOnce(mockJson([]));
    await tools.get("get_logbook")!({ entity_id: "light.kitchen", start: "2026-06-01T00:00:00" });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/logbook/2026-06-01T00%3A00%3A00");
    expect(url).toContain("entity=light.kitchen");
  });
});
