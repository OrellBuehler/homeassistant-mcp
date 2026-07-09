# Home Assistant MCP Server

[![npm](https://img.shields.io/npm/v/@orellbuehler/homeassistant-mcp.svg)](https://www.npmjs.com/package/@orellbuehler/homeassistant-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@orellbuehler/homeassistant-mcp.svg)](https://www.npmjs.com/package/@orellbuehler/homeassistant-mcp)
[![CI](https://github.com/OrellBuehler/homeassistant-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/OrellBuehler/homeassistant-mcp/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/@orellbuehler/homeassistant-mcp.svg)](https://nodejs.org)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A [Model Context Protocol](https://modelcontextprotocol.io/) server that turns your
[Home Assistant](https://www.home-assistant.io/) instance into a safe workbench for AI agents —
built to **author and validate configuration and automations**, not to control your home.

Point Claude (or any MCP client) at it and the agent can:

- **See what exists, live** — entities, services, events, areas, devices, labels, state history,
  logbook.
- **Author configuration** — create/edit automations, configure the Energy dashboard, manage
  Zigbee (ZHA) groups, register Lovelace resources, prune HACS repositories, rename entities,
  reload YAML domains.
- **Validate its own work** — render Jinja2 templates against live state, run HA's config check,
  read the error log, and inspect step-by-step execution traces of automations it wrote.
- **Never touch your devices** — there is deliberately no `call_service`, no `set_state`, and no
  `fire_event`. The agent writes config; it cannot turn anything on or off.

42 tools, zero install (`npx`), works with Claude Code, Claude Desktop, Cursor, and any other MCP
client.

## Example prompts

> "Create an automation that turns on the porch light 30 minutes before sunset, but only when
> someone is home."

> "My 'goodnight' automation didn't fire last night. Figure out why."

> "Write a template sensor for net grid power and validate it against live state before I put it
> in my YAML."

> "Set up my Energy dashboard: grid import/export from these two sensors, solar from the inverter,
> and add every smart plug as an individual device."

> "Group the three living-room bulbs into one Zigbee group so they dim in sync."

> "I uninstalled a HACS card — find and remove the dangling Lovelace resource."

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
`HASS_TOKEN` set in the environment. Requires Node.js 20+.

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

42 tools in 12 groups. REST tools go through the
[Home Assistant REST API](https://www.home-assistant.io/integrations/api/); WebSocket tools use the
config registries that are not exposed over REST.

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

**Automations** (REST, `/api/config/automation`)

| Tool                    | Description                                                                    |
| ----------------------- | ------------------------------------------------------------------------------ |
| `get_automation_config` | Stored config (triggers/conditions/actions/mode) of one automation.            |
| `upsert_automation`     | Create a new automation or replace an existing one's config (validated by HA). |
| `delete_automation`     | Delete a UI-managed automation.                                                |

All three accept the `automation.*` entity id (the internal id is resolved automatically) or the
internal id itself. Writes require an **admin token**; HA validates the config, stores it in
`automations.yaml` and reloads automations automatically. `upsert_automation` replaces the whole
config, so edit via `get_automation_config` → modify → `upsert_automation`. Only automations with
an `id` (UI-created / `automations.yaml`) are reachable — automations defined elsewhere in YAML are
not. Debug the result with the trace tools below.

**Registries** (WebSocket)

| Tool                     | Description                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `list_registry_entities` | ALL registered entities, incl. disabled/unavailable (area, device, status).              |
| `rename_entity`          | Set an entity's registry `name` and/or `new_entity_id` (config edit, no device control). |
| `list_devices`           | Devices (id, name, manufacturer, model, area).                                           |
| `list_areas`             | Areas (area_id, name, floor).                                                            |
| `list_labels`            | Labels (label_id, name, color, icon).                                                    |

`list_entities` (REST) shows entities that currently have state; `list_registry_entities`
(WebSocket) shows everything registered, including disabled entities, with area/device grouping.
`rename_entity` writes the registry via `config/entity_registry/update` (requires an admin token):
`name` overrides the friendly name (null reverts to the integration's `original_name`) and
`new_entity_id` renames the entity_id within the same domain.

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
`energy/save_prefs`, which **requires an admin token**. They are read-modify-write (fetch the current
prefs, then save), so editing the Energy dashboard in the HA UI at the same moment can be overwritten
— this is fine for the intended single-agent use.

**Traces** (WebSocket, read-only)

| Tool                 | Description                                                                         |
| -------------------- | ----------------------------------------------------------------------------------- |
| `list_traces`        | Recent execution traces (newest first) for an `automation.*`/`script.*` entity.     |
| `get_trace`          | Full step-by-step trace for one run (config, variables, context, error).            |
| `get_trace_contexts` | Map context ids to the trace run that produced them (causality across automations). |

Pass an `automation.*` or `script.*` entity id; the trace key is resolved automatically. Use these
to debug **whether and how** an automation you authored actually ran.

**ZHA / Zigbee groups** (WebSocket)

| Tool                       | Description                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `list_zha_groups`          | Existing ZHA groups (group_id, name, members).                                      |
| `list_zha_groupable`       | Endpoints that can join a group (ieee + endpoint_id + their entities).              |
| `create_zha_group`         | Create a group on the coordinator; members by `entity_id` or `{ieee, endpoint_id}`. |
| `add_zha_group_members`    | Add members to a group.                                                             |
| `remove_zha_group_members` | Remove members from a group.                                                        |
| `remove_zha_group`         | Delete group(s) by id (member devices untouched).                                   |

A ZHA group lives on the Zigbee coordinator and is exposed to HA as one group entity (e.g. a single
`light.*` that drives all members together via Zigbee multicast). This is **configuration
authoring**, not device control — like creating a helper, it changes what entities exist, not their
on/off state. The write tools call `zha/group/*` and **require an admin token**. Members must be
groupable ZHA endpoints (devices that support the Zigbee Groups cluster); `create_zha_group` /
`add_zha_group_members` accept `entity_id`s and resolve them to `{ieee, endpoint_id}` via
`list_zha_groupable`, or you can pass the `{ieee, endpoint_id}` pairs directly. The HA group entity
is created asynchronously, so read its final `entity_id` from the entity registry afterwards.

**Lovelace resources** (WebSocket)

| Tool                       | Description                                                                |
| -------------------------- | -------------------------------------------------------------------------- |
| `list_lovelace_resources`  | Registered dashboard resources (id, type, url), e.g. `/hacsfiles/…`.       |
| `create_lovelace_resource` | Register a JS/CSS URL loaded on every dashboard (defaults to module).      |
| `update_lovelace_resource` | Change a resource's url and/or type by id.                                 |
| `delete_lovelace_resource` | Remove a resource by id (e.g. the dangling one left after a HACS removal). |

Resources are the JS/CSS bundles loaded into every dashboard (Settings → Dashboards → Resources).
The write tools call `lovelace/resources/*`, **require an admin token**, and only work when the
resource registry is in **storage mode** (`lovelace: mode: storage`); they are disabled if Lovelace
is globally in YAML mode. This is config authoring, not device control.

**HACS** (WebSocket)

| Tool                     | Description                                                                     |
| ------------------------ | ------------------------------------------------------------------------------- |
| `list_hacs_repositories` | HACS repositories (installed-only by default): id, category, versions, paths.   |
| `remove_hacs_repository` | Uninstall a repository by id — deletes its downloaded files and unregisters it. |

`list_hacs_repositories` maps each repo to `id` + `local_path`/`file_name`, so you can tell which
`/hacsfiles/…` Lovelace resource belongs to a plugin. `remove_hacs_repository` calls
`hacs/repository/remove` (**admin token**) and deletes the plugin's files; when HACS manages
resources (storage mode) it also drops the plugin's Lovelace resource for you, so verify with
`list_lovelace_resources` and only `delete_lovelace_resource` one that's left behind. Removing an
integration you still reference in YAML will break that config, so check usage first.

## Safety boundary

- **No device control.** There is no generic `call_service`, no `set_state`, and no `fire_event`.
  The server cannot turn things on/off.
- **`reload` is restricted** to a fixed allowlist of `*.reload` / `homeassistant.reload_*` services.
  It restarts reloadable domains (e.g. re-reads `automations.yaml`) but cannot control devices.
- **Automation configs are writable** via the `/api/config/automation` REST API
  (`upsert_automation` / `delete_automation`). This is the server's core purpose — authoring
  automations — and needs an admin token. Be aware that an automation, once written, runs its
  actions whenever its triggers fire, so review configs before writing. The server still cannot run
  services directly: no `call_service`, `set_state`, or `fire_event`.
- **Energy dashboard config is writable** via `energy/save_prefs` (the `*_energy_*` tools). This is
  configuration authoring — the dashboard's sources and Individual-devices list — not device control,
  and it needs an admin token. No `call_service`, `set_state`, or `fire_event` is added.
- **ZHA groups are writable** via `zha/group/*` (the `*_zha_group*` tools). Creating/editing a Zigbee
  group changes which group entities exist (config authoring), not any device's on/off state, and it
  needs an admin token. Still no `call_service`, `set_state`, or `fire_event`.
- **Lovelace resources are writable** via `lovelace/resources/*` (the `*_lovelace_resource` tools) —
  which JS/CSS bundles load into dashboards. Config authoring, admin token, storage-mode only.
- **HACS repositories are removable** via `hacs/repository/remove` (`remove_hacs_repository`). This
  uninstalls a plugin/integration/theme and deletes its files (admin token); there is no install tool
  (the server never downloads third-party code). Still no `call_service`, `set_state`, or `fire_event`.
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
