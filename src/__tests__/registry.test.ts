import { describe, it, expect, vi } from "vitest";
import { registerRegistryTools } from "../tools/registry.js";

type ToolHandler = (args: any) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function collectTools(command: any) {
  const tools = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    },
  };
  registerRegistryTools(server as any, { command } as any);
  return tools;
}

describe("registry tools", () => {
  it("list_registry_entities summarizes entries and filters by domain", async () => {
    const command = vi.fn().mockResolvedValue([
      {
        entity_id: "light.kitchen",
        original_name: "Kitchen",
        platform: "hue",
        area_id: "kitchen",
        device_id: "d1",
      },
      { entity_id: "sensor.temp", name: "Temp", platform: "mqtt", disabled_by: "user" },
    ]);
    const tools = collectTools(command);
    const res = await tools.get("list_registry_entities")!({ domain: "light" });
    expect(command).toHaveBeenCalledWith("config/entity_registry/list");
    const payload = JSON.parse(res.content[0].text);
    expect(payload.count).toBe(1);
    expect(payload.entities[0]).toMatchObject({
      entity_id: "light.kitchen",
      name: "Kitchen",
      platform: "hue",
      area_id: "kitchen",
      device_id: "d1",
    });
  });

  it("list_registry_entities can exclude disabled entities", async () => {
    const command = vi.fn().mockResolvedValue([
      { entity_id: "light.kitchen", original_name: "Kitchen" },
      { entity_id: "light.old", original_name: "Old", disabled_by: "integration" },
    ]);
    const tools = collectTools(command);
    const res = await tools.get("list_registry_entities")!({ include_disabled: false });
    const payload = JSON.parse(res.content[0].text);
    expect(payload.count).toBe(1);
    expect(payload.entities[0].entity_id).toBe("light.kitchen");
  });

  it("list_registry_entities falls back to null for missing name/category fields", async () => {
    const command = vi.fn().mockResolvedValue([{ entity_id: "sensor.x", platform: "mqtt" }]);
    const tools = collectTools(command);
    const res = await tools.get("list_registry_entities")!({});
    const payload = JSON.parse(res.content[0].text);
    expect(payload.entities[0]).toMatchObject({
      entity_id: "sensor.x",
      name: null,
      area_id: null,
      device_id: null,
      entity_category: null,
      disabled_by: null,
      hidden_by: null,
    });
  });

  it("list_devices prefers name_by_user over name", async () => {
    const command = vi.fn().mockResolvedValue([
      {
        id: "d1",
        name: "Generic",
        name_by_user: "Living Room TV",
        manufacturer: "Sony",
        model: "X",
      },
    ]);
    const tools = collectTools(command);
    const res = await tools.get("list_devices")!({});
    expect(command).toHaveBeenCalledWith("config/device_registry/list");
    expect(JSON.parse(res.content[0].text).devices[0].name).toBe("Living Room TV");
  });

  it("list_areas passes the registry result through", async () => {
    const command = vi.fn().mockResolvedValue([{ area_id: "kitchen", name: "Kitchen" }]);
    const tools = collectTools(command);
    const res = await tools.get("list_areas")!({});
    expect(command).toHaveBeenCalledWith("config/area_registry/list");
    expect(JSON.parse(res.content[0].text)).toEqual([{ area_id: "kitchen", name: "Kitchen" }]);
  });

  it("returns an MCP error when the websocket command rejects", async () => {
    const command = vi.fn().mockRejectedValue(new Error("auth failed"));
    const tools = collectTools(command);
    const res = await tools.get("list_labels")!({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("auth failed");
  });
});
