import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { newProject, startApp, tmpDir } from "./harness.mjs";

let app, call;
const out = tmpDir();
before(async () => {
  app = await startApp();
  await newProject(app.client);
  call = (cmd, args, opts) => app.client.call(cmd, args, opts);
  await call("create_object", { type: "cube" });
});
after(() => app?.stop());

function pngSize(file) {
  const data = readFileSync(file);
  assert.equal(data.subarray(1, 4).toString("latin1"), "PNG");
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

test("set_work_camera sets and reports the viewport camera", async () => {
  const cam = await call("set_work_camera", { focus: [0, 0, 8], angle_xy: 45, angle_z: 20, zoom: 150 });
  assert.deepEqual(cam, { focus: [0, 0, 8], angle_xy: 45, angle_z: 20, zoom: 150 });
  assert.equal((await call("set_work_camera", { zoom: 80 })).angle_xy, 45);
  await assert.rejects(call("set_work_camera", { focus: [1, 2] }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_work_camera", { zoom: 0 }), (err) => err.code === "bad_args");
});

test("play and stop toggle playback", async () => {
  assert.equal((await call("play")).playing, true);
  assert.equal((await call("get_status")).playing, true);
  assert.equal((await call("stop")).playing, false);
  assert.equal((await call("get_status")).playing, false);
});

test("screenshot writes a PNG of the main view", async () => {
  const path = `${out}/view.png`;
  assert.deepEqual(await call("screenshot", { path }), { path });
  assert.ok(pngSize(path).width > 0);
});

test("screenshot and export_image refuse existing files, missing folders and non-PNG paths", async () => {
  const existing = `${out}/keep.png`;
  writeFileSync(existing, "keep me");
  for (const cmd of ["screenshot", "export_image"]) {
    await assert.rejects(call(cmd, { path: existing }), (err) => err.code === "bad_args");
    await assert.rejects(call(cmd, { path: `${out}/no-such-folder/a.png` }), (err) => err.code === "bad_args");
    await assert.rejects(call(cmd, { path: `${out}/a.jpg` }), (err) => err.code === "bad_args");
    await assert.rejects(call(cmd, {}), (err) => err.code === "bad_args");
  }
  assert.equal(readFileSync(existing, "utf8"), "keep me");
  assert.equal((await call("get_status")).window_state, "");
  await call("screenshot", { path: existing, overwrite: true });
  assert.ok(pngSize(existing).width > 0);
});

test("export_image renders the project resolution and returns when the file exists", async () => {
  const path = `${out}/render.png`;
  const result = await call("export_image", { path, high_quality: false }, { timeoutMs: 120000 });
  assert.deepEqual(result, { path, width: 1280, height: 720 });
  assert.ok(existsSync(path));
  assert.deepEqual(pngSize(path), { width: 1280, height: 720 });
  assert.equal((await call("get_status")).window_state, "");
});

test("commands sent during an export are answered after it, in order", async () => {
  const path = `${out}/render2.png`;
  const [exported, status] = await Promise.all([
    call("export_image", { path, high_quality: false }, { timeoutMs: 120000 }),
    call("get_status", {}, { timeoutMs: 120000 }),
  ]);
  assert.equal(exported.path, path);
  assert.equal(status.window_state, "");
});

test("set_background changes and reports background settings", async () => {
  const bg = await call("set_background", { ground_show: false, sky_color: "#102030", sky_time: 90 });
  assert.equal(bg.ground_show, false);
  assert.equal(bg.sky_color, "#102030");
  assert.equal(bg.sky_time, 90);
  await assert.rejects(call("set_background", { biome: "no_such_biome" }), (err) => err.code === "not_found");
  await assert.rejects(call("set_background", { ground_show: "yes" }), (err) => err.code === "bad_args");
  assert.equal((await call("set_background", {})).ground_show, false);
});
