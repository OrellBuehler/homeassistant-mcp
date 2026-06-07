import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => {
  type Listener = (...args: any[]) => void;
  class FakeWS {
    static instances: FakeWS[] = [];
    private listeners: Record<string, Listener[]> = {};
    sent: string[] = [];
    url: string;
    closed = false;
    terminated = false;
    constructor(url: string) {
      this.url = url;
      FakeWS.instances.push(this);
    }
    on(event: string, cb: Listener) {
      (this.listeners[event] ??= []).push(cb);
      return this;
    }
    emit(event: string, ...args: any[]) {
      (this.listeners[event] ?? []).forEach((l) => l(...args));
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {
      this.closed = true;
    }
    terminate() {
      this.terminated = true;
    }
  }
  return { FakeWS };
});

vi.mock("ws", () => ({ default: hoisted.FakeWS }));

const { HassWsClient } = await import("../hass/ws.js");

function latest() {
  return hoisted.FakeWS.instances[hoisted.FakeWS.instances.length - 1];
}

function emit(ws: { emit: (e: string, ...a: any[]) => void }, obj: unknown) {
  ws.emit("message", Buffer.from(JSON.stringify(obj)));
}

describe("HassWsClient", () => {
  beforeEach(() => {
    hoisted.FakeWS.instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("authenticates, sends the command, and resolves the result", async () => {
    const client = new HassWsClient("ws://ha/api/websocket", "tok");
    const p = client.command("config/area_registry/list");
    const ws = latest();

    emit(ws, { type: "auth_required" });
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "auth", access_token: "tok" });

    emit(ws, { type: "auth_ok" });
    expect(JSON.parse(ws.sent[1])).toMatchObject({ id: 1, type: "config/area_registry/list" });

    emit(ws, { id: 1, type: "result", success: true, result: [{ area_id: "kitchen" }] });
    await expect(p).resolves.toEqual([{ area_id: "kitchen" }]);
    expect(ws.closed).toBe(true);
  });

  it("rejects on auth_invalid", async () => {
    const client = new HassWsClient("ws://ha/api/websocket", "bad");
    const p = client.command("x");
    p.catch(() => {});
    const ws = latest();
    emit(ws, { type: "auth_required" });
    emit(ws, { type: "auth_invalid", message: "nope" });
    await expect(p).rejects.toThrow(/authentication failed: nope/);
  });

  it("rejects when the result is unsuccessful", async () => {
    const client = new HassWsClient("ws://ha/api/websocket", "tok");
    const p = client.command("x");
    p.catch(() => {});
    const ws = latest();
    emit(ws, { type: "auth_ok" });
    emit(ws, { id: 1, type: "result", success: false, error: { message: "boom" } });
    await expect(p).rejects.toThrow(/boom/);
  });

  it("attaches the HA error code to an unsuccessful result", async () => {
    const client = new HassWsClient("ws://ha/api/websocket", "tok");
    const p = client.command("x");
    p.catch(() => {});
    const ws = latest();
    emit(ws, { type: "auth_ok" });
    emit(ws, {
      id: 1,
      type: "result",
      success: false,
      error: { code: "ERR_NOT_FOUND", message: "No prefs" },
    });
    await expect(p).rejects.toMatchObject({ code: "ERR_NOT_FOUND" });
  });

  it("rejects on timeout", async () => {
    vi.useFakeTimers();
    const client = new HassWsClient("ws://ha/api/websocket", "tok", 1000);
    const p = client.command("x");
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).rejects.toThrow(/timed out/);
  });
});
