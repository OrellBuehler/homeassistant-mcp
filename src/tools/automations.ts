import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, type HassState } from "../hass/format.js";
import type { HassClient } from "../hass/rest.js";

async function resolveId(automation: string, client: HassClient): Promise<string> {
  if (!automation.startsWith("automation.")) return automation;
  const state = (await client.fetch(`/api/states/${encodeURIComponent(automation)}`)) as HassState;
  const id = state.attributes?.id;
  if (id === undefined || id === null || id === "") {
    throw new Error(
      `Automation ${automation} has no 'id' attribute, so it is not stored in automations.yaml and cannot be read or edited via the config API (it is defined elsewhere in YAML without an id)`,
    );
  }
  return String(id);
}

const configPath = (id: string) => `/api/config/automation/config/${encodeURIComponent(id)}`;

export function registerAutomationTools(server: McpServer, client: HassClient) {
  server.tool(
    "get_automation_config",
    "Get the stored configuration of an automation (alias, description, triggers, conditions, actions, mode) from automations.yaml via GET /api/config/automation/config/{id}. Accepts the automation.* entity id (the internal id is resolved automatically) or the internal id itself. Only automations with an 'id' (UI-created, stored in automations.yaml) are accessible.",
    {
      automation: z
        .string()
        .describe("automation.* entity id, or the automation's internal id (the 'id' attribute)"),
    },
    async ({ automation }) => {
      try {
        const id = await resolveId(automation, client);
        return ok(await client.fetch(configPath(id)));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "upsert_automation",
    "Create a new automation or replace an existing one via POST /api/config/automation/config/{id} (requires an admin token). Home Assistant validates the config, writes it to automations.yaml and reloads automations automatically — no separate reload needed. The config REPLACES the stored one entirely, so to edit call get_automation_config first and send back the modified object. Omit 'automation' to create a new one (an id is generated and returned); its entity id becomes automation.<slugified alias>. Note that once its triggers fire, an automation runs its actions — review the config before writing.",
    {
      config: z
        .record(z.unknown())
        .describe(
          "Full automation config as stored in automations.yaml: alias, description?, triggers, conditions?, actions, mode? (the legacy singular trigger/condition/action keys are also accepted)",
        ),
      automation: z
        .string()
        .optional()
        .describe(
          "Existing automation.* entity id or internal id to replace; omit to create a new automation",
        ),
    },
    async ({ config, automation }) => {
      try {
        const id = automation ? await resolveId(automation, client) : String(Date.now());
        const result = await client.fetch(configPath(id), {
          method: "POST",
          body: JSON.stringify(config),
        });
        return ok({ id, created: !automation, result });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "delete_automation",
    "Delete an automation from automations.yaml via DELETE /api/config/automation/config/{id} (requires an admin token). Accepts the automation.* entity id or the internal id. Only UI-managed automations (those stored in automations.yaml) can be deleted; Home Assistant reloads automations automatically afterwards.",
    {
      automation: z
        .string()
        .describe("automation.* entity id, or the automation's internal id (the 'id' attribute)"),
    },
    async ({ automation }) => {
      try {
        const id = await resolveId(automation, client);
        return ok(await client.fetch(configPath(id), { method: "DELETE" }));
      } catch (e) {
        return err(e);
      }
    },
  );
}
