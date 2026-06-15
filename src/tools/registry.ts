import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, domainOf } from "../hass/format.js";
import type { HassWsClient } from "../hass/ws.js";

interface RegistryEntity {
  entity_id: string;
  name?: string | null;
  original_name?: string | null;
  platform?: string;
  area_id?: string | null;
  device_id?: string | null;
  entity_category?: string | null;
  disabled_by?: string | null;
  hidden_by?: string | null;
}

interface RegistryDevice {
  id: string;
  name?: string | null;
  name_by_user?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  area_id?: string | null;
}

export function registerRegistryTools(server: McpServer, ws: HassWsClient) {
  server.tool(
    "list_registry_entities",
    "List ALL registered entities from the entity registry via the WebSocket API — including disabled and currently-unavailable entities that GET /api/states (list_entities) omits. Includes name, platform, area_id, device_id, entity_category and disabled_by. Optionally filter by domain.",
    {
      domain: z
        .string()
        .optional()
        .describe("Only entities in this domain, e.g. 'light', 'sensor'"),
      include_disabled: z.boolean().optional().describe("Include disabled entities (default true)"),
    },
    async ({ domain, include_disabled }) => {
      try {
        const list = (await ws.command("config/entity_registry/list")) as RegistryEntity[];
        let rows = list;
        if (domain) rows = rows.filter((e) => domainOf(e.entity_id) === domain);
        if (include_disabled === false) rows = rows.filter((e) => !e.disabled_by);
        const entities = rows.map((e) => ({
          entity_id: e.entity_id,
          name: e.name ?? e.original_name ?? null,
          platform: e.platform ?? null,
          area_id: e.area_id ?? null,
          device_id: e.device_id ?? null,
          entity_category: e.entity_category ?? null,
          disabled_by: e.disabled_by ?? null,
          hidden_by: e.hidden_by ?? null,
        }));
        return ok({ count: entities.length, entities });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "rename_entity",
    "Rename an entity in the entity registry via the WebSocket API (config/entity_registry/update). Set 'name' to override the friendly name (pass null to revert to the integration's original_name) and/or 'new_entity_id' to change the entity_id itself (must keep the same domain). At least one of name or new_entity_id is required. This edits registry config only — it does not control any device. Returns the updated entity_entry.",
    {
      entity_id: z
        .string()
        .describe("Current entity_id to rename, e.g. 'cover.storen_wohnzimmer_links'"),
      name: z
        .string()
        .nullable()
        .optional()
        .describe("New friendly name; null reverts to the integration's original_name"),
      new_entity_id: z
        .string()
        .optional()
        .describe("New entity_id; must keep the same domain, e.g. 'cover.wohnzimmer_links'"),
    },
    async ({ entity_id, name, new_entity_id }) => {
      try {
        if (name === undefined && new_entity_id === undefined) {
          throw new Error("Provide at least one of 'name' or 'new_entity_id' to rename the entity");
        }
        if (new_entity_id !== undefined && domainOf(new_entity_id) !== domainOf(entity_id)) {
          throw new Error(
            `new_entity_id must stay in the '${domainOf(entity_id)}' domain (got '${new_entity_id}')`,
          );
        }
        const payload: Record<string, unknown> = { entity_id };
        if (name !== undefined) payload.name = name;
        if (new_entity_id !== undefined) payload.new_entity_id = new_entity_id;
        return ok(await ws.command("config/entity_registry/update", payload));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "list_devices",
    "List devices from the device registry via the WebSocket API (id, name, manufacturer, model, area_id). Useful for grouping entities by physical device when writing automations.",
    {},
    async () => {
      try {
        const list = (await ws.command("config/device_registry/list")) as RegistryDevice[];
        const devices = list.map((d) => ({
          id: d.id,
          name: d.name_by_user ?? d.name ?? null,
          manufacturer: d.manufacturer ?? null,
          model: d.model ?? null,
          area_id: d.area_id ?? null,
        }));
        return ok({ count: devices.length, devices });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "list_areas",
    "List areas from the area registry via the WebSocket API (area_id, name, floor_id, icon). Areas group devices and entities by room or location.",
    {},
    async () => {
      try {
        return ok(await ws.command("config/area_registry/list"));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "list_labels",
    "List labels from the label registry via the WebSocket API (label_id, name, color, icon). Labels are cross-cutting tags applied to entities, devices and areas.",
    {},
    async () => {
      try {
        return ok(await ws.command("config/label_registry/list"));
      } catch (e) {
        return err(e);
      }
    },
  );
}
