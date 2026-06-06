import { HassClient } from "./hass/rest.js";
import { HassWsClient } from "./hass/ws.js";

const rawUrl = (process.env.HASS_URL || process.env.HASS_SERVER || "").trim();
const token = (process.env.HASS_TOKEN || "").trim();

if (!rawUrl || !token) {
  console.error(
    "HASS_URL (or HASS_SERVER) and HASS_TOKEN environment variables are required. " +
      "HASS_TOKEN must be a Home Assistant long-lived access token.",
  );
  process.exit(1);
}

function normalizeBaseUrl(url: string): string {
  const withScheme = /^https?:\/\//i.test(url) ? url : `http://${url}`;
  return withScheme.replace(/\/+$/, "");
}

export function deriveWsUrl(baseUrl: string): string {
  const ws = baseUrl.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
  return `${ws}/api/websocket`;
}

const baseUrl = normalizeBaseUrl(rawUrl);

export const config = {
  baseUrl,
  wsUrl: deriveWsUrl(baseUrl),
  token,
  transport: "stdio" as const,
};

export const client = new HassClient(baseUrl, token);
export const wsClient = new HassWsClient(config.wsUrl, token);
