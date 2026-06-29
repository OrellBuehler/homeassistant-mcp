import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, err } from "../hass/format.js";
import type { HassWsClient } from "../hass/ws.js";

interface ZhaEntityRef {
  entity_id: string;
  name?: string;
}

interface ZhaDeviceInfo {
  ieee: string;
  name?: string;
  user_given_name?: string | null;
  manufacturer?: string;
  model?: string;
}

interface GroupableEndpoint {
  name?: string;
  endpoint_id: number;
  entities: ZhaEntityRef[];
  device: ZhaDeviceInfo;
}

const memberSchema = z.union([
  z.string(),
  z.object({
    ieee: z.string(),
    endpoint_id: z.number().int().nonnegative(),
  }),
]);

type Member = z.infer<typeof memberSchema>;
type ResolvedMember = { ieee: string; endpoint_id: number };

async function resolveMembers(ws: HassWsClient, members: Member[]): Promise<ResolvedMember[]> {
  const needLookup = members.some((m) => typeof m === "string");
  let groupable: GroupableEndpoint[] = [];
  if (needLookup) {
    groupable = (await ws.command("zha/devices/groupable")) as GroupableEndpoint[];
  }
  return members.map((m) => {
    if (typeof m !== "string") return { ieee: m.ieee, endpoint_id: m.endpoint_id };
    const hit = groupable.find((ep) => ep.entities?.some((e) => e.entity_id === m));
    if (!hit) {
      throw new Error(
        `'${m}' is not a groupable ZHA entity. A ZHA group member must be a ZHA entity on an endpoint that supports the Zigbee Groups cluster (see list_zha_groupable). Non-ZHA entities (Wi-Fi/Shelly/Hue-bridge/etc.) cannot join a ZHA group.`,
      );
    }
    return { ieee: hit.device.ieee, endpoint_id: hit.endpoint_id };
  });
}

export function registerZhaTools(server: McpServer, ws: HassWsClient) {
  server.tool(
    "list_zha_groups",
    "List existing ZHA (Zigbee) groups via the WebSocket API (zha/groups). Each group has a group_id, name and its members. A ZHA group lives on the Zigbee coordinator and is exposed to HA as a single group entity (e.g. one light.* that drives all members together via Zigbee multicast).",
    {},
    async () => {
      try {
        return ok(await ws.command("zha/groups"));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "list_zha_groupable",
    "List ZHA device endpoints that can be added to a ZHA group (zha/devices/groupable) — endpoints whose device supports the Zigbee Groups cluster. Returns, per endpoint, its ieee + endpoint_id and the entities on it, so you can choose group members by entity_id. Use this to see what create_zha_group / add_zha_group_members accept.",
    {},
    async () => {
      try {
        const eps = (await ws.command("zha/devices/groupable")) as GroupableEndpoint[];
        const endpoints = eps.map((ep) => ({
          ieee: ep.device?.ieee ?? null,
          endpoint_id: ep.endpoint_id,
          device_name: ep.device?.user_given_name ?? ep.device?.name ?? null,
          entities: (ep.entities ?? []).map((e) => e.entity_id),
        }));
        return ok({ count: endpoints.length, endpoints });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "create_zha_group",
    "Create a ZHA (Zigbee) group on the coordinator (zha/group/add) and return the new group (group_id, name, members). This is configuration authoring — it does not switch anything; it tells the Zigbee network to treat the members as one group, and HA then exposes a single group entity (e.g. light.<name>) that controls them together via Zigbee multicast. 'members' is optional and accepts entity_ids (resolved to ieee+endpoint via list_zha_groupable) and/or explicit {ieee, endpoint_id} objects; only groupable ZHA entities are valid. The HA group entity is created asynchronously and may not be in this response — read its entity_id from the entity registry afterwards.",
    {
      name: z.string().describe("Friendly name for the new group, e.g. 'Iris TV'"),
      members: z
        .array(memberSchema)
        .optional()
        .describe(
          "Initial members: entity_ids (e.g. 'light.philips_iris_tv_left') and/or {ieee, endpoint_id} objects. Omit to create an empty group and add members later.",
        ),
    },
    async ({ name, members }) => {
      try {
        const payload: Record<string, unknown> = { group_name: name };
        if (members && members.length) payload.members = await resolveMembers(ws, members);
        return ok(await ws.command("zha/group/add", payload));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "add_zha_group_members",
    "Add members to an existing ZHA group (zha/group/members/add). 'members' accepts entity_ids (resolved via list_zha_groupable) and/or {ieee, endpoint_id} objects. Returns the updated group.",
    {
      group_id: z.number().int().describe("Target group_id (from list_zha_groups)"),
      members: z
        .array(memberSchema)
        .min(1)
        .describe("Members to add: entity_ids and/or {ieee, endpoint_id} objects"),
    },
    async ({ group_id, members }) => {
      try {
        const resolved = await resolveMembers(ws, members);
        return ok(await ws.command("zha/group/members/add", { group_id, members: resolved }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "remove_zha_group_members",
    "Remove members from an existing ZHA group (zha/group/members/remove). 'members' accepts entity_ids (resolved via list_zha_groupable) and/or {ieee, endpoint_id} objects. Returns the updated group.",
    {
      group_id: z.number().int().describe("Target group_id (from list_zha_groups)"),
      members: z
        .array(memberSchema)
        .min(1)
        .describe("Members to remove: entity_ids and/or {ieee, endpoint_id} objects"),
    },
    async ({ group_id, members }) => {
      try {
        const resolved = await resolveMembers(ws, members);
        return ok(await ws.command("zha/group/members/remove", { group_id, members: resolved }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "remove_zha_group",
    "Delete one or more ZHA groups by id (zha/group/remove). This removes the group from the Zigbee coordinator and its HA group entity; the member devices themselves are untouched. Returns the remaining groups.",
    {
      group_ids: z.array(z.number().int()).min(1).describe("group_id(s) to delete"),
    },
    async ({ group_ids }) => {
      try {
        return ok(await ws.command("zha/group/remove", { group_ids }));
      } catch (e) {
        return err(e);
      }
    },
  );
}
