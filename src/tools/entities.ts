import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, summarizeState, domainOf, type HassState } from "../hass/format.js";
import type { HassClient } from "../hass/rest.js";

export function registerEntityTools(server: McpServer, client: HassClient) {
  server.tool(
    "list_entities",
    "List entities with their current state as a compact summary (entity_id, state, friendly_name, device_class, unit). Use get_entity for full attributes. Optionally filter by domain and/or a search substring matched against entity_id and friendly_name.",
    {
      domain: z
        .string()
        .optional()
        .describe("Only entities in this domain, e.g. 'light', 'sensor', 'binary_sensor'"),
      search: z
        .string()
        .optional()
        .describe("Case-insensitive substring matched against entity_id and friendly_name"),
    },
    async ({ domain, search }) => {
      try {
        const states = (await client.fetch("/api/states")) as HassState[];
        let rows = states;
        if (domain) rows = rows.filter((s) => domainOf(s.entity_id) === domain);
        if (search) {
          const q = search.toLowerCase();
          rows = rows.filter(
            (s) =>
              s.entity_id.toLowerCase().includes(q) ||
              String(s.attributes?.friendly_name ?? "")
                .toLowerCase()
                .includes(q),
          );
        }
        return ok({ count: rows.length, entities: rows.map(summarizeState) });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "get_entity",
    "Get the full state object for a single entity, including all attributes, last_changed and last_updated.",
    { entity_id: z.string().describe("Entity ID, e.g. 'light.kitchen'") },
    async ({ entity_id }) => {
      try {
        return ok(await client.fetch(`/api/states/${encodeURIComponent(entity_id)}`));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "list_domains",
    "List the distinct entity domains present on this instance with a count of entities in each. Useful for discovering what kinds of entities exist before drilling in with list_entities.",
    {},
    async () => {
      try {
        const states = (await client.fetch("/api/states")) as HassState[];
        const counts = new Map<string, number>();
        for (const s of states) {
          const d = domainOf(s.entity_id);
          counts.set(d, (counts.get(d) ?? 0) + 1);
        }
        const domains = [...counts.entries()]
          .map(([domain, count]) => ({ domain, count }))
          .sort((a, b) => a.domain.localeCompare(b.domain));
        return ok({ count: domains.length, domains });
      } catch (e) {
        return err(e);
      }
    },
  );
}
