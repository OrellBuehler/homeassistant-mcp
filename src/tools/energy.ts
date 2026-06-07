import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err, type HassState } from "../hass/format.js";
import type { HassClient } from "../hass/rest.js";
import type { HassWsClient } from "../hass/ws.js";

type EnergySource = Record<string, unknown>;

interface DeviceConsumption {
  stat_consumption: string;
  name?: string;
  included_in_stat?: string;
  stat_rate?: string;
}

interface EnergyPreferences {
  energy_sources: EnergySource[];
  device_consumption: DeviceConsumption[];
  device_consumption_water?: DeviceConsumption[];
}

const ENERGY_UNITS = new Set([
  "Wh",
  "kWh",
  "MWh",
  "GWh",
  "TWh",
  "mWh",
  "J",
  "kJ",
  "MJ",
  "GJ",
  "cal",
  "kcal",
  "Mcal",
  "Gcal",
]);

const show = (v: unknown) => (v === undefined || v === null ? "missing" : String(v));

async function getPrefs(ws: HassWsClient): Promise<EnergyPreferences> {
  try {
    return (await ws.command("energy/get_prefs")) as EnergyPreferences;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ERR_NOT_FOUND" || /no prefs/i.test(String(e))) {
      return { energy_sources: [], device_consumption: [] };
    }
    throw e;
  }
}

function eligibilityReasons(state: HassState | undefined, id: string): string[] {
  if (!state) return [`${id} not found in current states`];
  const a = (state.attributes ?? {}) as Record<string, unknown>;
  const reasons: string[] = [];
  if (a.device_class !== "energy") {
    reasons.push(`device_class is ${show(a.device_class)} (expected energy)`);
  }
  if (a.state_class !== "total" && a.state_class !== "total_increasing") {
    reasons.push(`state_class is ${show(a.state_class)} (expected total or total_increasing)`);
  }
  const unit = a.unit_of_measurement;
  if (typeof unit !== "string" || !ENERGY_UNITS.has(unit)) {
    reasons.push(`unit is ${show(unit)} (expected an energy unit such as kWh)`);
  }
  return reasons;
}

export function registerEnergyTools(server: McpServer, ws: HassWsClient, client: HassClient) {
  server.tool(
    "get_energy_prefs",
    "Get the current Energy dashboard preferences (EnergyPreferences) over the WebSocket API: energy_sources (grid/solar/battery/gas/water) and the device_consumption list shown under 'Individual devices'. Returns an empty object if energy has not been configured yet.",
    {},
    async () => {
      try {
        return ok(await getPrefs(ws));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "save_energy_prefs",
    "Overwrite Energy dashboard preferences via energy/save_prefs (requires an admin token). Each provided key (energy_sources, device_consumption, device_consumption_water) replaces that key server-side; omitted keys are left untouched. Prefer get_energy_prefs first and send back a modified object (read-modify-write). For the common cases use add_energy_devices / remove_energy_devices / set_energy_grid_source / set_energy_solar_source instead.",
    {
      prefs: z
        .object({
          energy_sources: z.array(z.record(z.unknown())).optional(),
          device_consumption: z.array(z.record(z.unknown())).optional(),
          device_consumption_water: z.array(z.record(z.unknown())).optional(),
        })
        .describe("Partial or full EnergyPreferences object to write"),
    },
    async ({ prefs }) => {
      try {
        return ok(await ws.command("energy/save_prefs", prefs));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "add_energy_devices",
    "Append entities to the Energy dashboard 'Individual devices' list (device_consumption), deduping by stat_consumption and preserving energy_sources. Optionally warns about entities that are not valid energy statistics (need device_class energy, state_class total/total_increasing and an energy unit) but still adds them. Returns the added/skipped ids, any warnings, and the resulting device_consumption.",
    {
      entity_ids: z
        .array(z.string())
        .describe("Entity ids to add as device_consumption stats, e.g. ['sensor.fridge_energy']"),
      names: z
        .array(z.string())
        .optional()
        .describe("Optional display names, aligned by index with entity_ids"),
    },
    async ({ entity_ids, names }) => {
      try {
        const prefs = await getPrefs(ws);
        const existing = prefs.device_consumption ?? [];
        const present = new Set(existing.map((d) => d.stat_consumption));

        let statesById: Map<string, HassState> | null = null;
        try {
          const states = (await client.fetch("/api/states")) as HassState[];
          statesById = new Map(states.map((s) => [s.entity_id, s]));
        } catch {
          statesById = null;
        }

        const warnings: { entity_id: string; reasons: string[] }[] = [];
        if (statesById) {
          for (const id of entity_ids) {
            const reasons = eligibilityReasons(statesById.get(id), id);
            if (reasons.length) warnings.push({ entity_id: id, reasons });
          }
        }

        const added: string[] = [];
        const skipped: string[] = [];
        const next = [...existing];
        entity_ids.forEach((id, i) => {
          if (present.has(id)) {
            skipped.push(id);
            return;
          }
          present.add(id);
          const entry: DeviceConsumption = { stat_consumption: id };
          const name = names?.[i];
          if (name) entry.name = name;
          next.push(entry);
          added.push(id);
        });

        const updated = (await ws.command("energy/save_prefs", {
          device_consumption: next,
        })) as EnergyPreferences;
        return ok({ added, skipped, warnings, device_consumption: updated.device_consumption });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "remove_energy_devices",
    "Remove entities from the Energy dashboard 'Individual devices' list (device_consumption) by matching stat_consumption, preserving energy_sources. Returns the removed ids and the resulting device_consumption.",
    {
      entity_ids: z.array(z.string()).describe("Entity ids to remove from device_consumption"),
    },
    async ({ entity_ids }) => {
      try {
        const prefs = await getPrefs(ws);
        const remove = new Set(entity_ids);
        const existing = prefs.device_consumption ?? [];
        const removed = existing
          .filter((d) => remove.has(d.stat_consumption))
          .map((d) => d.stat_consumption);
        const next = existing.filter((d) => !remove.has(d.stat_consumption));
        const updated = (await ws.command("energy/save_prefs", {
          device_consumption: next,
        })) as EnergyPreferences;
        return ok({ removed, device_consumption: updated.device_consumption });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "validate_energy_prefs",
    "Run Home Assistant's energy/validate against the current preferences and return per-item issues. device_consumption, device_consumption_water and energy_sources issues are correlated with their stat_consumption / source so you can see which entity each issue belongs to. Includes the raw validation result.",
    {},
    async () => {
      try {
        const prefs = await getPrefs(ws);
        const result = (await ws.command("energy/validate")) as {
          energy_sources?: unknown[][];
          device_consumption?: unknown[][];
          device_consumption_water?: unknown[][];
        };
        const device_consumption = (result.device_consumption ?? [])
          .map((issues, i) => ({
            stat_consumption: prefs.device_consumption?.[i]?.stat_consumption ?? null,
            issues,
          }))
          .filter((d) => Array.isArray(d.issues) && d.issues.length > 0);
        const device_consumption_water = (result.device_consumption_water ?? [])
          .map((issues, i) => ({
            stat_consumption: prefs.device_consumption_water?.[i]?.stat_consumption ?? null,
            issues,
          }))
          .filter((d) => Array.isArray(d.issues) && d.issues.length > 0);
        const energy_sources = (result.energy_sources ?? [])
          .map((issues, i) => ({ source: prefs.energy_sources?.[i] ?? null, issues }))
          .filter((s) => Array.isArray(s.issues) && s.issues.length > 0);
        return ok({ device_consumption, device_consumption_water, energy_sources, raw: result });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "set_energy_grid_source",
    "Set the single grid source of the Energy dashboard (unified model: import/export stats plus optional cost/price stats), merging onto the existing grid source (unspecified fields are kept) and preserving all other energy_sources and device_consumption. Adds a grid source if none exists; cost_adjustment_day defaults to 0. To clear a field, use save_energy_prefs.",
    {
      stat_energy_from: z
        .string()
        .optional()
        .describe("Statistic for energy imported from the grid"),
      stat_energy_to: z.string().optional().describe("Statistic for energy returned to the grid"),
      stat_cost: z.string().optional().describe("Statistic tracking import cost"),
      entity_energy_price: z.string().optional().describe("Entity providing the import price"),
      number_energy_price: z.number().optional().describe("Fixed import price per unit"),
      stat_compensation: z.string().optional().describe("Statistic tracking export compensation"),
      entity_energy_price_export: z
        .string()
        .optional()
        .describe("Entity providing the export price"),
      number_energy_price_export: z.number().optional().describe("Fixed export price per unit"),
      cost_adjustment_day: z.number().optional().describe("Daily cost adjustment (default 0)"),
      stat_rate: z.string().optional().describe("Statistic tracking the current grid energy rate"),
      power_config: z
        .object({
          stat_rate: z.string().optional(),
          stat_rate_inverted: z.string().optional(),
          stat_rate_from: z.string().optional(),
          stat_rate_to: z.string().optional(),
        })
        .optional()
        .describe("Live power-flow config; provide exactly one method"),
    },
    async (args) => {
      try {
        const prefs = await getPrefs(ws);
        const sources = prefs.energy_sources ?? [];
        const idx = sources.findIndex((s) => s.type === "grid");
        const grid: EnergySource = { ...(idx >= 0 ? sources[idx] : {}), ...args, type: "grid" };
        if (grid.cost_adjustment_day === undefined || grid.cost_adjustment_day === null) {
          grid.cost_adjustment_day = 0;
        }
        const next = idx >= 0 ? sources.map((s, i) => (i === idx ? grid : s)) : [...sources, grid];
        return ok(await ws.command("energy/save_prefs", { energy_sources: next }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "set_energy_solar_source",
    "Add or update a solar production source on the Energy dashboard, upserting by stat_energy_from (unspecified fields on an existing source are kept) and preserving all other energy_sources and device_consumption.",
    {
      stat_energy_from: z.string().describe("Statistic for solar energy production"),
      config_entry_solar_forecast: z
        .array(z.string())
        .optional()
        .describe("Config entry ids providing a solar production forecast"),
      stat_rate: z.string().optional().describe("Statistic tracking the current solar energy rate"),
    },
    async (args) => {
      try {
        const prefs = await getPrefs(ws);
        const sources = prefs.energy_sources ?? [];
        const idx = sources.findIndex(
          (s) => s.type === "solar" && s.stat_energy_from === args.stat_energy_from,
        );
        const solar: EnergySource = { ...(idx >= 0 ? sources[idx] : {}), ...args, type: "solar" };
        const next =
          idx >= 0 ? sources.map((s, i) => (i === idx ? solar : s)) : [...sources, solar];
        return ok(await ws.command("energy/save_prefs", { energy_sources: next }));
      } catch (e) {
        return err(e);
      }
    },
  );
}
