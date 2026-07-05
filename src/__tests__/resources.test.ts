import { describe, it, expect, vi } from "vitest";
import { registerResourceTools } from "../tools/resources.js";

type ToolHandler = (args: any) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function collectTools(command: any) {
  const tools = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    },
  };
  registerResourceTools(server as any, { command } as any);
  return tools;
}

describe("resource tools", () => {
  it("list_lovelace_resources passes the result through", async () => {
    const command = vi
      .fn()
      .mockResolvedValue([{ id: "abc", type: "module", url: "/hacsfiles/x/x.js" }]);
    const tools = collectTools(command);
    const res = await tools.get("list_lovelace_resources")!({});
    expect(command).toHaveBeenCalledWith("lovelace/resources");
    expect(JSON.parse(res.content[0].text)[0].url).toBe("/hacsfiles/x/x.js");
  });

  it("create_lovelace_resource defaults res_type to module", async () => {
    const command = vi.fn().mockResolvedValue({ id: "new", type: "module", url: "/local/a.js" });
    const tools = collectTools(command);
    await tools.get("create_lovelace_resource")!({ url: "/local/a.js" });
    expect(command).toHaveBeenCalledWith("lovelace/resources/create", {
      url: "/local/a.js",
      res_type: "module",
    });
  });

  it("create_lovelace_resource forwards an explicit res_type", async () => {
    const command = vi.fn().mockResolvedValue({});
    const tools = collectTools(command);
    await tools.get("create_lovelace_resource")!({ url: "/local/a.css", res_type: "css" });
    expect(command).toHaveBeenCalledWith("lovelace/resources/create", {
      url: "/local/a.css",
      res_type: "css",
    });
  });

  it("update_lovelace_resource sends only the provided fields", async () => {
    const command = vi.fn().mockResolvedValue({});
    const tools = collectTools(command);
    await tools.get("update_lovelace_resource")!({ resource_id: "abc", url: "/local/b.js" });
    expect(command).toHaveBeenCalledWith("lovelace/resources/update", {
      resource_id: "abc",
      url: "/local/b.js",
    });
  });

  it("delete_lovelace_resource sends the resource_id", async () => {
    const command = vi.fn().mockResolvedValue(null);
    const tools = collectTools(command);
    const res = await tools.get("delete_lovelace_resource")!({ resource_id: "abc" });
    expect(command).toHaveBeenCalledWith("lovelace/resources/delete", { resource_id: "abc" });
    expect(JSON.parse(res.content[0].text)).toEqual({ resource_id: "abc", deleted: true });
  });

  it("returns an MCP error when the websocket command rejects", async () => {
    const command = vi.fn().mockRejectedValue(new Error("resources are read-only in yaml mode"));
    const tools = collectTools(command);
    const res = await tools.get("delete_lovelace_resource")!({ resource_id: "abc" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("yaml mode");
  });
});
