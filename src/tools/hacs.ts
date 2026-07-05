import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../hass/format.js";
import type { HassWsClient } from "../hass/ws.js";

interface HacsRepository {
  id: string;
  name?: string;
  full_name?: string;
  category?: string;
  installed?: boolean;
  installed_version?: string;
  available_version?: string;
  local_path?: string;
  file_name?: string;
  domain?: string;
  pending_upgrade?: boolean;
}

function summarize(r: HacsRepository) {
  return {
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    category: r.category,
    installed_version: r.installed_version,
    available_version: r.available_version,
    pending_upgrade: r.pending_upgrade,
    local_path: r.local_path,
    file_name: r.file_name,
    domain: r.domain,
  };
}

export function registerHacsTools(server: McpServer, ws: HassWsClient) {
  server.tool(
    "list_hacs_repositories",
    "List HACS repositories (hacs/repositories/list) — the frontend plugins, integrations and themes HACS manages. Defaults to installed-only, trimmed to the useful fields (id, name, full_name, category, versions, local_path, file_name, domain). Use the returned id with remove_hacs_repository. For a frontend plugin, local_path/file_name tell you which /hacsfiles/… Lovelace resource points at it (see list_lovelace_resources), so you can delete the dangling resource after removing the plugin.",
    {
      installed_only: z
        .boolean()
        .optional()
        .describe(
          "Only repositories that are installed. Default true; set false to include the whole known store (large).",
        ),
      category: z
        .string()
        .optional()
        .describe(
          "Filter by HACS category, e.g. 'integration', 'plugin', 'theme'. Omit for all categories.",
        ),
    },
    async ({ installed_only, category }) => {
      try {
        const payload = category ? { categories: [category] } : {};
        const repos = (await ws.command("hacs/repositories/list", payload)) as HacsRepository[];
        const filtered = installed_only === false ? repos : repos.filter((r) => r.installed);
        const repositories = filtered.map(summarize);
        return ok({ count: repositories.length, repositories });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "remove_hacs_repository",
    "Uninstall a HACS repository by id (hacs/repository/remove) — deletes its downloaded files from the config (for a plugin, the JS under www/community/…) and unregisters it from HACS. Requires an admin token. When HACS manages resources (storage mode) it also removes the plugin's /hacsfiles/… Lovelace resource for you; verify with list_lovelace_resources and use delete_lovelace_resource only if one is left behind. Get the id from list_hacs_repositories. Removing an installed integration you still reference in YAML will break that config, so confirm nothing uses it first.",
    {
      repository_id: z
        .string()
        .describe(
          "The repository id from list_hacs_repositories (a numeric string, e.g. '172733314').",
        ),
    },
    async ({ repository_id }) => {
      try {
        await ws.command("hacs/repository/remove", { repository: repository_id });
        return ok({ repository_id, removed: true });
      } catch (e) {
        return err(e);
      }
    },
  );
}
