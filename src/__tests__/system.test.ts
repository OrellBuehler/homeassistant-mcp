import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

const { registerSystemTools } = await import("../tools/system.js");
const { HassClient } = await import("../hass/rest.js");

type ToolHandler = (args: any) => Promise<{ content: { text: string }[]; isError?: boolean }>;

const schemas = new Map<string, Record<string, z.ZodTypeAny>>();
function collectTools() {
  const tools = new Map<string, ToolHandler>();
  const server = {
    tool: (
      name: string,
      _desc: string,
      schema: Record<string, z.ZodTypeAny>,
      handler: ToolHandler,
    ) => {
      tools.set(name, handler);
      schemas.set(name, schema);
    },
  };
  registerSystemTools(server as any, new HassClient("http://localhost:8123", "test-token"));
  return tools;
}

const tools = collectTools();

function mockJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(body),
  };
}

function mockText(body: string) {
  return { ok: true, status: 200, text: () => Promise.resolve(body) };
}

describe("system tools", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("get_config fetches /api/config and returns the payload", async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ version: "2026.6.0" }));
    const res = await tools.get("get_config")!({});
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:8123/api/config", expect.any(Object));
    expect(JSON.parse(res.content[0].text)).toEqual({ version: "2026.6.0" });
  });

  it("check_config POSTs to the check_config endpoint", async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ result: "valid", errors: null }));
    const res = await tools.get("check_config")!({});
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8123/api/config/core/check_config",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(res.content[0].text)).toEqual({ result: "valid", errors: null });
  });

  it("get_error_log tails to the requested number of lines", async () => {
    const log = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");
    mockFetch.mockResolvedValueOnce(mockText(log));
    const res = await tools.get("get_error_log")!({ lines: 3 });
    expect(res.content[0].text).toBe("line 8\nline 9\nline 10");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8123/api/error_log",
      expect.any(Object),
    );
  });

  it("get_error_log returns the full log when lines is 0", async () => {
    mockFetch.mockResolvedValueOnce(mockText("a\nb\nc"));
    const res = await tools.get("get_error_log")!({ lines: 0 });
    expect(res.content[0].text).toBe("a\nb\nc");
  });

  it("get_error_log defaults to the last 100 lines", async () => {
    const log = Array.from({ length: 150 }, (_, i) => `line ${i + 1}`).join("\n");
    mockFetch.mockResolvedValueOnce(mockText(log));
    const res = await tools.get("get_error_log")!({});
    const lines = res.content[0].text.split("\n");
    expect(lines).toHaveLength(100);
    expect(lines[0]).toBe("line 51");
    expect(lines.at(-1)).toBe("line 150");
  });

  it("get_error_log schema rejects negative lines but allows 0 and omission", () => {
    const shape = schemas.get("get_error_log")!;
    expect(z.object(shape).safeParse({ lines: -1 }).success).toBe(false);
    expect(z.object(shape).safeParse({ lines: 0 }).success).toBe(true);
    expect(z.object(shape).safeParse({ lines: 5 }).success).toBe(true);
    expect(z.object(shape).safeParse({}).success).toBe(true);
  });
});
