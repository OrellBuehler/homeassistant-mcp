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

  it("rename_entity sends name and new_entity_id to config/entity_registry/update", async () => {
    const command = vi.fn().mockResolvedValue({ entity_entry: { entity_id: "cover.wz_links" } });
    const tools = collectTools(command);
    const res = await tools.get("rename_entity")!({
      entity_id: "cover.storen_wohnzimmer_links",
      name: "Wohnzimmer Links",
      new_entity_id: "cover.wz_links",
    });
    expect(command).toHaveBeenCalledWith("config/entity_registry/update", {
      entity_id: "cover.storen_wohnzimmer_links",
      name: "Wohnzimmer Links",
      new_entity_id: "cover.wz_links",
    });
    expect(JSON.parse(res.content[0].text).entity_entry.entity_id).toBe("cover.wz_links");
  });

  it("rename_entity forwards a null name to revert to the original name", async () => {
    const command = vi.fn().mockResolvedValue({ entity_entry: {} });
    const tools = collectTools(command);
    await tools.get("rename_entity")!({ entity_id: "cover.wz_links", name: null });
    expect(command).toHaveBeenCalledWith("config/entity_registry/update", {
      entity_id: "cover.wz_links",
      name: null,
    });
  });

  it("rename_entity requires at least one of name or new_entity_id", async () => {
    const command = vi.fn();
    const tools = collectTools(command);
    const res = await tools.get("rename_entity")!({ entity_id: "cover.wz_links" });
    expect(command).not.toHaveBeenCalled();
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("at least one");
  });

  it("rename_entity rejects a new_entity_id that changes the domain", async () => {
    const command = vi.fn();
    const tools = collectTools(command);
    const res = await tools.get("rename_entity")!({
      entity_id: "cover.wz_links",
      new_entity_id: "light.wz_links",
    });
    expect(command).not.toHaveBeenCalled();
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("cover");
  });

  it("set_entity_enabled disables each entity with disabled_by 'user'", async () => {
    const command = vi
      .fn()
      .mockResolvedValueOnce({ entity_entry: { entity_id: "sensor.a", disabled_by: "user" } })
      .mockResolvedValueOnce({ entity_entry: { entity_id: "sensor.b", disabled_by: "user" } });
    const tools = collectTools(command);
    const res = await tools.get("set_entity_enabled")!({
      entity_ids: ["sensor.a", "sensor.b"],
      enabled: false,
    });
    expect(command).toHaveBeenNthCalledWith(1, "config/entity_registry/update", {
      entity_id: "sensor.a",
      disabled_by: "user",
    });
    expect(command).toHaveBeenNthCalledWith(2, "config/entity_registry/update", {
      entity_id: "sensor.b",
      disabled_by: "user",
    });
    const payload = JSON.parse(res.content[0].text);
    expect(payload).toMatchObject({ enabled: false, count: 2, succeeded: 2, failed: 0 });
    expect(payload.results).toEqual([
      { entity_id: "sensor.a", ok: true, disabled_by: "user" },
      { entity_id: "sensor.b", ok: true, disabled_by: "user" },
    ]);
    expect(payload.note).toBeUndefined();
  });

  it("set_entity_enabled enables with disabled_by null and surfaces the reload hints", async () => {
    const command = vi
      .fn()
      .mockResolvedValueOnce({
        entity_entry: { entity_id: "sensor.a", disabled_by: null },
        reload_delay: 30,
      })
      .mockResolvedValueOnce({
        entity_entry: { entity_id: "sensor.b", disabled_by: null },
        require_restart: true,
      });
    const tools = collectTools(command);
    const res = await tools.get("set_entity_enabled")!({
      entity_ids: ["sensor.a", "sensor.b"],
      enabled: true,
    });
    expect(command).toHaveBeenNthCalledWith(1, "config/entity_registry/update", {
      entity_id: "sensor.a",
      disabled_by: null,
    });
    const payload = JSON.parse(res.content[0].text);
    expect(payload).toMatchObject({ enabled: true, count: 2, succeeded: 2, failed: 0 });
    expect(payload.results[0]).toEqual({
      entity_id: "sensor.a",
      ok: true,
      disabled_by: null,
      reload_delay: 30,
    });
    expect(payload.results[1]).toEqual({
      entity_id: "sensor.b",
      ok: true,
      disabled_by: null,
      require_restart: true,
    });
    expect(payload.note).toContain("not available immediately");
  });

  it("set_entity_enabled keeps going after a failure and reports it per entity", async () => {
    const command = vi
      .fn()
      .mockResolvedValueOnce({ entity_entry: { entity_id: "sensor.a", disabled_by: null } })
      .mockRejectedValueOnce(new Error("Entity not found"))
      .mockResolvedValueOnce({ entity_entry: { entity_id: "sensor.c", disabled_by: null } });
    const tools = collectTools(command);
    const res = await tools.get("set_entity_enabled")!({
      entity_ids: ["sensor.a", "sensor.missing", "sensor.c"],
      enabled: true,
    });
    expect(command).toHaveBeenCalledTimes(3);
    expect(res.isError).toBeUndefined();
    const payload = JSON.parse(res.content[0].text);
    expect(payload).toMatchObject({ count: 3, succeeded: 2, failed: 1 });
    expect(payload.results[1].ok).toBe(false);
    expect(payload.results[1].error).toContain("Entity not found");
    expect(payload.results[2]).toMatchObject({ entity_id: "sensor.c", ok: true });
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
