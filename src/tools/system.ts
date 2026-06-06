import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../hass/format.js";
import type { HassClient } from "../hass/rest.js";

export function registerSystemTools(server: McpServer, client: HassClient) {
  server.tool(
    "get_config",
    "Get the running Home Assistant configuration: version, location, unit system, time zone, currency, config directory, and the list of loaded components/integrations. Also serves as a connectivity/token check.",
    {},
    async () => {
      try {
        return ok(await client.fetch("/api/config"));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "check_config",
    "Validate the Home Assistant YAML configuration currently on the server (POST /api/config/core/check_config). Returns { result: 'valid' | 'invalid', errors }. Requires the 'config' integration (included in default_config). Run this after editing YAML and before reloading or restarting.",
    {},
    async () => {
      try {
        return ok(await client.fetch("/api/config/core/check_config", { method: "POST" }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "get_error_log",
    "Get the Home Assistant error log as plain text. Returns the most recent lines (default 100). Useful for diagnosing why a config or automation failed to load.",
    {
      lines: z
        .number()
        .int()
        .optional()
        .describe("Number of trailing lines to return (default 100; use 0 for the full log)"),
    },
    async ({ lines }) => {
      try {
        const text = await client.fetchText("/api/error_log");
        const n = lines ?? 100;
        if (n > 0) {
          return ok(text.split("\n").slice(-n).join("\n"));
        }
        return ok(text);
      } catch (e) {
        return err(e);
      }
    },
  );
}
