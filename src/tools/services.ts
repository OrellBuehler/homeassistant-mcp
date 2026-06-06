import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../hass/format.js";
import type { HassClient } from "../hass/rest.js";

interface ServiceDomain {
  domain: string;
  services: Record<string, unknown>;
}

export function registerServiceTools(server: McpServer, client: HassClient) {
  server.tool(
    "list_services",
    "List services that can be called — the actions available in automations and scripts. With no domain, returns a compact map of domain -> service names. Pass a domain to get full detail (description, fields, target, selectors) for that domain's services.",
    {
      domain: z
        .string()
        .optional()
        .describe(
          "Only this domain, e.g. 'light', 'notify', 'automation'. Returns full field/target detail when set.",
        ),
    },
    async ({ domain }) => {
      try {
        const data = (await client.fetch("/api/services")) as ServiceDomain[];
        if (domain) {
          const entry = data.find((d) => d.domain === domain);
          return ok(entry ?? { domain, services: {} });
        }
        const domains = data
          .map((d) => ({ domain: d.domain, services: Object.keys(d.services ?? {}) }))
          .sort((a, b) => a.domain.localeCompare(b.domain));
        return ok({ count: domains.length, domains });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "list_events",
    "List the event types the instance is currently listening for, with listener counts. Useful for discovering events to use as automation triggers (the 'event' trigger platform).",
    {},
    async () => {
      try {
        return ok(await client.fetch("/api/events"));
      } catch (e) {
        return err(e);
      }
    },
  );
}
