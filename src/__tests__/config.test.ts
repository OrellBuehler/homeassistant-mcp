import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("derives base and websocket URLs from HASS_URL", async () => {
    vi.stubEnv("HASS_URL", "https://ha.example.com:8123/");
    vi.stubEnv("HASS_TOKEN", "tok");
    const { config } = await import("../config.js");
    expect(config.baseUrl).toBe("https://ha.example.com:8123");
    expect(config.wsUrl).toBe("wss://ha.example.com:8123/api/websocket");
    expect(config.transport).toBe("stdio");
  });

  it("accepts HASS_SERVER and prepends http:// when the scheme is missing", async () => {
    vi.stubEnv("HASS_URL", "");
    vi.stubEnv("HASS_SERVER", "homeassistant.local:8123");
    vi.stubEnv("HASS_TOKEN", "tok");
    const { config } = await import("../config.js");
    expect(config.baseUrl).toBe("http://homeassistant.local:8123");
    expect(config.wsUrl).toBe("ws://homeassistant.local:8123/api/websocket");
  });

  it("exits the process when required env vars are missing", async () => {
    vi.stubEnv("HASS_URL", "");
    vi.stubEnv("HASS_SERVER", "");
    vi.stubEnv("HASS_TOKEN", "");
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(import("../config.js")).rejects.toThrow("exit:1");
    expect(exit).toHaveBeenCalledWith(1);
  });
});
