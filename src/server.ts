import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HassClient } from "./hass/rest.js";
import type { HassWsClient } from "./hass/ws.js";
import { registerEntityTools } from "./tools/entities.js";
import { registerServiceTools } from "./tools/services.js";
import { registerSystemTools } from "./tools/system.js";
import { registerTemplateTools } from "./tools/templates.js";
import { registerHistoryTools } from "./tools/history.js";
import { registerReloadTools } from "./tools/reload.js";
import { registerRegistryTools } from "./tools/registry.js";
import { registerEnergyTools } from "./tools/energy.js";
import { registerTraceTools } from "./tools/trace.js";
import { registerZhaTools } from "./tools/zha.js";

export function createServer(client: HassClient, wsClient: HassWsClient): McpServer {
  const server = new McpServer({ name: "homeassistant-mcp", version: "0.5.1" });
  registerEntityTools(server, client);
  registerServiceTools(server, client);
  registerSystemTools(server, client);
  registerTemplateTools(server, client);
  registerHistoryTools(server, client);
  registerReloadTools(server, client);
  registerRegistryTools(server, wsClient);
  registerEnergyTools(server, wsClient, client);
  registerTraceTools(server, wsClient, client);
  registerZhaTools(server, wsClient);
  return server;
}
