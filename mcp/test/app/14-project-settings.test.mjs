import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { newProject, startApp, tmpDir } from "./harness.mjs";

let app, call;
before(async () => {
  app = await startApp();
  await newProject(app.client);
  call = (cmd, args, opts) => app.client.call(cmd, args, { timeoutMs: 120000, ...opts });
});
after(() => app?.stop());

test("get_project_settings reports the defaults of a new project", async () => {
  const s = await call("get_project_settings");
  assert.equal(s.tempo, 24);
  assert.deepEqual([s.video_width, s.video_height, s.video_keep_aspect_ratio], [1280, 720, true]);
  assert.equal(s.render_preset, "performance");
  assert.equal(typeof s.render_samples, "number");
  assert.equal(typeof s.render_shadows, "boolean");
  assert.equal(s.background.sky_time, -45);
  assert.equal(s.background.biome, "plains");
});

test("set_project_settings changes tempo, exact resolution and render options, and undo restores them", async () => {
  const before = await call("get_project_settings");
  const wanted = { tempo: 30, video_width: 1000, video_height: 1000, render_samples: 8, render_shadows: !before.render_shadows };
  const result = await call("set_project_settings", { settings: wanted });
  assert.equal(result.undo_steps, 5);
  const now = await call("get_project_settings");
  for (const [key, value] of Object.entries(wanted)) assert.equal(now[key], value, key);
  assert.equal(now.video_keep_aspect_ratio, true); // unchanged, even though both sizes were set

  assert.equal((await call("set_project_settings", { settings: wanted })).undo_steps, 0);

  await call("undo", { steps: 5 });
  const back = await call("get_project_settings");
  for (const key of Object.keys(wanted)) assert.equal(back[key], before[key], key);
});

test("setting only the width keeps the aspect ratio", async () => {
  await call("set_project_settings", { settings: { video_width: 640 } });
  const s = await call("get_project_settings");
  assert.deepEqual([s.video_width, s.video_height], [640, 360]);
});

test("exports use the project resolution", async () => {
  const path = `${tmpDir()}/small.png`;
  await call("export_image", { path, high_quality: false });
  const png = readFileSync(path);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [640, 360]);
});

test("a render preset can be chosen by name", async () => {
  await call("set_project_settings", { settings: { render_preset: "balanced" } });
  assert.equal((await call("get_project_settings")).render_preset, "balanced");
  await assert.rejects(call("set_project_settings", { settings: { render_preset: "no_such_preset" } }), (err) => err.code === "not_found");
});

test("set_project_settings applies nothing when any setting is wrong", async () => {
  const before = await call("get_project_settings");
  const bad = [
    { tempo: 30, no_such_setting: 1 },
    { tempo: 0 },
    { tempo: 500 },
    { tempo: "fast" },
    { tempo: 30, video_width: 0 },
    { tempo: 30, render_samples: 1000 },
    { tempo: 30, render_shadows: "yes" },
    {},
  ];
  for (const s of bad)
    await assert.rejects(call("set_project_settings", { settings: s }), (err) => err.code === "bad_args", JSON.stringify(s));
  await assert.rejects(call("set_project_settings", {}), (err) => err.code === "bad_args");
  assert.deepEqual(await call("get_project_settings"), before);
});

test("every background setting can be set and reads back the same", async () => {
  const numbers = ["sky_time", "sky_rotation", "sunlight_strength", "sunlight_angle", "sky_sun_angle", "sky_sun_scale", "sky_moon_angle",
    "sky_moon_scale", "sky_clouds_speed", "sky_clouds_height", "sky_clouds_size", "sky_clouds_thickness", "sky_clouds_offset",
    "fog_distance", "fog_size", "fog_height", "wind_speed", "wind_strength", "wind_direction"];
  const bools = ["sky_clouds_show", "fog_show", "fog_sky", "fog_color_custom", "twilight", "wind", "ground_show"];
  const colors = ["sky_color", "sky_clouds_color", "sunlight_color", "ambient_color", "night_color", "grass_color", "foliage_color", "water_color", "fog_color"];

  const current = (await call("get_project_settings")).background;
  assert.deepEqual(Object.keys(current).sort(), [...numbers, ...bools, ...colors, "biome", "sky_moon_phase"].sort());

  for (const name of numbers) {
    const value = current[name] + 0.5;
    const result = await call("set_background", { [name]: value });
    assert.ok(Math.abs(result[name] - value) < 1e-6, `${name}: set ${value}, read ${result[name]}`);
  }
  for (const name of bools) {
    const result = await call("set_background", { [name]: !current[name] });
    assert.equal(result[name], !current[name], name);
  }
  for (const name of colors) {
    const result = await call("set_background", { [name]: "#12AB56" });
    assert.equal(result[name], "#12AB56", name);
  }
  assert.equal((await call("set_background", { sky_moon_phase: 3 })).sky_moon_phase, 3);
  await assert.rejects(call("set_background", { sky_moon_phase: 9 }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_background", { no_such_setting: 1 }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_background", { fog_height: "tall" }), (err) => err.code === "bad_args");
});
