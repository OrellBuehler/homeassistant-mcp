import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerAutomationTools } from "../tools/automations.js";
import { HassClient } from "../hass/rest.js";

type ToolHandler = (args: any) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function collectTools() {
  const tools = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    },
  };
  registerAutomationTools(server as any, new HassClient("http://ha", "tok"));
  return tools;
}

function payload(res: { content: { text: string }[] }) {
  return JSON.parse(res.content[0].text);
}

function mockJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(body),
  };
}

describe("automation tools", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("get_automation_config resolves an entity id via its id attribute", async () => {
    const config = { alias: "Morning", triggers: [], actions: [] };
    mockFetch
      .mockResolvedValueOnce(
        mockJson({ entity_id: "automation.morning", state: "on", attributes: { id: "123" } }),
      )
      .mockResolvedValueOnce(mockJson(config));
    const tools = collectTools();
    const res = await tools.get("get_automation_config")!({ automation: "automation.morning" });
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://ha/api/states/automation.morning",
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://ha/api/config/automation/config/123",
      expect.any(Object),
    );
    expect(payload(res)).toEqual(config);
  });

  it("get_automation_config accepts a raw id without a states call", async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ alias: "X" }));
    const tools = collectTools();
    const res = await tools.get("get_automation_config")!({ automation: "1688999999999" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://ha/api/config/automation/config/1688999999999",
      expect.any(Object),
    );
    expect(payload(res)).toEqual({ alias: "X" });
  });

  it("upsert_automation replaces an existing automation by entity id", async () => {
    const config = { alias: "Morning v2", triggers: [{ trigger: "state" }], actions: [] };
    mockFetch
      .mockResolvedValueOnce(
        mockJson({ entity_id: "automation.morning", state: "on", attributes: { id: "123" } }),
      )
      .mockResolvedValueOnce(mockJson({ result: "ok" }));
    const tools = collectTools();
    const res = await tools.get("upsert_automation")!({
      automation: "automation.morning",
      config,
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://ha/api/config/automation/config/123",
      expect.objectContaining({ method: "POST", body: JSON.stringify(config) }),
    );
    expect(payload(res)).toEqual({ id: "123", created: false, result: { result: "ok" } });
  });

  it("upsert_automation generates an id when creating", async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ result: "ok" }));
    const tools = collectTools();
    const res = await tools.get("upsert_automation")!({
      config: { alias: "New", triggers: [], actions: [] },
    });
    const p = payload(res);
    expect(p.created).toBe(true);
    expect(p.id).toMatch(/^\d+$/);
    expect(mockFetch).toHaveBeenCalledWith(
      `http://ha/api/config/automation/config/${p.id}`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("delete_automation deletes by raw id", async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ result: "ok" }));
    const tools = collectTools();
    const res = await tools.get("delete_automation")!({ automation: "123" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://ha/api/config/automation/config/123",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(payload(res)).toEqual({ result: "ok" });
  });

  it("errors when the automation has no id attribute", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJson({ entity_id: "automation.yaml_only", state: "on", attributes: {} }),
    );
    const tools = collectTools();
    const res = await tools.get("get_automation_config")!({ automation: "automation.yaml_only" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/id/i);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("resolves an id attribute that is the number 0", async () => {
    mockFetch
      .mockResolvedValueOnce(mockJson({ entity_id: "automation.zero", attributes: { id: 0 } }))
      .mockResolvedValueOnce(mockJson({ alias: "Zero" }));
    const tools = collectTools();
    const res = await tools.get("get_automation_config")!({ automation: "automation.zero" });
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://ha/api/config/automation/config/0",
      expect.any(Object),
    );
    expect(res.isError).toBeUndefined();
  });

  it("encodes ids in the config path", async () => {
    mockFetch.mockResolvedValueOnce(mockJson({}));
    const tools = collectTools();
    await tools.get("get_automation_config")!({ automation: "my id/1" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://ha/api/config/automation/config/my%20id%2F1",
      expect.any(Object),
    );
  });

  it("returns an MCP error when the config API rejects", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: () => Promise.resolve('{"message": "Message malformed: required key not provided"}'),
    });
    const tools = collectTools();
    const res = await tools.get("upsert_automation")!({
      automation: "123",
      config: { alias: "Broken" },
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("400");
    expect(res.content[0].text).toContain("Message malformed");
  });

  it("returns an MCP error when the entity lookup fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: () => Promise.resolve("Entity not found"),
    });
    const tools = collectTools();
    const res = await tools.get("delete_automation")!({ automation: "automation.missing" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("404");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
