# homeassistant-mcp

[![npm](https://img.shields.io/npm/v/@orellbuehler/homeassistant-mcp.svg)](https://www.npmjs.com/package/@orellbuehler/homeassistant-mcp)
[![CI](https://github.com/OrellBuehler/homeassistant-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/OrellBuehler/homeassistant-mcp/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/@orellbuehler/homeassistant-mcp.svg)](https://nodejs.org)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

MCP server for [Home Assistant](https://www.home-assistant.io/) that exposes the
[REST API](https://www.home-assistant.io/integrations/api/) and WebSocket registries as tools for
AI agents.

It is built to **help an agent author and validate Home Assistant configuration and automations** —
not to control your home. It tells the agent what exists live (entities, services, events, areas,
devices), validates the agent's work (render Jinja2 templates, check config, read the error log),
can reload reloadable domains after YAML edits, and can configure the Energy dashboard (sources and
the Individual-devices list). It deliberately has **no tools to turn devices on/off, set states, or
fire events**.

## Install

The package is published as
[`@orellbuehler/homeassistant-mcp`](https://www.npmjs.com/package/@orellbuehler/homeassistant-mcp)
and runs directly with `npx` — no clone or build needed:

```bash
claude mcp add homeassistant \
  --env HASS_URL=http://homeassistant.local:8123 \
  --env HASS_TOKEN=your-long-lived-access-token \
  -- npx -y @orellbuehler/homeassistant-mcp
```

See [Usage with Claude Code](#usage-with-claude-code) for the equivalent JSON config. For any other
MCP client, run the package directly — `npx -y @orellbuehler/homeassistant-mcp` with `HASS_URL` and
`HASS_TOKEN` set in the environment. Requires Node.js 18+.

## Getting a token

`HASS_TOKEN` must be a **Long-Lived Access Token**:

1. In Home Assistant, open your profile (click your username, bottom-left).
2. Go to the **Security** tab → **Long-lived access tokens** → **Create token**.
3. Copy the token (it is shown only once) and treat it like a password.

The token inherits your user's permissions. To limit what the agent can see, create a dedicated HA
user with the access you want and generate the token as that user.

## Configuration

| Variable      | Required | Description                                                                       |
| ------------- | -------- | --------------------------------------------------------------------------------- |
| `HASS_URL`    | yes\*    | Base URL of your instance, e.g. `http://homeassistant.local:8123`. `https` works. |
| `HASS_SERVER` | no       | Alias for `HASS_URL` (compatible with `hass-cli`). Used if `HASS_URL` is unset.   |
| `HASS_TOKEN`  | yes      | Long-lived access token.                                                          |

\* Either `HASS_URL` or `HASS_SERVER` must be set. The WebSocket URL is derived automatically
(`http`→`ws`, `https`→`wss`, plus `/api/websocket`).

## Usage with Claude Code

Add the server to `~/.claude/settings.json` (or a project `.mcp.json`):

```json
{
  "mcpServers": {
    "homeassistant": {
      "command": "npx",
      "args": ["-y", "@orellbuehler/homeassistant-mcp"],
      "env": {
        "HASS_URL": "http://homeassistant.local:8123",
        "HASS_TOKEN": "your-long-lived-access-token"
      }
    }
  }
}
```

If you built from source instead, use `"command": "node"` with
`"args": ["/path/to/homeassistant-mcp/dist/index.js"]`. Restart Claude Code and the tools are
available immediately. Verify with `claude mcp list` (should show `homeassistant ✓ connected`) or
`/mcp` inside a session.

## Tools

**Entities & state** (REST)

| Tool            | Description                                                            |
| --------------- | ---------------------------------------------------------------------- |
| `list_entities` | Compact summary of live entities (filter by `domain` and/or `search`). |
| `get_entity`    | Full state object for one entity, including all attributes.            |
| `list_domains`  | Distinct entity domains present, with counts.                          |

**Services & events** (REST)

| Tool            | Description                                                                         |
| --------------- | ----------------------------------------------------------------------------------- |
| `list_services` | Callable services (actions for automations/scripts). Pass `domain` for full fields. |
| `list_events`   | Event types being listened for, with listener counts (for `event` triggers).        |

**System & validation** (REST)

| Tool              | Description                                                                    |
| ----------------- | ------------------------------------------------------------------------------ |
| `get_config`      | Running config: version, components, unit system, time zone, etc.              |
| `check_config`    | Validate the YAML config on the server (`/api/config/core/check_config`).      |
| `get_error_log`   | Error log as text (tail to `lines`, default 100).                              |
| `render_template` | Render a Jinja2 template against live state — for template sensors/conditions. |

**History** (REST)

| Tool          | Description                                                |
| ------------- | ---------------------------------------------------------- |
| `get_history` | State history for one or more entities over a time window. |
| `get_logbook` | Human-readable logbook entries.                            |

**Reload** (REST, curated allowlist)

| Tool     | Description                                                                                |
| -------- | ------------------------------------------------------------------------------------------ |
| `reload` | Reload a reloadable domain so YAML edits apply without a restart (`all`, `automation`, …). |

**Registries** (WebSocket)

| Tool                     | Description                                                                 |
| ------------------------ | --------------------------------------------------------------------------- |
| `list_registry_entities` | ALL registered entities, incl. disabled/unavailable (area, device, status). |
| `list_devices`           | Devices (id, name, manufacturer, model, area).                              |
| `list_areas`             | Areas (area_id, name, floor).                                               |
| `list_labels`            | Labels (label_id, name, color, icon).                                       |

`list_entities` (REST) shows entities that currently have state; `list_registry_entities`
(WebSocket) shows everything registered, including disabled entities, with area/device grouping.

**Energy dashboard** (WebSocket)

| Tool                      | Description                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `get_energy_prefs`        | Current Energy dashboard preferences (sources + the Individual-devices list).       |
| `save_energy_prefs`       | Overwrite preferences (read-modify-write; replaces each provided key).              |
| `add_energy_devices`      | Append entities to Individual devices, deduped, with optional eligibility warnings. |
| `remove_energy_devices`   | Remove entities from Individual devices by `stat_consumption`.                      |
| `validate_energy_prefs`   | Run `energy/validate` and correlate issues with each entity/source.                 |
| `set_energy_grid_source`  | Set the single grid source (import/export plus optional cost/price stats).          |
| `set_energy_solar_source` | Add or update a solar production source (upsert by `stat_energy_from`).             |

The Energy dashboard config lives in `.storage/energy` and is only reachable over WebSocket (not
REST). The write tools (`save_energy_prefs`, `add_`/`remove_energy_devices`, `set_energy_*`) call
`energy/save_prefs`, which **requires an admin token**.

## Safety boundary

- **No device control.** There is no generic `call_service`, no `set_state`, and no `fire_event`.
  The server cannot turn things on/off.
- **`reload` is restricted** to a fixed allowlist of `*.reload` / `homeassistant.reload_*` services.
  It restarts reloadable domains (e.g. re-reads `automations.yaml`) but cannot control devices.
- **Energy dashboard config is writable** via `energy/save_prefs` (the `*_energy_*` tools). This is
  configuration authoring — the dashboard's sources and Individual-devices list — not device control,
  and it needs an admin token. No `call_service`, `set_state`, or `fire_event` is added.
- **Read tools expose your home's data** (entity names, states, areas) to the agent/LLM. Use a
  scoped HA user if that matters to you.
- Prefer `https` and a trusted network path to your instance.

## Development

```bash
npm install
npm run build         # tsc -> dist/
npm test              # vitest run
npm run typecheck     # tsc --noEmit
npm run lint          # eslint src
npm run format:check  # prettier --check .
```

Run a single test file:

```bash
npx vitest run src/__tests__/entities.test.ts
```

## CI / Releasing

- **CI** (`.github/workflows/ci.yml`) runs on every push to `main` and on pull requests:
  `format:check`, `lint`, `typecheck` (once) and `test` + `build` on Node 20 and 22.
- **Publish** (`.github/workflows/publish.yml`) runs when a GitHub Release is published. It builds,
  tests, and publishes to npm using [trusted publishing](https://docs.npmjs.com/trusted-publishers)
  (OIDC) — **no `NPM_TOKEN` secret required**, with provenance generated automatically. It skips
  publishing if that version is already on npm.

One-time setup on npmjs.com: open the package's **Settings → Trusted Publisher** and add a GitHub
Actions publisher for repository `OrellBuehler/homeassistant-mcp` with workflow `publish.yml`. If the
package doesn't exist on npm yet, do one manual `npm publish --access public` (after `npm login`) to
create it, then add the trusted publisher for all future releases.

Cut a release:

```bash
npm version patch          # bumps package.json + creates a vX.Y.Z tag (use minor/major as needed)
git push --follow-tags
gh release create "v$(node -p "require('./package.json').version")" --generate-notes
```

## License

[MIT](./LICENSE) © Orell Bühler
