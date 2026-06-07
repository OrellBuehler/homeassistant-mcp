import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerTraceTools } from "../tools/trace.js";
import { HassClient } from "../hass/rest.js";

type ToolHandler = (args: any) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function collectTools(command: any) {
  const tools = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    },
  };
  registerTraceTools(server as any, { command } as any, new HassClient("http://ha", "tok"));
  return tools;
}

function payload(res: { content: { text: string }[] }) {
  return JSON.parse(res.content[0].text);
}

function mockState(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(body),
  };
}

describe("trace tools", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("list_traces resolves an automation via its id attribute and lists newest-first", async () => {
    mockFetch.mockResolvedValueOnce(
      mockState({ entity_id: "automation.x", state: "on", attributes: { id: "123" } }),
    );
    const summaries = [
      {
        run_id: "r1",
        state: "stopped",
        script_execution: "finished",
        last_step: "action/0",
        timestamp: { start: "2026-06-07T10:00:00+00:00", finish: "2026-06-07T10:00:01+00:00" },
      },
      {
        run_id: "r2",
        state: "stopped",
        script_execution: "error",
        last_step: "condition/0",
        error: "boom",
        timestamp: { start: "2026-06-07T11:00:00+00:00", finish: "2026-06-07T11:00:01+00:00" },
      },
    ];
    const command = vi.fn().mockResolvedValue(summaries);
    const tools = collectTools(command);
    const res = await tools.get("list_traces")!({ entity_id: "automation.x" });
    expect(mockFetch).toHaveBeenCalledWith("http://ha/api/states/automation.x", expect.any(Object));
    expect(command).toHaveBeenCalledWith("trace/list", { domain: "automation", item_id: "123" });
    const p = payload(res);
    expect(p).toMatchObject({ entity_id: "automation.x", domain: "automation", item_id: "123" });
    expect(p.count).toBe(2);
    expect(p.traces.map((t: any) => t.run_id)).toEqual(["r2", "r1"]);
    expect(p.traces[0]).toMatchObject({ run_id: "r2", script_execution: "error", error: "boom" });
    expect(p.traces[0].timestamp).toEqual({
      start: "2026-06-07T11:00:00+00:00",
      finish: "2026-06-07T11:00:01+00:00",
    });
    expect(p.traces[1].error).toBeUndefined();
  });

  it("list_traces resolves a script via its object_id without a REST call", async () => {
    const command = vi.fn().mockResolvedValue([]);
    const tools = collectTools(command);
    const res = await tools.get("list_traces")!({ entity_id: "script.morning" });
    expect(command).toHaveBeenCalledWith("trace/list", { domain: "script", item_id: "morning" });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(payload(res).count).toBe(0);
  });

  it("get_trace returns the full trace for a run", async () => {
    mockFetch.mockResolvedValueOnce(
      mockState({ entity_id: "automation.x", attributes: { id: "123" } }),
    );
    const full = {
      run_id: "r1",
      domain: "automation",
      item_id: "123",
      trace: { "action/0": [{ path: "action/0" }] },
      config: {},
      variables: {},
    };
    const command = vi.fn().mockResolvedValue(full);
    const tools = collectTools(command);
    const res = await tools.get("get_trace")!({ entity_id: "automation.x", run_id: "r1" });
    expect(command).toHaveBeenCalledWith("trace/get", {
      domain: "automation",
      item_id: "123",
      run_id: "r1",
    });
    expect(payload(res)).toEqual(full);
  });

  it("get_trace_contexts passes the context map through", async () => {
    const contexts = { ctx1: { run_id: "r1", domain: "script", item_id: "morning" } };
    const command = vi.fn().mockResolvedValue(contexts);
    const tools = collectTools(command);
    const res = await tools.get("get_trace_contexts")!({ entity_id: "script.morning" });
    expect(command).toHaveBeenCalledWith("trace/contexts", {
      domain: "script",
      item_id: "morning",
    });
    expect(payload(res)).toEqual(contexts);
  });

  it("rejects entities that are not automations or scripts", async () => {
    const command = vi.fn();
    const tools = collectTools(command);
    const res = await tools.get("list_traces")!({ entity_id: "light.kitchen" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/automation|script/i);
    expect(command).not.toHaveBeenCalled();
  });

  it("errors when an automation has no id attribute", async () => {
    mockFetch.mockResolvedValueOnce(
      mockState({ entity_id: "automation.yaml_only", state: "on", attributes: {} }),
    );
    const command = vi.fn();
    const tools = collectTools(command);
    const res = await tools.get("list_traces")!({ entity_id: "automation.yaml_only" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/id/i);
    expect(command).not.toHaveBeenCalled();
  });

  it("rejects a script entity with an empty object_id", async () => {
    const command = vi.fn();
    const tools = collectTools(command);
    const res = await tools.get("list_traces")!({ entity_id: "script." });
    expect(res.isError).toBe(true);
    expect(command).not.toHaveBeenCalled();
  });

  it("returns an MCP error when the automation state fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: () => Promise.resolve("Entity not found"),
    });
    const command = vi.fn();
    const tools = collectTools(command);
    const res = await tools.get("list_traces")!({ entity_id: "automation.missing" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("404");
    expect(command).not.toHaveBeenCalled();
  });

  it("returns an MCP error when the trace command rejects", async () => {
    const command = vi.fn().mockRejectedValue(new Error("trace boom"));
    const tools = collectTools(command);
    const res = await tools.get("list_traces")!({ entity_id: "script.morning" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("trace boom");
  });

  it("list_traces sorts robustly when timestamps are missing or unparseable", async () => {
    const summaries = [
      { run_id: "old", timestamp: { start: "2026-06-07T10:00:00+00:00" } },
      { run_id: "new", timestamp: { start: "2026-06-07T12:00:00+00:00" } },
      { run_id: "nostamp" },
      { run_id: "garbage", timestamp: { start: "not-a-date" } },
    ];
    const command = vi.fn().mockResolvedValue(summaries);
    const tools = collectTools(command);
    const res = await tools.get("list_traces")!({ entity_id: "script.morning" });
    const p = payload(res);
    expect(res.isError).toBeUndefined();
    expect(p.count).toBe(4);
    expect(p.traces[0].run_id).toBe("new");
    expect(p.traces[1].run_id).toBe("old");
  });

  it("list_traces treats a null trace/list result as no traces", async () => {
    const command = vi.fn().mockResolvedValue(null);
    const tools = collectTools(command);
    const res = await tools.get("list_traces")!({ entity_id: "script.morning" });
    expect(res.isError).toBeUndefined();
    expect(payload(res).count).toBe(0);
  });

  it("resolves an automation whose id attribute is the number 0", async () => {
    mockFetch.mockResolvedValueOnce(
      mockState({ entity_id: "automation.zero", attributes: { id: 0 } }),
    );
    const command = vi.fn().mockResolvedValue([]);
    const tools = collectTools(command);
    await tools.get("list_traces")!({ entity_id: "automation.zero" });
    expect(command).toHaveBeenCalledWith("trace/list", { domain: "automation", item_id: "0" });
  });

  it("rejects a bare 'automation' id without making a REST call", async () => {
    const command = vi.fn();
    const tools = collectTools(command);
    const res = await tools.get("list_traces")!({ entity_id: "automation" });
    expect(res.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(command).not.toHaveBeenCalled();
  });

  it("get_trace rejects a non-automation/script entity without calling the trace API", async () => {
    const command = vi.fn();
    const tools = collectTools(command);
    const res = await tools.get("get_trace")!({ entity_id: "light.kitchen", run_id: "r1" });
    expect(res.isError).toBe(true);
    expect(command).not.toHaveBeenCalled();
  });
});
