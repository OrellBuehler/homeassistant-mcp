import { describe, it, expect, vi } from "vitest";
import { registerZhaTools } from "../tools/zha.js";

type ToolHandler = (args: any) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function collectTools(command: any) {
  const tools = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    },
  };
  registerZhaTools(server as any, { command } as any);
  return tools;
}

const GROUPABLE = [
  {
    endpoint_id: 11,
    entities: [{ entity_id: "light.philips_iris_tv_left", name: "Iris Left" }],
    device: { ieee: "00:11:22:33:44:55:66:01", name: "Iris Left" },
  },
  {
    endpoint_id: 11,
    entities: [{ entity_id: "light.philips_iris_tv_right", name: "Iris Right" }],
    device: { ieee: "00:11:22:33:44:55:66:02", name: "Iris Right" },
  },
];

describe("zha tools", () => {
  it("list_zha_groups passes the result through", async () => {
    const command = vi.fn().mockResolvedValue([{ group_id: 1, name: "Iris TV", members: [] }]);
    const tools = collectTools(command);
    const res = await tools.get("list_zha_groups")!({});
    expect(command).toHaveBeenCalledWith("zha/groups");
    expect(JSON.parse(res.content[0].text)[0].name).toBe("Iris TV");
  });

  it("list_zha_groupable summarizes endpoints to ieee/endpoint/entities", async () => {
    const command = vi.fn().mockResolvedValue(GROUPABLE);
    const tools = collectTools(command);
    const res = await tools.get("list_zha_groupable")!({});
    expect(command).toHaveBeenCalledWith("zha/devices/groupable");
    const payload = JSON.parse(res.content[0].text);
    expect(payload.count).toBe(2);
    expect(payload.endpoints[0]).toMatchObject({
      ieee: "00:11:22:33:44:55:66:01",
      endpoint_id: 11,
      entities: ["light.philips_iris_tv_left"],
    });
  });

  it("create_zha_group resolves entity_ids to ieee+endpoint then calls zha/group/add", async () => {
    const command = vi.fn().mockImplementation((type: string) => {
      if (type === "zha/devices/groupable") return Promise.resolve(GROUPABLE);
      return Promise.resolve({ group_id: 7, name: "Iris TV", members: [] });
    });
    const tools = collectTools(command);
    const res = await tools.get("create_zha_group")!({
      name: "Iris TV",
      members: ["light.philips_iris_tv_left", "light.philips_iris_tv_right"],
    });
    expect(command).toHaveBeenCalledWith("zha/devices/groupable");
    expect(command).toHaveBeenCalledWith("zha/group/add", {
      group_name: "Iris TV",
      members: [
        { ieee: "00:11:22:33:44:55:66:01", endpoint_id: 11 },
        { ieee: "00:11:22:33:44:55:66:02", endpoint_id: 11 },
      ],
    });
    expect(JSON.parse(res.content[0].text).group_id).toBe(7);
  });

  it("create_zha_group accepts explicit ieee/endpoint without a groupable lookup", async () => {
    const command = vi.fn().mockResolvedValue({ group_id: 8, name: "Manual", members: [] });
    const tools = collectTools(command);
    await tools.get("create_zha_group")!({
      name: "Manual",
      members: [{ ieee: "aa:bb", endpoint_id: 1 }],
    });
    expect(command).not.toHaveBeenCalledWith("zha/devices/groupable");
    expect(command).toHaveBeenCalledWith("zha/group/add", {
      group_name: "Manual",
      members: [{ ieee: "aa:bb", endpoint_id: 1 }],
    });
  });

  it("create_zha_group omits members for an empty group", async () => {
    const command = vi.fn().mockResolvedValue({ group_id: 9, name: "Empty", members: [] });
    const tools = collectTools(command);
    await tools.get("create_zha_group")!({ name: "Empty" });
    expect(command).toHaveBeenCalledWith("zha/group/add", { group_name: "Empty" });
  });

  it("create_zha_group errors when an entity_id is not groupable", async () => {
    const command = vi.fn().mockResolvedValue(GROUPABLE);
    const tools = collectTools(command);
    const res = await tools.get("create_zha_group")!({
      name: "Bad",
      members: ["switch.licht_keller"],
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("not a groupable ZHA entity");
    expect(command).not.toHaveBeenCalledWith("zha/group/add", expect.anything());
  });

  it("add_zha_group_members resolves and forwards group_id + members", async () => {
    const command = vi.fn().mockImplementation((type: string) => {
      if (type === "zha/devices/groupable") return Promise.resolve(GROUPABLE);
      return Promise.resolve({ group_id: 7 });
    });
    const tools = collectTools(command);
    await tools.get("add_zha_group_members")!({
      group_id: 7,
      members: ["light.philips_iris_tv_right"],
    });
    expect(command).toHaveBeenCalledWith("zha/group/members/add", {
      group_id: 7,
      members: [{ ieee: "00:11:22:33:44:55:66:02", endpoint_id: 11 }],
    });
  });

  it("remove_zha_group forwards group_ids", async () => {
    const command = vi.fn().mockResolvedValue([]);
    const tools = collectTools(command);
    await tools.get("remove_zha_group")!({ group_ids: [7] });
    expect(command).toHaveBeenCalledWith("zha/group/remove", { group_ids: [7] });
  });

  it("returns an MCP error when the websocket command rejects", async () => {
    const command = vi.fn().mockRejectedValue(new Error("zha not loaded"));
    const tools = collectTools(command);
    const res = await tools.get("list_zha_groups")!({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("zha not loaded");
  });
});
