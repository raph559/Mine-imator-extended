import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { newProject, startApp, tmpDir } from "./harness.mjs";

/** A mono 16-bit WAV file with a sine tone. */
function wav(seconds, rate = 44100, hz = 440) {
  const samples = Math.round(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 12000), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Whether an MP4 file has an audio track (a handler of type "soun"). */
const hasAudioTrack = (file) => readFileSync(file).includes(Buffer.from("hdlr\0\0\0\0\0\0\0\0soun"));

let app, call, dir;
before(async () => {
  app = await startApp();
  await newProject(app.client);
  call = (cmd, args, opts) => app.client.call(cmd, args, { timeoutMs: 300000, ...opts });
  dir = tmpDir();
  writeFileSync(`${dir}/beep.wav`, wav(1));
  writeFileSync(`${dir}/broken.wav`, "not audio at all");
});
after(() => app?.stop());

const undoSteps = async () => (await call("get_status")).undo_steps;
const keyframe = async (obj, frame) => (await call("get_object", { id: obj.id })).keyframes.find((k) => k.frame === frame);

test("import_sound adds a sound resource once it is decoded", async () => {
  const sound = await call("import_sound", { path: `${dir}/beep.wav` });
  assert.deepEqual([sound.type, sound.file, sound.used], ["sound", "beep.wav", false]);
  assert.equal((await call("get_status")).window_state, "");
});

test("import_sound refuses broken and missing files without a dialog", async () => {
  const before = (await call("list_resources")).resources.length;
  await assert.rejects(call("import_sound", { path: `${dir}/broken.wav` }), (err) => err.code === "bad_args");
  await assert.rejects(call("import_sound", { path: `${dir}/missing.wav` }), (err) => err.code === "not_found");
  await assert.rejects(call("import_sound", { path: `${dir}/beep.txt` }), (err) => err.code === "bad_args");
  assert.equal((await call("list_resources")).resources.length, before);
  assert.equal((await call("get_status")).window_state, "");
});

test("an audio object plays a sound from a keyframe, and exported movies include it", async () => {
  const sound = await call("import_sound", { path: `${dir}/beep.wav` });
  const track = await call("create_object", { type: "audio", name: "Beep" });
  assert.equal(track.type, "audio");
  await call("set_values", { id: track.id, frame: 0, values: { sound_obj: sound.id, sound_volume: 0.5 } });
  const kf = await keyframe(track, 0);
  assert.equal(kf.values.sound_obj, sound.id);
  assert.equal(kf.values.sound_volume, 0.5);
  assert.equal((await call("list_resources")).resources.find((r) => r.id === sound.id).used, true);

  const cube = await call("create_object", { type: "cube" });
  await call("set_keyframes", { keyframes: [{ id: cube.id, frame: 0, values: { pos_x: 0 } }, { id: cube.id, frame: 12, values: { pos_x: 16 } }] });

  const withAudio = `${dir}/with-audio.mp4`;
  await call("export_movie", { path: withAudio, start_frame: 0, end_frame: 12, high_quality: false });
  assert.ok(hasAudioTrack(withAudio), "the movie should have an audio track");

  const silent = `${dir}/silent.mp4`;
  await call("export_movie", { path: silent, start_frame: 0, end_frame: 12, high_quality: false, include_audio: false });
  assert.ok(!hasAudioTrack(silent), "the movie should have no audio track");
});

test("set_values takes resource ids for resource values, and null clears them", async () => {
  const sound = (await call("list_resources")).resources.find((r) => r.type === "sound");
  const track = await call("create_object", { type: "audio" });
  await call("set_values", { id: track.id, frame: 4, values: { sound_obj: sound.id } });
  await call("set_values", { id: track.id, frame: 4, values: { sound_obj: null } });
  assert.equal((await keyframe(track, 4)).values.sound_obj ?? null, null);

  const steps = await undoSteps();
  await assert.rejects(call("set_values", { id: track.id, values: { sound_obj: "no-such-id" } }), (err) => err.code === "not_found");
  await assert.rejects(call("set_values", { id: track.id, values: { sound_obj: track.id } }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_values", { id: track.id, values: { sound_obj: 5 } }), (err) => err.code === "bad_args");
  assert.equal(await undoSteps(), steps);
});

test("list_names lists the particle presets", async () => {
  const { names } = await call("list_names", { kind: "particles" });
  for (const name of ["Rain", "Smoke", "Snow", "high_fire"]) assert.ok(names.includes(name), name);
});

test("create_object makes a particle spawner from a preset, with spawner settings", async () => {
  const rain = await call("create_object", { type: "particles", preset: "Rain", name: "Rain" });
  assert.equal(rain.type, "particles");
  const s = (await call("get_object", { id: rain.id })).settings;
  for (const key of ["spawn_continuous", "spawn_amount", "spawn_region", "spawn_sphere_radius", "spawn_cube_size", "spawn_box_size", "lifetime", "max_particles", "remove_at_animation_end"])
    assert.ok(key in s, key);
  assert.equal(typeof s.spawn_continuous, "boolean");
  assert.ok(["none", "sphere", "cube", "box", "path"].includes(s.spawn_region));
  assert.equal(s.spawn_box_size.length, 3);
});

test("set_object_settings changes a spawner and undo puts it back", async () => {
  const smoke = await call("create_object", { type: "particles", preset: "Smoke" });
  const before = (await call("get_object", { id: smoke.id })).settings;
  const wanted = {
    spawn_continuous: !before.spawn_continuous,
    spawn_amount: 37,
    spawn_region: "box",
    spawn_box_size: [64, 32, 16],
    spawn_sphere_radius: 24,
    lifetime: 2.5,
    max_particles: 300,
    remove_at_animation_end: !before.remove_at_animation_end,
  };
  const result = await call("set_object_settings", { id: smoke.id, settings: wanted });
  for (const [key, value] of Object.entries(wanted)) assert.deepEqual(result.settings[key], value, key);

  const off = await call("set_object_settings", { id: smoke.id, settings: { lifetime: null, max_particles: null, spawn_region: "none" } });
  assert.deepEqual([off.settings.lifetime, off.settings.max_particles, off.settings.spawn_region], [null, null, "none"]);

  await call("undo", { steps: result.undo_steps + off.undo_steps });
  const back = (await call("get_object", { id: smoke.id })).settings;
  for (const key of Object.keys(wanted)) assert.deepEqual(back[key], before[key], key);

  // Spawning is keyframed
  await call("set_values", { id: smoke.id, frame: 20, values: { spawn: false } });
  assert.equal((await keyframe(smoke, 20)).values.spawn, false);
});

test("particle requests are checked before anything changes", async () => {
  const count = (await call("get_scene")).objects.length;
  await assert.rejects(call("create_object", { type: "particles", preset: "no_such_preset" }), (err) => err.code === "not_found");
  await assert.rejects(call("create_object", { type: "cube", preset: "Rain" }), (err) => err.code === "bad_args");
  assert.equal((await call("get_scene")).objects.length, count);

  const spawner = await call("create_object", { type: "particles" });
  const cube = await call("create_object", { type: "cube" });
  const steps = await undoSteps();
  const bad = [
    { spawn_amount: 0 },
    { spawn_amount: "lots" },
    { spawn_region: "triangle" },
    { spawn_box_size: [1, 2] },
    { lifetime: -1 },
    { max_particles: 0 },
    { spawn_continuous: "yes" },
  ];
  for (const s of bad)
    await assert.rejects(call("set_object_settings", { id: spawner.id, settings: s }), (err) => err.code === "bad_args", JSON.stringify(s));
  await assert.rejects(call("set_object_settings", { id: cube.id, settings: { spawn_amount: 5 } }), (err) => err.code === "bad_args");
  assert.equal(await undoSteps(), steps);
});
