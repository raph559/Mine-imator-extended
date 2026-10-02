import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startApp, TEST_PORT, tmpDir } from "./harness.mjs";

let app, mcp;
const folder = tmpDir();
const call = async (name, args = {}) => {
  const result = await mcp.callTool({ name, arguments: args });
  assert.ok(!result.isError, `${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
};

before(async () => {
  app = await startApp();
  mcp = new Client({ name: "acceptance", version: "0.0.0" });
  await mcp.connect(new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../../src/server.mjs", import.meta.url))],
    env: { ...process.env, MINEIMATOR_BRIDGE_PORT: String(TEST_PORT) },
  }));
});
after(async () => { await mcp?.close(); app?.stop(); });

test("character walks, camera moves, project saves, frame exports", async () => {
  await call("project_new", { name: "acceptance", folder });

  const char = await call("create_object", { type: "character", name: "Hero" });
  await call("set_values", { id: char.id, frame: 0, values: { pos_x: -48, pos_y: 0 } });
  await call("set_values", { id: char.id, frame: 48, values: { pos_x: 48, pos_y: 0, transition: "easeinoutquad" } });

  // Camera heading: rot_z 0 looks along +Y, positive rot_x pitches down. -22 turns the short way to keep Hero in frame.
  const camera = await call("create_object", { type: "camera", name: "Shot" });
  await call("set_values", { id: camera.id, frame: 0, values: { pos_x: 0, pos_y: -120, pos_z: 40, rot_x: 10, rot_z: 0 } });
  await call("set_values", { id: camera.id, frame: 48, values: { pos_x: 40, pos_y: -100, pos_z: 40, rot_x: 10, rot_z: -22 } });

  const hero = await call("get_object", { id: char.id });
  assert.deepEqual(hero.frames, [0, 48]);
  assert.equal(hero.name, "Hero");

  await call("set_frame", { frame: 24 });
  const saved = await call("project_save");
  assert.equal(saved.project_changed, false);
  const project = JSON.parse(readFileSync(saved.project_file, "utf8"));
  assert.ok(project.timelines.some((t) => t.id === char.id));

  const path = `${folder}/frame24.png`;
  const exported = await mcp.callTool({ name: "export_image", arguments: { path, high_quality: false } });
  assert.ok(!exported.isError, exported.content[0].text);
  assert.ok(existsSync(path));
  assert.equal(exported.content[1].type, "image");
  console.log(`Exported frame: ${path}`);
});
