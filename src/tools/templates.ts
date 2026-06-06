import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../hass/format.js";
import type { HassClient } from "../hass/rest.js";

export function registerTemplateTools(server: McpServer, client: HassClient) {
  server.tool(
    "render_template",
    "Render a Home Assistant Jinja2 template against live state and return the result as text (POST /api/template). Use this to develop and debug template sensors, template conditions, and automation templates, e.g. \"{{ states('sensor.temperature') | float > 20 }}\". Read-only: HA renders without side effects.",
    {
      template: z
        .string()
        .describe("Jinja2 template string, e.g. \"{{ states('sensor.temperature') }}\""),
      variables: z
        .record(z.unknown())
        .optional()
        .describe("Optional variables made available to the template"),
    },
    async ({ template, variables }) => {
      try {
        const body = JSON.stringify(variables ? { template, variables } : { template });
        return ok(await client.fetchText("/api/template", { method: "POST", body }));
      } catch (e) {
        return err(e);
      }
    },
  );
}
