import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../hass/format.js";
import type { HassClient } from "../hass/rest.js";

const RELOAD_TARGETS: Record<string, { domain: string; service: string }> = {
  all: { domain: "homeassistant", service: "reload_all" },
  core: { domain: "homeassistant", service: "reload_core_config" },
  automation: { domain: "automation", service: "reload" },
  script: { domain: "script", service: "reload" },
  scene: { domain: "scene", service: "reload" },
  template: { domain: "template", service: "reload" },
  group: { domain: "group", service: "reload" },
  zone: { domain: "zone", service: "reload" },
  person: { domain: "person", service: "reload" },
  timer: { domain: "timer", service: "reload" },
  schedule: { domain: "schedule", service: "reload" },
  counter: { domain: "counter", service: "reload" },
  input_boolean: { domain: "input_boolean", service: "reload" },
  input_number: { domain: "input_number", service: "reload" },
  input_select: { domain: "input_select", service: "reload" },
  input_text: { domain: "input_text", service: "reload" },
  input_datetime: { domain: "input_datetime", service: "reload" },
  input_button: { domain: "input_button", service: "reload" },
  rest_command: { domain: "rest_command", service: "reload" },
  command_line: { domain: "command_line", service: "reload" },
  mqtt: { domain: "mqtt", service: "reload" },
};

const targets = Object.keys(RELOAD_TARGETS) as [string, ...string[]];

export function registerReloadTools(server: McpServer, client: HassClient) {
  server.tool(
    "reload",
    "Reload a reloadable Home Assistant domain so YAML edits take effect without a full restart. Restricted to a fixed allowlist of safe reload services — it cannot control devices. Use 'all' (homeassistant.reload_all) to reload everything reloadable, or 'core' (homeassistant.reload_core_config) for core config like customize. Run check_config first.",
    {
      target: z.enum(targets).describe(`What to reload. One of: ${targets.join(", ")}`),
    },
    async ({ target }) => {
      try {
        const { domain, service } = RELOAD_TARGETS[target];
        const result = await client.fetch(`/api/services/${domain}/${service}`, { method: "POST" });
        return ok({ reloaded: target, service: `${domain}.${service}`, result });
      } catch (e) {
        return err(e);
      }
    },
  );
}
