import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { BridgeError } from "../../src/bridge-client.mjs";
import { describeError, normalizePath, prepareArgs, tools } from "../../src/tools.mjs";

const tool = (name) => tools.find((t) => t.name === name);

test("tool names and bridge commands are unique and every tool is documented", () => {
  assert.equal(new Set(tools.map((t) => t.name)).size, tools.length);
  assert.equal(new Set(tools.map((t) => t.cmd)).size, tools.length);
  for (const t of tools) assert.ok(t.description.length > 20, t.name);
});

test("every bridge command has a tool", () => {
  const commands = ["get_status", "project_new", "project_open", "project_save", "get_scene", "get_object",
    "create_object", "remove_object", "rename_object", "set_parent", "select", "set_object_settings", "list_names", "undo", "redo",
    "set_frame", "set_values", "set_keyframes", "remove_keyframes", "move_keyframes",
    "set_work_camera", "play", "stop", "screenshot", "export_image", "export_movie", "set_background"];
  assert.deepEqual(tools.map((t) => t.cmd).sort(), commands.sort());
});

test("normalizePath turns backslashes into forward slashes", () => {
  assert.equal(normalizePath("C:\\Users\\me\\a b.png"), "C:/Users/me/a b.png");
});

test("prepareArgs normalizes path arguments and leaves the rest alone", async () => {
  assert.deepEqual(await prepareArgs(tool("project_open"), { path: "C:\\p\\a.miproject" }), { path: "C:/p/a.miproject" });
  assert.deepEqual(await prepareArgs(tool("create_object"), { type: "char", skin: "C:\\s\\me.png" }), { type: "char", skin: "C:/s/me.png" });
  assert.deepEqual(await prepareArgs(tool("set_values"), { id: "a", values: { pos_x: 1 } }), { id: "a", values: { pos_x: 1 } });
});

test("image tools get a fresh temp path when none is given", async () => {
  const args = await prepareArgs(tool("screenshot"), {});
  assert.match(args.path, /\/mineimator-mcp\/screenshot-\d+\.png$/);
  assert.ok(!args.path.includes("\\"));
  assert.ok(existsSync(path.dirname(args.path)));
});

test("input shapes reject bad input and accept good input", () => {
  assert.ok(z.object(tool("set_values").shape).safeParse({ id: "a", frame: 0, values: { pos_x: 1, transition: "linear", spawn: true } }).success);
  assert.ok(!z.object(tool("set_values").shape).safeParse({ id: "a", frame: -1, values: {} }).success);
  assert.ok(!z.object(tool("create_object").shape).safeParse({ type: "scenery" }).success);
  assert.ok(!z.object(tool("set_work_camera").shape).safeParse({ focus: [1, 2] }).success);
  assert.ok(z.object(tool("set_keyframes").shape).safeParse({ keyframes: [{ id: "a", frame: 0, values: { pos_x: 1 } }] }).success);
  assert.ok(!z.object(tool("set_keyframes").shape).safeParse({ keyframes: [] }).success);
  assert.ok(!z.object(tool("set_keyframes").shape).safeParse({ keyframes: [{ id: "a", values: { pos_x: 1 } }] }).success);
  assert.ok(z.object(tool("export_movie").shape).safeParse({ path: "C:/v/a.mp4", start_frame: 0, end_frame: 48 }).success);
  assert.ok(!z.object(tool("export_movie").shape).safeParse({ path: "C:/v/a.mp4", frame_rate: 0 }).success);
  assert.ok(!z.object(tool("undo").shape).safeParse({ steps: 0 }).success);
  const settings = z.object(tool("set_object_settings").shape);
  assert.ok(settings.safeParse({ id: "a", settings: { hidden: true, pivot: [0, 0, 16] } }).success);
  assert.ok(settings.safeParse({ id: "a", settings: { pivot: null } }).success);
  assert.ok(!settings.safeParse({ id: "a", settings: { no_such_setting: true } }).success);
  assert.ok(!settings.safeParse({ id: "a", settings: { pivot: [1, 2] } }).success);
  assert.ok(!z.object(tool("list_names").shape).safeParse({ kind: "sounds" }).success);
});

test("describeError explains bridge and connection failures", () => {
  assert.equal(describeError(new BridgeError("not_found", "No object with id x")), "not_found: No object with id x");
  assert.match(describeError(Object.assign(new Error("connect"), { code: "ECONNREFUSED" })), /launch_app/);
  assert.match(describeError(new BridgeError("busy_modal", "dialog")), /busy_modal/);
});
