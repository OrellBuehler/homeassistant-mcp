import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, domainOf, type HassState } from "../hass/format.js";
import type { HassClient } from "../hass/rest.js";
import type { HassWsClient } from "../hass/ws.js";

interface TraceTarget {
  domain: string;
  item_id: string;
}

interface TraceSummary {
  run_id?: string;
  state?: string;
  script_execution?: string;
  last_step?: string;
  error?: string;
  timestamp?: { start?: string; finish?: string };
}

async function resolveTarget(entityId: string, client: HassClient): Promise<TraceTarget> {
  const domain = domainOf(entityId);
  if (domain !== "automation" && domain !== "script") {
    throw new Error(
      `Traces are only available for automation.* or script.* entities, got ${entityId}`,
    );
  }
  if (domain === "script") {
    const objectId = entityId.slice("script.".length);
    if (!objectId) {
      throw new Error(`Invalid script entity id: ${entityId}`);
    }
    return { domain, item_id: objectId };
  }
  const state = (await client.fetch(`/api/states/${encodeURIComponent(entityId)}`)) as HassState;
  const id = state.attributes?.id;
  if (id === undefined || id === null || id === "") {
    throw new Error(
      `Automation ${entityId} has no 'id' attribute, so Home Assistant stores no traces for it`,
    );
  }
  return { domain, item_id: String(id) };
}

function startMs(t: TraceSummary): number {
  const s = t.timestamp?.start;
  return s ? Date.parse(s) : 0;
}

export function registerTraceTools(server: McpServer, ws: HassWsClient, client: HassClient) {
  server.tool(
    "list_traces",
    "List recent execution traces (newest first) for an automation or script via the WebSocket trace API — to debug whether and how it ran. Each summary has run_id, state, script_execution (finished/error/aborted/cancelled/…), last_step and any error. Use get_trace with a run_id for the full step-by-step trace.",
    { entity_id: z.string().describe("An automation.* or script.* entity id") },
    async ({ entity_id }) => {
      try {
        const { domain, item_id } = await resolveTarget(entity_id, client);
        const list = ((await ws.command("trace/list", { domain, item_id })) ??
          []) as TraceSummary[];
        const traces = [...list]
          .sort((a, b) => startMs(b) - startMs(a))
          .map((t) => {
            const row: Record<string, unknown> = {
              run_id: t.run_id,
              state: t.state,
              script_execution: t.script_execution,
              last_step: t.last_step,
              timestamp: t.timestamp,
            };
            if (t.error !== undefined) row.error = t.error;
            return row;
          });
        return ok({ entity_id, domain, item_id, count: traces.length, traces });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "get_trace",
    "Get the full execution trace for one run of an automation or script: the per-step path with each step's result, the config, variables, context and any error. Find run_id with list_traces.",
    {
      entity_id: z.string().describe("An automation.* or script.* entity id"),
      run_id: z.string().describe("Run id from list_traces"),
    },
    async ({ entity_id, run_id }) => {
      try {
        const { domain, item_id } = await resolveTarget(entity_id, client);
        return ok(await ws.command("trace/get", { domain, item_id, run_id }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "get_trace_contexts",
    "Map Home Assistant context ids to the trace run that produced them for an automation or script (trace/contexts) — useful for tracing causality, e.g. which automation run triggered another.",
    { entity_id: z.string().describe("An automation.* or script.* entity id") },
    async ({ entity_id }) => {
      try {
        const { domain, item_id } = await resolveTarget(entity_id, client);
        return ok(await ws.command("trace/contexts", { domain, item_id }));
      } catch (e) {
        return err(e);
      }
    },
  );
}
