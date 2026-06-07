import { describe, it, expect } from "vitest";
import { buildQS, ok, err, summarizeState, domainOf } from "../hass/format.js";

describe("buildQS", () => {
  it("returns an empty string when there are no params", () => {
    expect(buildQS({})).toBe("");
  });

  it("skips undefined and null", () => {
    expect(buildQS({ a: undefined, b: null })).toBe("");
  });

  it("joins arrays with commas", () => {
    expect(buildQS({ ids: [1, 2, 3] })).toBe("?ids=1%2C2%2C3");
  });

  it("serializes scalar values", () => {
    expect(buildQS({ a: 1, b: true })).toBe("?a=1&b=true");
  });

  it("skips empty arrays", () => {
    expect(buildQS({ a: [], b: 1 })).toBe("?b=1");
  });

  it("keeps zero and false scalars", () => {
    expect(buildQS({ a: 0, b: false })).toBe("?a=0&b=false");
  });

  it("url-encodes special characters in values and array elements", () => {
    expect(buildQS({ q: "a b&c" })).toBe("?q=a+b%26c");
    expect(buildQS({ ids: ["x&y", "z"] })).toBe("?ids=x%26y%2Cz");
  });
});

describe("ok / err", () => {
  it("passes strings through unquoted", () => {
    expect(ok("on")).toEqual({ content: [{ type: "text", text: "on" }] });
  });

  it("JSON-stringifies objects", () => {
    expect(ok({ a: 1 })).toEqual({ content: [{ type: "text", text: '{"a":1}' }] });
  });

  it("marks errors with isError", () => {
    const r = err(new Error("boom"));
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("boom");
  });
});

describe("domainOf", () => {
  it("returns the part before the dot", () => {
    expect(domainOf("light.kitchen")).toBe("light");
    expect(domainOf("binary_sensor.front_door")).toBe("binary_sensor");
  });
});

describe("summarizeState", () => {
  it("keeps entity_id, state and selected attributes", () => {
    expect(
      summarizeState({
        entity_id: "sensor.temp",
        state: "21.5",
        attributes: {
          friendly_name: "Temp",
          unit_of_measurement: "°C",
          device_class: "temperature",
          extra: "dropped",
        },
      }),
    ).toEqual({
      entity_id: "sensor.temp",
      state: "21.5",
      friendly_name: "Temp",
      device_class: "temperature",
      unit: "°C",
    });
  });

  it("omits attributes that are not present", () => {
    expect(summarizeState({ entity_id: "x.y", state: "1" })).toEqual({
      entity_id: "x.y",
      state: "1",
    });
  });
});
