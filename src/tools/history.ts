import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildQS, ok, err } from "../hass/format.js";
import type { HassClient } from "../hass/rest.js";

export function registerHistoryTools(server: McpServer, client: HassClient) {
  server.tool(
    "get_history",
    "Get state history for one or more entities (GET /api/history/period). Returns arrays of past state changes — useful for understanding how an entity behaves before writing triggers and conditions.",
    {
      entity_id: z
        .string()
        .describe("Entity ID, or a comma-separated list of entity IDs, to fetch history for"),
      start: z
        .string()
        .optional()
        .describe(
          "ISO 8601 start timestamp, e.g. '2026-06-01T00:00:00'. Defaults to 1 day ago on the HA side.",
        ),
      end: z.string().optional().describe("ISO 8601 end timestamp"),
      minimal_response: z
        .boolean()
        .optional()
        .describe("Return only last_changed and state for most entries (smaller payload)"),
      significant_changes_only: z
        .boolean()
        .optional()
        .describe("Only return significant state changes"),
      no_attributes: z.boolean().optional().describe("Omit attributes from the response"),
    },
    async ({
      entity_id,
      start,
      end,
      minimal_response,
      significant_changes_only,
      no_attributes,
    }) => {
      try {
        const base = start
          ? `/api/history/period/${encodeURIComponent(start)}`
          : "/api/history/period";
        const qs = buildQS({
          filter_entity_id: entity_id,
          end_time: end,
          minimal_response: minimal_response ? true : undefined,
          significant_changes_only: significant_changes_only ? true : undefined,
          no_attributes: no_attributes ? true : undefined,
        });
        return ok(await client.fetch(`${base}${qs}`));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "get_logbook",
    "Get logbook entries — human-readable events such as state changes and automation triggers (GET /api/logbook). Useful for seeing what happened and when.",
    {
      entity_id: z.string().optional().describe("Limit to a single entity"),
      start: z
        .string()
        .optional()
        .describe("ISO 8601 start timestamp. Defaults to 1 day ago on the HA side."),
      end: z.string().optional().describe("ISO 8601 end timestamp"),
    },
    async ({ entity_id, start, end }) => {
      try {
        const base = start ? `/api/logbook/${encodeURIComponent(start)}` : "/api/logbook";
        const qs = buildQS({ entity: entity_id, end_time: end });
        return ok(await client.fetch(`${base}${qs}`));
      } catch (e) {
        return err(e);
      }
    },
  );
}
