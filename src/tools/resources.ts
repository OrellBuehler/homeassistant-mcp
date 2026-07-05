import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../hass/format.js";
import type { HassWsClient } from "../hass/ws.js";

const resType = z
  .enum(["module", "css", "js", "html"])
  .describe(
    "Resource type. Lovelace cards use 'module'; 'css' for stylesheets. Rarely 'js'/'html'.",
  );

export function registerResourceTools(server: McpServer, ws: HassWsClient) {
  server.tool(
    "list_lovelace_resources",
    "List registered Lovelace (dashboard) resources (lovelace/resources) — the JS/CSS URLs, e.g. /hacsfiles/… bundles, loaded into every dashboard. Each item has an id (use it with update/delete), a type (module/css/js/html) and a url. Only works when the resource registry is in storage mode (lovelace: mode: storage); it is disabled if Lovelace is globally in YAML mode.",
    {},
    async () => {
      try {
        return ok(await ws.command("lovelace/resources"));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "create_lovelace_resource",
    "Register a new Lovelace resource (lovelace/resources/create) so a card bundle/stylesheet loads on every dashboard. Config authoring (like adding it under Settings → Dashboards → Resources); requires an admin token and storage-mode resources. Returns the created resource incl. its new id.",
    {
      url: z
        .string()
        .describe(
          "Resource URL, e.g. '/hacsfiles/my-card/my-card.js' or '/local/aurora-cards.js'.",
        ),
      res_type: resType.optional().describe("Defaults to 'module' (the type Lovelace cards use)."),
    },
    async ({ url, res_type }) => {
      try {
        return ok(
          await ws.command("lovelace/resources/create", { url, res_type: res_type ?? "module" }),
        );
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "update_lovelace_resource",
    "Update an existing Lovelace resource (lovelace/resources/update) — change its url and/or type. Config authoring; requires an admin token and storage-mode resources. Get the resource_id from list_lovelace_resources.",
    {
      resource_id: z.string().describe("The resource id from list_lovelace_resources."),
      url: z.string().optional().describe("New URL. Omit to keep the current one."),
      res_type: resType.optional().describe("New type. Omit to keep the current one."),
    },
    async ({ resource_id, url, res_type }) => {
      try {
        const payload: Record<string, unknown> = { resource_id };
        if (url !== undefined) payload.url = url;
        if (res_type !== undefined) payload.res_type = res_type;
        return ok(await ws.command("lovelace/resources/update", payload));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "delete_lovelace_resource",
    "Delete a Lovelace resource (lovelace/resources/delete) by id — removes the JS/CSS URL from every dashboard. Config authoring; requires an admin token and storage-mode resources. Use this to clear the dangling /hacsfiles/… resource left behind after remove_hacs_repository. Get the resource_id from list_lovelace_resources.",
    {
      resource_id: z.string().describe("The resource id from list_lovelace_resources."),
    },
    async ({ resource_id }) => {
      try {
        await ws.command("lovelace/resources/delete", { resource_id });
        return ok({ resource_id, deleted: true });
      } catch (e) {
        return err(e);
      }
    },
  );
}
