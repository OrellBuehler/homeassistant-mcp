import { describe, it, expect, vi } from "vitest";
import { registerHacsTools } from "../tools/hacs.js";

type ToolHandler = (args: any) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function collectTools(command: any) {
  const tools = new Map<string, ToolHandler>();
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    },
  };
  registerHacsTools(server as any, { command } as any);
  return tools;
}

const REPOS = [
  {
    id: "100",
    name: "Bubble Card",
    full_name: "Clooos/Bubble-Card",
    category: "plugin",
    installed: true,
    installed_version: "3.0.0",
    available_version: "3.0.0",
    local_path: "www/community/Bubble-Card",
    file_name: "bubble-card.js",
    domain: null,
  },
  {
    id: "200",
    name: "Not Installed Card",
    full_name: "someone/not-installed",
    category: "plugin",
    installed: false,
  },
];

describe("hacs tools", () => {
  it("list_hacs_repositories defaults to installed-only and trims fields", async () => {
    const command = vi.fn().mockResolvedValue(REPOS);
    const tools = collectTools(command);
    const res = await tools.get("list_hacs_repositories")!({});
    expect(command).toHaveBeenCalledWith("hacs/repositories/list", {});
    const payload = JSON.parse(res.content[0].text);
    expect(payload.count).toBe(1);
    expect(payload.repositories[0]).toMatchObject({
      id: "100",
      name: "Bubble Card",
      file_name: "bubble-card.js",
    });
    expect(payload.repositories[0]).not.toHaveProperty("installed");
  });

  it("list_hacs_repositories includes not-installed repos when installed_only is false", async () => {
    const command = vi.fn().mockResolvedValue(REPOS);
    const tools = collectTools(command);
    const res = await tools.get("list_hacs_repositories")!({ installed_only: false });
    expect(JSON.parse(res.content[0].text).count).toBe(2);
  });

  it("list_hacs_repositories forwards a category filter", async () => {
    const command = vi.fn().mockResolvedValue([]);
    const tools = collectTools(command);
    await tools.get("list_hacs_repositories")!({ category: "plugin" });
    expect(command).toHaveBeenCalledWith("hacs/repositories/list", { categories: ["plugin"] });
  });

  it("remove_hacs_repository sends the id as the 'repository' param", async () => {
    const command = vi.fn().mockResolvedValue({});
    const tools = collectTools(command);
    const res = await tools.get("remove_hacs_repository")!({ repository_id: "100" });
    expect(command).toHaveBeenCalledWith("hacs/repository/remove", { repository: "100" });
    expect(JSON.parse(res.content[0].text)).toEqual({ repository_id: "100", removed: true });
  });

  it("returns an MCP error when the websocket command rejects", async () => {
    const command = vi.fn().mockRejectedValue(new Error("hacs not loaded"));
    const tools = collectTools(command);
    const res = await tools.get("remove_hacs_repository")!({ repository_id: "100" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("hacs not loaded");
  });
});
