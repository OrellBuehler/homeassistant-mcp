import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerEnergyTools } from "../tools/energy.js";
import { HassClient } from "../hass/rest.js";

type ToolHandler = (args: any) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function makeWs(initialPrefs: any, opts: { validate?: any } = {}) {
  let current = initialPrefs;
  const saved: any[] = [];
  const command = vi.fn(async (type: string, body: any = {}) => {
    if (type === "energy/get_prefs") {
      if (current == null) throw new Error("Home Assistant WebSocket error: No prefs");
      return current;
    }
    if (type === "energy/save_prefs") {
      saved.push(body);
      current = { ...current, ...body };
      return current;
    }
    if (type === "energy/validate") {
      return (
        opts.validate ?? {
          energy_sources: [],
          device_consumption: [],
          device_consumption_water: [],
        }
      );
    }
    throw new Error(`unexpected command ${type}`);
  });
  return { command, saved };
}

function collectTools(command: any) {
  const tools = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    },
  };
  registerEnergyTools(server as any, { command } as any, new HassClient("http://ha", "tok"));
  return tools;
}

function payload(res: { content: { text: string }[] }) {
  return JSON.parse(res.content[0].text);
}

function mockStates(states: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(states),
  };
}

const energySensor = (entity_id: string) => ({
  entity_id,
  state: "1.0",
  attributes: {
    device_class: "energy",
    state_class: "total_increasing",
    unit_of_measurement: "kWh",
  },
});

const ACCEPTANCE_IDS = [
  "sensor.licht_kuche_total_energy",
  "sensor.licht_kuche_2_energy",
  "sensor.licht_buro_energy",
  "sensor.licht_bad_orell_total_energy",
  "sensor.licht_bad_andri_total_energy",
  "sensor.licht_keller_total_energy",
  "sensor.licht_terrasse_wohnzimmer_energy",
  "sensor.shelly1pmminig4_7c2c677476f4_total_energy",
  "sensor.shelly1pmminig4_7c2c6769c830_total_energy",
  "sensor.shelly1pmminig4_7c2c6769c13c_total_energy",
  "sensor.shelly1pmminig4_ccba97d7fb60_total_energy",
  "sensor.shelly1pmminig4_7c2c676aed84_total_energy",
  "sensor.shelly2pmg4_48f6eed90ca4_total_energy",
  "sensor.shelly2pmg4_58e6c53731e8_total_energy",
  "sensor.storen_gross_ziorell_total_energy",
  "sensor.storen_klein_ziorell_total_energy",
  "sensor.storen_buro_energy",
  "sensor.storen_ziandri_total_energy",
];

describe("energy tools", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("get_energy_prefs returns the current preferences", async () => {
    const prefs = { energy_sources: [{ type: "grid" }], device_consumption: [] };
    const ws = makeWs(prefs);
    const tools = collectTools(ws.command);
    const res = await tools.get("get_energy_prefs")!({});
    expect(ws.command).toHaveBeenCalledWith("energy/get_prefs");
    expect(payload(res)).toEqual(prefs);
  });

  it("get_energy_prefs maps a missing-prefs error to empty preferences", async () => {
    const ws = makeWs(null);
    const tools = collectTools(ws.command);
    const res = await tools.get("get_energy_prefs")!({});
    expect(res.isError).toBeUndefined();
    expect(payload(res)).toEqual({ energy_sources: [], device_consumption: [] });
  });

  it("get_energy_prefs surfaces unexpected errors as MCP errors", async () => {
    const command = vi.fn().mockRejectedValue(new Error("boom"));
    const tools = collectTools(command);
    const res = await tools.get("get_energy_prefs")!({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("boom");
  });

  it("get_energy_prefs maps an ERR_NOT_FOUND code to empty preferences", async () => {
    const e = Object.assign(new Error("nothing here"), { code: "ERR_NOT_FOUND" });
    const command = vi.fn().mockRejectedValue(e);
    const tools = collectTools(command);
    const res = await tools.get("get_energy_prefs")!({});
    expect(res.isError).toBeUndefined();
    expect(payload(res)).toEqual({ energy_sources: [], device_consumption: [] });
  });

  it("save_energy_prefs passes the object straight to energy/save_prefs", async () => {
    const ws = makeWs({ energy_sources: [], device_consumption: [] });
    const tools = collectTools(ws.command);
    const prefs = { device_consumption: [{ stat_consumption: "sensor.x" }] };
    await tools.get("save_energy_prefs")!({ prefs });
    expect(ws.command).toHaveBeenCalledWith("energy/save_prefs", prefs);
  });

  it("add_energy_devices appends new entries, dedupes, and sends only device_consumption", async () => {
    mockFetch.mockResolvedValueOnce(
      mockStates([energySensor("sensor.a"), energySensor("sensor.b")]),
    );
    const ws = makeWs({
      energy_sources: [{ type: "grid", stat_energy_from: "sensor.grid" }],
      device_consumption: [{ stat_consumption: "sensor.a" }],
    });
    const tools = collectTools(ws.command);
    const res = await tools.get("add_energy_devices")!({
      entity_ids: ["sensor.a", "sensor.b"],
    });
    expect(ws.saved).toHaveLength(1);
    expect(ws.saved[0]).toEqual({
      device_consumption: [{ stat_consumption: "sensor.a" }, { stat_consumption: "sensor.b" }],
    });
    expect(ws.saved[0].energy_sources).toBeUndefined();
    const p = payload(res);
    expect(p.added).toEqual(["sensor.b"]);
    expect(p.skipped).toEqual(["sensor.a"]);
  });

  it("add_energy_devices applies names by index", async () => {
    mockFetch.mockResolvedValueOnce(
      mockStates([energySensor("sensor.b"), energySensor("sensor.c")]),
    );
    const ws = makeWs({ energy_sources: [], device_consumption: [] });
    const tools = collectTools(ws.command);
    await tools.get("add_energy_devices")!({
      entity_ids: ["sensor.b", "sensor.c"],
      names: ["B meter", "C meter"],
    });
    expect(ws.saved[0].device_consumption).toEqual([
      { stat_consumption: "sensor.b", name: "B meter" },
      { stat_consumption: "sensor.c", name: "C meter" },
    ]);
  });

  it("add_energy_devices warns on ineligible or missing entities but still adds them", async () => {
    mockFetch.mockResolvedValueOnce(
      mockStates([
        energySensor("sensor.good"),
        {
          entity_id: "sensor.bad",
          state: "5",
          attributes: {
            device_class: "power",
            state_class: "measurement",
            unit_of_measurement: "W",
          },
        },
      ]),
    );
    const ws = makeWs({ energy_sources: [], device_consumption: [] });
    const tools = collectTools(ws.command);
    const res = await tools.get("add_energy_devices")!({
      entity_ids: ["sensor.good", "sensor.bad", "sensor.missing"],
    });
    const p = payload(res);
    expect(p.added).toEqual(["sensor.good", "sensor.bad", "sensor.missing"]);
    expect(ws.saved[0].device_consumption).toHaveLength(3);
    const warned = new Map<string, string[]>(
      p.warnings.map((w: any) => [w.entity_id, w.reasons] as [string, string[]]),
    );
    expect(warned.has("sensor.good")).toBe(false);
    expect(warned.get("sensor.bad")!.length).toBeGreaterThanOrEqual(3);
    expect(warned.get("sensor.missing")).toEqual([expect.stringContaining("not found")]);
  });

  it("add_energy_devices still adds devices when the states fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));
    const ws = makeWs({ energy_sources: [{ type: "grid" }], device_consumption: [] });
    const tools = collectTools(ws.command);
    const res = await tools.get("add_energy_devices")!({ entity_ids: ["sensor.a", "sensor.b"] });
    const p = payload(res);
    expect(p.added).toEqual(["sensor.a", "sensor.b"]);
    expect(p.warnings).toEqual([]);
    expect(ws.saved[0].device_consumption).toHaveLength(2);
    expect(ws.saved[0].energy_sources).toBeUndefined();
  });

  it("add_energy_devices puts all 18 acceptance devices into device_consumption", async () => {
    mockFetch.mockResolvedValueOnce(mockStates(ACCEPTANCE_IDS.map(energySensor)));
    const ws = makeWs({
      energy_sources: [
        { type: "grid", stat_energy_from: "sensor.grid_import" },
        { type: "solar", stat_energy_from: "sensor.solar" },
      ],
      device_consumption: [],
    });
    const tools = collectTools(ws.command);
    const res = await tools.get("add_energy_devices")!({ entity_ids: ACCEPTANCE_IDS });
    const p = payload(res);
    expect(p.added).toEqual(ACCEPTANCE_IDS);
    expect(ws.saved[0].energy_sources).toBeUndefined();
    const stats = ws.saved[0].device_consumption.map((d: any) => d.stat_consumption);
    expect(stats).toEqual(ACCEPTANCE_IDS);
    expect(p.warnings).toEqual([]);
  });

  it("remove_energy_devices removes matching entries and keeps the rest", async () => {
    const ws = makeWs({
      energy_sources: [{ type: "grid" }],
      device_consumption: [
        { stat_consumption: "sensor.a" },
        { stat_consumption: "sensor.b" },
        { stat_consumption: "sensor.c" },
      ],
    });
    const tools = collectTools(ws.command);
    const res = await tools.get("remove_energy_devices")!({ entity_ids: ["sensor.b"] });
    expect(ws.saved[0]).toEqual({
      device_consumption: [{ stat_consumption: "sensor.a" }, { stat_consumption: "sensor.c" }],
    });
    expect(ws.saved[0].energy_sources).toBeUndefined();
    expect(payload(res).removed).toEqual(["sensor.b"]);
  });

  it("validate_energy_prefs correlates device issues with stat_consumption", async () => {
    const ws = makeWs(
      {
        energy_sources: [{ type: "grid", stat_energy_from: "sensor.grid" }],
        device_consumption: [{ stat_consumption: "sensor.a" }, { stat_consumption: "sensor.b" }],
      },
      {
        validate: {
          energy_sources: [[]],
          device_consumption: [
            [],
            [{ type: "entity_unavailable", affected_entities: [["sensor.b", null]] }],
          ],
          device_consumption_water: [],
        },
      },
    );
    const tools = collectTools(ws.command);
    const res = await tools.get("validate_energy_prefs")!({});
    const p = payload(res);
    expect(p.device_consumption).toHaveLength(1);
    expect(p.device_consumption[0].stat_consumption).toBe("sensor.b");
    expect(p.device_consumption[0].issues[0].type).toBe("entity_unavailable");
  });

  it("set_energy_grid_source replaces the single grid source and preserves others", async () => {
    const ws = makeWs({
      energy_sources: [
        { type: "grid", stat_energy_from: "old.import" },
        { type: "solar", stat_energy_from: "sensor.solar" },
      ],
      device_consumption: [{ stat_consumption: "sensor.a" }],
    });
    const tools = collectTools(ws.command);
    await tools.get("set_energy_grid_source")!({
      stat_energy_from: "sensor.import",
      stat_energy_to: "sensor.export",
    });
    expect(ws.saved[0].device_consumption).toBeUndefined();
    expect(ws.saved[0].energy_sources).toEqual([
      {
        type: "grid",
        stat_energy_from: "sensor.import",
        stat_energy_to: "sensor.export",
        cost_adjustment_day: 0,
      },
      { type: "solar", stat_energy_from: "sensor.solar" },
    ]);
  });

  it("set_energy_grid_source appends a grid source when none exists", async () => {
    const ws = makeWs({
      energy_sources: [{ type: "solar", stat_energy_from: "sensor.solar" }],
      device_consumption: [],
    });
    const tools = collectTools(ws.command);
    await tools.get("set_energy_grid_source")!({ stat_energy_from: "sensor.import" });
    expect(ws.saved[0].energy_sources).toEqual([
      { type: "solar", stat_energy_from: "sensor.solar" },
      { type: "grid", stat_energy_from: "sensor.import", cost_adjustment_day: 0 },
    ]);
  });

  it("set_energy_grid_source merges onto the existing grid source", async () => {
    const ws = makeWs({
      energy_sources: [
        {
          type: "grid",
          stat_energy_from: "sensor.import",
          stat_cost: "sensor.cost",
          cost_adjustment_day: 2,
        },
      ],
      device_consumption: [],
    });
    const tools = collectTools(ws.command);
    await tools.get("set_energy_grid_source")!({ stat_energy_to: "sensor.export" });
    expect(ws.saved[0].energy_sources).toEqual([
      {
        type: "grid",
        stat_energy_from: "sensor.import",
        stat_cost: "sensor.cost",
        stat_energy_to: "sensor.export",
        cost_adjustment_day: 2,
      },
    ]);
  });

  it("set_energy_grid_source accepts stat_rate and power_config", async () => {
    const ws = makeWs({ energy_sources: [], device_consumption: [] });
    const tools = collectTools(ws.command);
    await tools.get("set_energy_grid_source")!({
      stat_energy_from: "sensor.import",
      stat_rate: "sensor.rate",
      power_config: { stat_rate: "sensor.power" },
    });
    expect(ws.saved[0].energy_sources).toEqual([
      {
        type: "grid",
        stat_energy_from: "sensor.import",
        stat_rate: "sensor.rate",
        power_config: { stat_rate: "sensor.power" },
        cost_adjustment_day: 0,
      },
    ]);
  });

  it("set_energy_solar_source upserts by stat_energy_from and preserves other sources", async () => {
    const ws = makeWs({
      energy_sources: [
        { type: "grid", stat_energy_from: "sensor.grid" },
        { type: "solar", stat_energy_from: "sensor.s1" },
      ],
      device_consumption: [],
    });
    const tools = collectTools(ws.command);
    await tools.get("set_energy_solar_source")!({
      stat_energy_from: "sensor.s1",
      config_entry_solar_forecast: ["ce1"],
    });
    expect(ws.saved[0].energy_sources).toEqual([
      { type: "grid", stat_energy_from: "sensor.grid" },
      { type: "solar", stat_energy_from: "sensor.s1", config_entry_solar_forecast: ["ce1"] },
    ]);
  });

  it("set_energy_solar_source appends a new solar source", async () => {
    const ws = makeWs({
      energy_sources: [{ type: "solar", stat_energy_from: "sensor.s1" }],
      device_consumption: [],
    });
    const tools = collectTools(ws.command);
    await tools.get("set_energy_solar_source")!({ stat_energy_from: "sensor.s2" });
    expect(ws.saved[0].energy_sources).toEqual([
      { type: "solar", stat_energy_from: "sensor.s1" },
      { type: "solar", stat_energy_from: "sensor.s2" },
    ]);
  });

  it("set_energy_solar_source preserves existing fields when upserting the same stat", async () => {
    const ws = makeWs({
      energy_sources: [
        { type: "solar", stat_energy_from: "sensor.s1", config_entry_solar_forecast: ["ce1"] },
      ],
      device_consumption: [],
    });
    const tools = collectTools(ws.command);
    await tools.get("set_energy_solar_source")!({ stat_energy_from: "sensor.s1" });
    expect(ws.saved[0].energy_sources).toEqual([
      { type: "solar", stat_energy_from: "sensor.s1", config_entry_solar_forecast: ["ce1"] },
    ]);
  });

  it("returns an MCP error when a write command rejects", async () => {
    const ws = makeWs({ energy_sources: [], device_consumption: [] });
    ws.command.mockRejectedValueOnce(new Error("unauthorized"));
    const tools = collectTools(ws.command);
    const res = await tools.get("save_energy_prefs")!({ prefs: { device_consumption: [] } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("unauthorized");
  });
});
