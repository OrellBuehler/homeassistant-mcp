# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A STDIO MCP server that exposes the Home Assistant REST API plus the WebSocket config registries as
tools for AI agents. Its purpose is to **help an agent author and validate HA configuration and
automations**, not to control the home. Published to npm as `@orellbuehler/homeassistant-mcp` and run
via `npx`; the compiled `dist/index.js` is the `bin` entry. See `README.md` for the tool catalog and
env-var reference.

## Commands

```bash
npm run build         # tsc -> dist/
npm test              # vitest run (all tests)
npm run test:watch    # vitest watch
npm run lint          # eslint src
npm run typecheck     # tsc --noEmit
npm run format        # prettier --write .
npm run format:check  # prettier --check . (what CI runs)
```

Run a single test file or pattern:

```bash
npx vitest run src/__tests__/entities.test.ts
npx vitest run -t "reload 'all'"
```

CI (`.github/workflows/ci.yml`) runs `format:check`, `lint`, `typecheck`, and `test` in that order —
all must pass. Run them locally before committing.

## Architecture

Request flow: `index.ts` reads config, builds the server via `server.ts:createServer(client, wsClient)`,
and connects it over stdio. Each tool calls either the REST `client` or the WebSocket `wsClient`.

- **`src/index.ts`** — entry point. Stdio transport only (single-user).
- **`src/config.ts`** — reads env at import time and **exits the process** if `HASS_URL`/`HASS_SERVER`
  or `HASS_TOKEN` is missing. Normalizes the base URL and derives the WebSocket URL (`deriveWsUrl`).
  Exports `client` and `wsClient`.
- **`src/hass/rest.ts`** — `HassClient`, a thin `fetch` wrapper. Auth is `Authorization: Bearer
<token>`. `fetch()` returns JSON (or text for non-JSON responses); `fetchText()` is used for the
  error log and template rendering. Throws on non-2xx with the response body in the message.
- **`src/hass/ws.ts`** — `HassWsClient`. One **ephemeral** connection per `command()`: connect → `auth`
  handshake → send one command (id 1) → resolve `result` → close. Rejects on `auth_invalid`,
  unsuccessful result, or timeout. Uses the `ws` package (Node 18 has no global WebSocket).
- **`src/hass/format.ts`** — shared helpers: `buildQS` (arrays comma-joined), `ok`/`err` (MCP content
  envelopes; `ok` passes strings through unquoted), `summarizeState`, `domainOf`, and the `HassState`
  type.
- **`src/tools/*.ts`** — each exports a `register*Tools(server, client|wsClient)` function that
  `server.ts` calls. Groups: `entities`, `services`, `system`, `templates`, `history`, `reload` (REST),
  `registry` (WebSocket), `energy` (Energy dashboard prefs over WebSocket), and `trace`
  (automation/script execution traces over WebSocket). `energy` and `trace` also take the REST
  `client` — energy to check entity eligibility, trace to resolve an automation's `id` — so their
  signature is `register*Tools(server, wsClient, client)`.

## Conventions

- **ESM with Node16 module resolution: all relative imports must end in `.js`** (e.g.
  `import { ok } from "../hass/format.js"`), even though the source is `.ts`.
- **Tool handler shape:** `server.tool(name, description, zodShape, async (args) => { try { return
ok(await client.fetch(...)); } catch (e) { return err(e); } })`. The third argument is a raw Zod
  shape object (`{}` when there are no params). Match this try/catch-`ok`/`err` style exactly.
- **Don't add comments, docstrings, or type annotations** unless they already exist in the file you're
  editing (per global preference).
- **Scope is read + validate + author config + reload — never device control.** Do not add
  `call_service`, `set_state`, or `fire_event`. New write capability must stay within the dev-assist
  boundary: `reload` is limited to the `RELOAD_TARGETS` allowlist in `src/tools/reload.ts`, the
  `energy` tools write only Energy dashboard preferences via `energy/save_prefs`, `rename_entity`
  writes only registry metadata (`name`/`new_entity_id`) via `config/entity_registry/update`, the
  `zha` tools manage Zigbee groups via `zha/group/*`, the `resources` tools manage Lovelace resources
  via `lovelace/resources/*`, and `remove_hacs_repository` uninstalls a HACS repo via
  `hacs/repository/remove` (no install tool — the server never downloads third-party code) — all
  config authoring, not device control; HA requires an admin token for these writes.
- **Secrets:** the repo is public. Never log the token; only read it from env. Tests use fake
  credentials.

## Tests

Tests live in `src/__tests__/*.test.ts`. Tool tests pass a fake `{ tool: (name, desc, schema, handler)
=> ... }` server to the `register*Tools` function to capture handlers, then stub global `fetch` (REST)
or pass a fake `{ command }` (WebSocket registry tools) to assert the exact request path/method/body
and the output shaping. `ws.test.ts` mocks the `ws` module to drive the auth handshake. `config.ts`
reads env at import time and exits if it's missing, so `config.test.ts` `vi.stubEnv(...)` then
dynamically `import()`s it.
