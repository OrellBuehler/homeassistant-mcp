import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HassClient } from "../hass/rest.js";

function mockJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function mockText(body: string, contentType = "text/plain") {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": contentType }),
    text: () => Promise.resolve(body),
  };
}

describe("HassClient", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the Authorization bearer header against the normalized base URL", async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ ok: 1 }));
    const client = new HassClient("http://ha:8123/", "secret-token");
    await client.fetch("/api/states");
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("http://ha:8123/api/states");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
  });

  it("adds Content-Type for string bodies only", async () => {
    const client = new HassClient("http://ha", "tok");
    mockFetch.mockResolvedValueOnce(mockJson({}));
    await client.fetch("/api/template", { method: "POST", body: "{}" });
    expect((mockFetch.mock.calls[0][1].headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    mockFetch.mockResolvedValueOnce(mockJson({}));
    await client.fetch("/api/states");
    expect(
      (mockFetch.mock.calls[1][1].headers as Record<string, string>)["Content-Type"],
    ).toBeUndefined();
  });

  it("returns {success:true} for 204 responses", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers(),
      text: () => Promise.resolve(""),
    });
    const client = new HassClient("http://ha", "tok");
    expect(await client.fetch("/api/services/x/y", { method: "POST" })).toEqual({ success: true });
  });

  it("parses JSON and returns text for non-JSON responses", async () => {
    const client = new HassClient("http://ha", "tok");
    mockFetch.mockResolvedValueOnce(mockJson({ a: 1 }));
    expect(await client.fetch("/api/config")).toEqual({ a: 1 });
    mockFetch.mockResolvedValueOnce(mockText("plain"));
    expect(await client.fetch("/api/error_log")).toBe("plain");
  });

  it("throws with status, statusText and body on non-2xx", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve("bad token"),
    });
    const client = new HassClient("http://ha", "tok");
    await expect(client.fetch("/api/states")).rejects.toThrow("401 Unauthorized: bad token");
  });

  it("passes an AbortSignal and translates a timeout into a clear error", async () => {
    const client = new HassClient("http://ha", "tok", 1234);
    mockFetch.mockImplementationOnce((_url: string, options: RequestInit) => {
      expect(options.signal).toBeInstanceOf(AbortSignal);
      return Promise.reject(new DOMException("The operation timed out.", "TimeoutError"));
    });
    await expect(client.fetch("/api/states")).rejects.toThrow(
      "Home Assistant request timed out after 1234ms",
    );
  });

  it("does not override an explicitly provided signal", async () => {
    const client = new HassClient("http://ha", "tok");
    const controller = new AbortController();
    mockFetch.mockImplementationOnce((_url: string, options: RequestInit) => {
      expect(options.signal).toBe(controller.signal);
      return Promise.resolve(mockJson({}));
    });
    await client.fetch("/api/states", { signal: controller.signal });
  });

  it("fetchText returns the raw body and throws on non-2xx", async () => {
    const client = new HassClient("http://ha", "tok");
    mockFetch.mockResolvedValueOnce(mockText("log line"));
    expect(await client.fetchText("/api/error_log")).toBe("log line");
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Server Error",
      text: () => Promise.resolve("boom"),
    });
    await expect(client.fetchText("/api/error_log")).rejects.toThrow("500 Server Error: boom");
  });
});
