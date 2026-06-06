#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { client, wsClient } from "./config.js";
import { createServer } from "./server.js";

const server = createServer(client, wsClient);
const transport = new StdioServerTransport();
await server.connect(transport);
