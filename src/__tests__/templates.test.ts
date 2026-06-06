import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.stubEnv("HASS_URL", "http://localhost:8123");
vi.stubEnv("HASS_TOKEN", "test-token");

const { registerTemplateTools } = await import("../tools/templates.js");
const { HassClient } = await import("../hass/rest.js");

type ToolHandler = (args: any) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function collectTools() {
  const tools = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    },
  };
  registerTemplateTools(server as any, new HassClient("http://localhost:8123", "test-token"));
  return tools;
}

const tools = collectTools();

function mockText(body: string) {
  return { ok: true, status: 200, text: () => Promise.resolve(body) };
}

describe("template tools", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("render_template POSTs the template and returns the rendered text", async () => {
    mockFetch.mockResolvedValueOnce(mockText("21.5"));
    const res = await tools.get("render_template")!({ template: "{{ states('sensor.temp') }}" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8123/api/template",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ template: "{{ states('sensor.temp') }}" }),
      }),
    );
    expect(res.content[0].text).toBe("21.5");
  });

  it("render_template includes variables when provided", async () => {
    mockFetch.mockResolvedValueOnce(mockText("ok"));
    await tools.get("render_template")!({ template: "{{ x }}", variables: { x: 1 } });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8123/api/template",
      expect.objectContaining({
        body: JSON.stringify({ template: "{{ x }}", variables: { x: 1 } }),
      }),
    );
  });
});
