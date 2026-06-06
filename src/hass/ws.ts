import WebSocket from "ws";

interface WsMessage {
  type?: string;
  id?: number;
  success?: boolean;
  result?: unknown;
  message?: string;
  error?: { code?: string; message?: string };
}

export class HassWsClient {
  readonly wsUrl: string;
  readonly token: string;
  readonly timeoutMs: number;

  constructor(wsUrl: string, token: string, timeoutMs = 15000) {
    this.wsUrl = wsUrl;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  command(type: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      const id = 1;
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        ws.terminate();
        reject(new Error(`Home Assistant WebSocket timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      const finish = (run: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          /* ignore close errors */
        }
        run();
      };

      ws.on("message", (raw) => {
        let msg: WsMessage;
        try {
          msg = JSON.parse(raw.toString()) as WsMessage;
        } catch (e) {
          finish(() => reject(new Error(`Invalid Home Assistant WebSocket message: ${String(e)}`)));
          return;
        }
        if (msg.type === "auth_required") {
          ws.send(JSON.stringify({ type: "auth", access_token: this.token }));
        } else if (msg.type === "auth_invalid") {
          finish(() =>
            reject(
              new Error(`Home Assistant authentication failed: ${msg.message ?? "invalid token"}`),
            ),
          );
        } else if (msg.type === "auth_ok") {
          ws.send(JSON.stringify({ id, type, ...payload }));
        } else if (msg.type === "result" && msg.id === id) {
          if (msg.success) {
            finish(() => resolve(msg.result));
          } else {
            finish(() =>
              reject(
                new Error(
                  `Home Assistant WebSocket error: ${msg.error?.message ?? "unknown error"}`,
                ),
              ),
            );
          }
        }
      });

      ws.on("error", (e) => {
        finish(() => reject(new Error(`Home Assistant WebSocket connection error: ${String(e)}`)));
      });

      ws.on("close", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error("Home Assistant WebSocket closed before a result was received"));
      });
    });
  }
}
