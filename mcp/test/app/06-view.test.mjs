import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { decodePng, newProject, startApp, tmpDir } from "./harness.mjs";

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

test("get_status answers during an export, other commands wait for it", async () => {
  const path = `${out}/render2.png`;
  const exported = call("export_image", { path, high_quality: false }, { timeoutMs: 120000 });
  const status = await call("get_status", {}, { timeoutMs: 120000 });
  const scene = call("get_scene", {}, { timeoutMs: 120000 });
  assert.equal(status.window_state, "export_image");
  assert.equal((await exported).path, path);
  assert.ok(Array.isArray((await scene).objects));
  assert.equal((await call("get_status")).window_state, "");
});

test("set_background changes and reports background settings", async () => {
  const bg = await call("set_background", { ground_show: false, sky_color: "#102030", sky_time: 90 });
  assert.equal(bg.ground_show, false);
  assert.equal(bg.sky_color, "#102030");
  assert.equal(bg.sky_time, 90);
  await assert.rejects(call("set_background", { biome: "no_such_biome" }), (err) => err.code === "not_found");
  await assert.rejects(call("set_background", { ground_show: "yes" }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_background", { sky_color: "#zzzzzz" }), (err) => err.code === "bad_args");
  assert.equal((await call("set_background", {})).sky_color, "#102030");
  assert.equal((await call("set_background", {})).ground_show, false);
});

// A high-quality export renders its samples without finishing the image after each one;
// the saved image must still be the finished one: every sample in, post effects applied
test("a high-quality export_image is the finished image: samples accumulated, camera effects applied", async () => {
  await call("set_project_settings", { settings: { video_width: 320, video_height: 180, render_samples: 6 } });
  const cam = await call("create_object", { type: "camera" });
  await call("set_values", { id: cam.id, frame: 0, values: { pos_x: 0, pos_y: -200, pos_z: 40, rot_x: 0, rot_z: 0 } });
  await call("select", { ids: [] });
  const corner = async (name, values) => {
    await call("set_values", { id: cam.id, frame: 0, values });
    await call("select", { ids: [] });
    const path = `${out}/${name}.png`;
    await call("export_image", { path, high_quality: true, overwrite: true }, { timeoutMs: 120000 });
    const image = decodePng(readFileSync(path));
    let sum = 0;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) for (let c = 0; c < 3; c++) sum += image.data[(y * image.width + x) * image.channels + c];
    return { sum, bytes: readFileSync(path) };
  };
  const plain = await corner("hq-plain", { cam_vignette: false });
  const vignette = await corner("hq-vignette", { cam_vignette: true, cam_vignette_strength: 1 });
  assert.ok(vignette.sum < plain.sum * 0.8, `the vignette darkens the corner (${vignette.sum} against ${plain.sum})`);
  // Same scene, same settings: the same image
  const again = await corner("hq-vignette-again", { cam_vignette: true, cam_vignette_strength: 1 });
  assert.ok(vignette.bytes.equals(again.bytes), "two exports of the same frame are identical");
  assert.equal((await call("get_status")).window_state, "");
});
