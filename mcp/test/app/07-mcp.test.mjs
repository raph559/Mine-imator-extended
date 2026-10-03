import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startApp, TEST_PORT, tmpDir } from "./harness.mjs";

let app, mcp;
const json = (result) => JSON.parse(result.content[0].text);

before(async () => {
  app = await startApp();
  mcp = new Client({ name: "test", version: "0.0.0" });
  await mcp.connect(new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../../src/server.mjs", import.meta.url))],
    env: { ...process.env, MINEIMATOR_BRIDGE_PORT: String(TEST_PORT) },
  }));
});
after(async () => { await mcp?.close(); await app?.stop(); });

test("lists every tool", async () => {
  const names = (await mcp.listTools()).tools.map((t) => t.name);
  for (const name of ["launch_app", "get_status", "create_object", "set_values", "set_keyframes", "screenshot", "export_image", "export_movie"])
    assert.ok(names.includes(name), name);
  assert.equal(names.length, 48);
});

test("launch_app reports the running app without starting another", async () => {
  assert.equal(json(await mcp.callTool({ name: "launch_app", arguments: {} })).launched, false);
});

test("drives the app: project, object, keyframes, screenshot with image content", async () => {
  const folder = tmpDir().replaceAll("/", "\\"); // Windows-style input must be accepted
  assert.equal(json(await mcp.callTool({ name: "project_new", arguments: { name: "mcp", folder, discard: true } })).project_name, "mcp");
  const cube = json(await mcp.callTool({ name: "create_object", arguments: { type: "cube" } }));
  await mcp.callTool({ name: "set_values", arguments: { id: cube.id, frame: 0, values: { pos_z: 0 } } });
  await mcp.callTool({ name: "set_values", arguments: { id: cube.id, frame: 24, values: { pos_z: 32, transition: "easeoutbounce" } } });
  assert.deepEqual(json(await mcp.callTool({ name: "get_object", arguments: { id: cube.id } })).frames, [0, 24]);
  const shot = await mcp.callTool({ name: "screenshot", arguments: {} });
  assert.equal(shot.content[1].type, "image");
  assert.equal(shot.content[1].mimeType, "image/png");
  assert.ok(shot.content[1].data.length > 1000);
  rmSync(json(shot).path, { force: true }); // the server saved it to a temp file because no path was given
});

test("bridge errors come back as tool errors with the code", async () => {
  const result = await mcp.callTool({ name: "get_object", arguments: { id: "no-such-id" } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^not_found: /);
});

test("invalid input is rejected before it reaches the app", async () => {
  const result = await mcp.callTool({ name: "set_frame", arguments: { frame: -5 } }).catch((err) => ({ isError: true, content: [{ text: String(err.message) }] }));
  assert.equal(result.isError, true);
});
