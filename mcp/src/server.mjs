#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BridgeClient } from "./bridge-client.mjs";
import { launchApp } from "./launcher.mjs";
import { describeError, prepareArgs, tools } from "./tools.mjs";

const port = Number(process.env.MINEIMATOR_BRIDGE_PORT ?? 41234);
const bridge = new BridgeClient({ port });
const server = new McpServer({ name: "mineimator", version: "0.1.0" });

const text = (value) => ({ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) });
const failure = (err) => ({ isError: true, content: [text(describeError(err))] });

for (const tool of tools) {
  server.registerTool(tool.name, { description: tool.description, inputSchema: tool.shape }, async (input) => {
    try {
      const args = await prepareArgs(tool, input);
      const result = await bridge.call(tool.cmd, args, { timeoutMs: tool.timeoutMs });
      const content = [text(result)];
      if (tool.returnsImage)
        content.push({ type: "image", data: (await readFile(result.path)).toString("base64"), mimeType: "image/png" });
      return { content };
    } catch (err) {
      return failure(err);
    }
  });
}

server.registerTool(
  "launch_app",
  {
    description: "Start the Mine-imator custom build with the bridge enabled and wait until it is ready. Does nothing if it is already running. Call this first when other tools report that Mine-imator is not running.",
    inputSchema: {},
  },
  async () => {
    try {
      return { content: [text(await launchApp(bridge, { port }))] };
    } catch (err) {
      return failure(err);
    }
  },
);

await server.connect(new StdioServerTransport());
