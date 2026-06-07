import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { registerReloadTools, RELOAD_TARGETS } = await import("../tools/reload.js");
const { HassClient } = await import("../hass/rest.js");

type ToolHandler = (args: any) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function collectTools() {
  const tools = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    },
  };
  registerReloadTools(server as any, new HassClient("http://localhost:8123", "test-token"));
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

describe("reload tool", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("'all' calls homeassistant.reload_all", async () => {
    mockFetch.mockResolvedValueOnce(mockJson([]));
    const res = await tools.get("reload")!({ target: "all" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8123/api/services/homeassistant/reload_all",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(res.content[0].text).service).toBe("homeassistant.reload_all");
  });

  it("'core' calls homeassistant.reload_core_config", async () => {
    mockFetch.mockResolvedValueOnce(mockJson([]));
    await tools.get("reload")!({ target: "core" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8123/api/services/homeassistant/reload_core_config",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("'automation' calls automation.reload", async () => {
    mockFetch.mockResolvedValueOnce(mockJson([]));
    await tools.get("reload")!({ target: "automation" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8123/api/services/automation/reload",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("every target maps to the conventional domain.service", () => {
    for (const [key, { domain, service }] of Object.entries(RELOAD_TARGETS)) {
      if (key === "all") {
        expect({ domain, service }).toEqual({ domain: "homeassistant", service: "reload_all" });
      } else if (key === "core") {
        expect({ domain, service }).toEqual({
          domain: "homeassistant",
          service: "reload_core_config",
        });
      } else {
        expect({ domain, service }).toEqual({ domain: key, service: "reload" });
      }
    }
  });

  it("each target posts to its reload service endpoint", async () => {
    for (const target of Object.keys(RELOAD_TARGETS)) {
      mockFetch.mockResolvedValueOnce(mockJson([]));
      const res = await tools.get("reload")!({ target });
      const { domain, service } = RELOAD_TARGETS[target];
      expect(mockFetch).toHaveBeenLastCalledWith(
        `http://localhost:8123/api/services/${domain}/${service}`,
        expect.objectContaining({ method: "POST" }),
      );
      expect(JSON.parse(res.content[0].text)).toMatchObject({
        reloaded: target,
        service: `${domain}.${service}`,
      });
    }
  });
});
