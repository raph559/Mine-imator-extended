#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BridgeClient } from "./bridge-client.mjs";
import { imageContent } from "./image.mjs";
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
      if (tool.returnsImage) content.push(...(await imageContent(result.path)));
      return { content };
    } catch (err) {
      return failure(err);
    }
  });
}

server.registerTool(
  "launch_app",
  {
    description: "Start the Mine-imator custom build with the bridge enabled and wait until it is ready. Does nothing if it is already running. Call this first when other tools report that Mine-imator is not running. With background true the window is kept off screen and never takes the focus, for working while the person is busy with something else; they cannot see or use the app in that mode.",
    inputSchema: { background: z.boolean().optional().describe("Start invisibly, without taking the focus. Default false") },
  },
  async ({ background }) => {
    try {
      return { content: [text(await launchApp(bridge, { port, background }))] };
    } catch (err) {
      return failure(err);
    }
  },
);

await server.connect(new StdioServerTransport());
