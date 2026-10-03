import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { particleTypeSettingNames } from "../../src/tools.mjs";
import { setTimeout as sleep } from "node:timers/promises";
import { countPixels, decodePng, newProject, png, startApp, tmpDir } from "./harness.mjs";

let app, call, spawner;
before(async () => {
  app = await startApp();
  await newProject(app.client);
  call = (cmd, args) => app.client.call(cmd, args);
  spawner = await call("create_object", { type: "particles", preset: "Smoke", name: "Puff" });
});
after(() => app?.stop());

const types = async () => (await call("get_object", { id: spawner.id })).particle_types;
const undoSteps = async () => (await call("get_status")).undo_steps;

test("get_object lists the particle types of a spawner with every setting", async () => {
  const list = await types();
  assert.ok(list.length >= 1, "the Smoke preset has types");
  for (const type of list) {
    assert.equal(typeof type.id, "string");
    for (const name of particleTypeSettingNames) assert.ok(name in type, `${type.name} has ${name}`);
    assert.deepEqual(Object.keys(type).filter((k) => k !== "id" && k !== "undo_steps" && !particleTypeSettingNames.includes(k)), []);
    assert.equal(type.spd.length, 3);
  }
  assert.ok((await call("get_object", { id: (await call("create_object", { type: "cube" })).id })).particle_types === undefined);
});

test("list_names lists the sprites a particle type can use", async () => {
  const { names } = await call("list_names", { kind: "particle_sprites" });
  for (const name of ["generic", "flame"]) assert.ok(names.includes(name), name);
  assert.ok(names.length > 10);
});

test("every setting can be set and reads back the same", async () => {
  const [first] = await types();
  const { names: sprites } = await call("list_names", { kind: "particle_sprites" });
  const sprite = sprites.find((n) => n !== first.sprite_template);

  const wanted = {
    name: "Test type",
    text: "Hello",
    kind: "sheet",
    sprite_sheet: "default",
    sprite_sheet_image: first.sprite_sheet_image === 0 ? 1 : 0,
    spawn_rate: 40,
    sprite_template: sprite,
    sprite_animation_onend: "loop",
    scale: 1.5, scale_add: "-0.2..-0.1", alpha: 0.4, alpha_add: "-0.1..0.05",
    sprite_angle: "10..80", sprite_angle_add: 5,
    angle_speed: 12, angle_speed_add: "1..2", angle_speed_mul: 0.5,
    color_mix_time: "1..3", sprite_animation_speed: 7,
    color: "#336699", color_mix: "#112233..#AABBCC",
    bounce_factor: 0.75, sprite_frame_width: 16, sprite_frame_height: 16, sprite_frame_start: 3, sprite_frame_end: 1,
  };
  for (const name of ["spawn_region", "bounding_box", "bounce", "orbit", "color_mix_enabled", "sprite_template_still_frame", "sprite_template_random_frame", "sprite_template_reverse", "angle_extend", "spd_extend", "rot_extend", "rot_spd_extend"])
    wanted[name] = !first[name];
  for (const name of ["angle", "spd", "spd_add", "spd_mul", "rot", "rot_spd", "rot_spd_add", "rot_spd_mul"]) wanted[name] = [1.5, "2..4", -3];
  assert.deepEqual(Object.keys(wanted).sort(), particleTypeSettingNames.slice().sort(), "every setting is covered");

  const steps = await undoSteps();
  const result = await call("set_particle_type", { id: spawner.id, type: first.id, settings: wanted });
  for (const [name, value] of Object.entries(wanted)) assert.deepEqual(result[name], value, name);
  assert.ok(result.undo_steps >= 30, `undo steps: ${result.undo_steps}`);
  assert.equal(await undoSteps() - steps, result.undo_steps);
  const { undo_steps, ...settings } = result;
  assert.deepEqual((await types()).find((t) => t.id === first.id), settings);

  // The same again changes nothing
  assert.equal((await call("set_particle_type", { id: spawner.id, type: first.id, settings: wanted })).undo_steps, 0);

  // Everything goes back
  await call("undo", { steps: result.undo_steps });
  const back = (await types()).find((t) => t.id === first.id);
  for (const name of particleTypeSettingNames) assert.deepEqual(back[name], first[name], name);
});

test("a random range turns back into a plain value, and null leaves an axis alone", async () => {
  const [first] = await types();
  await call("set_particle_type", { id: spawner.id, type: first.id, settings: { scale: "0.5..2", spd: [1, "2..3", 4] } });
  let now = (await types())[0];
  assert.equal(now.scale, "0.5..2");
  assert.deepEqual(now.spd, [1, "2..3", 4]);

  await call("set_particle_type", { id: spawner.id, type: first.id, settings: { scale: 2, spd: [null, 9, null] } });
  now = (await types())[0];
  assert.equal(now.scale, 2);
  assert.deepEqual(now.spd, [1, 9, 4]);
});

test("a type can be found by its name, and alpha and spawn rate use the app's own scale", async () => {
  const [first] = await types();
  await call("set_particle_type", { id: spawner.id, type: first.id, settings: { name: "Smoky" } });
  const result = await call("set_particle_type", { id: spawner.id, type: "Smoky", settings: { alpha: 0.3, alpha_add: "-0.2..-0.1", spawn_rate: 25 } });
  assert.equal(result.alpha, 0.3);
  assert.equal(result.alpha_add, "-0.2..-0.1");
  assert.equal(result.spawn_rate, 25);
});

test("add_particle_type, duplicate_particle_type and remove_particle_type change the list, and undo reverses them", async () => {
  const before = await types();
  const added = await call("add_particle_type", { id: spawner.id, settings: { name: "Sparks", color: "#FFAA00", spd: [0, 0, "20..40"] } });
  assert.equal(added.name, "Sparks");
  assert.equal(added.color, "#FFAA00");
  assert.deepEqual(added.spd.slice(2), ["20..40"]);
  assert.ok(added.undo_steps >= 2);
  assert.equal((await types()).length, before.length + 1);

  const copy = await call("duplicate_particle_type", { id: spawner.id, type: added.id });
  assert.notEqual(copy.id, added.id);
  assert.equal(copy.color, "#FFAA00");
  assert.equal((await types()).length, before.length + 2);

  assert.deepEqual(await call("remove_particle_type", { id: spawner.id, type: copy.id }), { removed: 1, remaining: before.length + 1 });
  assert.equal((await types()).length, before.length + 1);

  await call("undo"); // brings the copy back
  assert.equal((await types()).length, before.length + 2);
  await call("undo", { steps: 1 + added.undo_steps }); // the copy, then the added type with its settings
  assert.deepEqual((await types()).map((t) => t.id), before.map((t) => t.id));
});

test("particle type requests are checked before anything changes", async () => {
  const [first] = await types();
  const cube = await call("create_object", { type: "cube" });
  const count = (await types()).length;
  const steps = await undoSteps();
  const reject = (cmd, args, code) => assert.rejects(call(cmd, args), (err) => err.code === code, `${cmd} ${JSON.stringify(args)}`);
  const set = (settings, code) => reject("set_particle_type", { id: spawner.id, type: first.id, settings: { scale: 7, ...settings } }, code);

  await set({ no_such_setting: 1 }, "bad_args");
  await set({ scale: "big" }, "bad_args");
  await set({ scale: "5..1" }, "bad_args");
  await set({ scale: "1..2..3" }, "bad_args");
  await set({ scale: [1, 2] }, "bad_args");
  await set({ scale: { min: 1, max: 2 } }, "bad_args");
  await set({ scale: true }, "bad_args");
  await set({ spd: 5 }, "bad_args");
  await set({ spd: [1, 2] }, "bad_args");
  await set({ spd: [1, 2, [3]] }, "bad_args");
  await set({ spd: [1, "x", 3] }, "bad_args");
  await set({ color: "red" }, "bad_args");
  await set({ color: "#12345" }, "bad_args");
  await set({ color: "#112233..#GG0000" }, "bad_args");
  await set({ bounce: "yes" }, "bad_args");
  await set({ spawn_rate: 120 }, "bad_args");
  await set({ bounce_factor: -1 }, "bad_args");
  await set({ sprite_frame_width: 2.5 }, "bad_args");
  await set({ sprite_animation_onend: "forever" }, "bad_args");
  await set({ name: "" }, "bad_args");
  await set({ name: "x".repeat(101) }, "bad_args");
  await set({ sprite_template: "no_such_sprite" }, "not_found");
  await reject("set_particle_type", { id: spawner.id, type: first.id, settings: {} }, "bad_args");
  await reject("set_particle_type", { id: spawner.id, type: first.id }, "bad_args");
  await reject("set_particle_type", { id: spawner.id, type: "no-such-type", settings: { scale: 7 } }, "not_found");
  await reject("set_particle_type", { id: "no-such-id", type: first.id, settings: { scale: 7 } }, "not_found");
  await reject("set_particle_type", { id: cube.id, type: first.id, settings: { scale: 7 } }, "bad_args");
  await reject("add_particle_type", { id: spawner.id, settings: { scale: "big" } }, "bad_args");
  await reject("add_particle_type", { id: cube.id }, "bad_args");
  await reject("remove_particle_type", { id: spawner.id, type: "no-such-type" }, "not_found");
  await reject("duplicate_particle_type", { id: spawner.id, type: "no-such-type" }, "not_found");

  assert.equal((await types()).length, count);
  assert.equal(await undoSteps(), steps);
  assert.notEqual((await types()).find((t) => t.id === first.id).scale, 7, "the valid setting beside the bad ones was not applied");
});

test("a type's colour shows in the picture", async () => {
  const dots = await call("create_object", { type: "particles", preset: "default", name: "Dots" });
  const out = tmpDir();

  async function redPixels(color) {
    for (const type of (await call("get_object", { id: dots.id })).particle_types)
      await call("set_particle_type", { id: dots.id, type: type.id, settings: { color, alpha: 1, scale: 4 } });
    await call("select", { ids: [] });
    await call("set_work_camera", { focus: [0, 0, 60], angle_xy: 200, angle_z: 20, zoom: 220 });
    await call("set_frame", { frame: 0 });
    await call("play");
    await sleep(2500);
    await call("stop");
    const path = `${out}/${color.slice(1)}.png`;
    await call("screenshot", { path });
    return countPixels(decodePng(readFileSync(path)), (r, g, b) => r > 190 && g < 70 && b < 70);
  }

  const red = await redPixels("#FF0000");
  const green = await redPixels("#00FF00");
  assert.ok(red > 40, `red particles: ${red} red pixels`);
  assert.ok(green < 10, `green particles: ${green} red pixels`);
});

test("a particle type can be a sprite sheet image, an object of the scene, or a text", async () => {
  const [first] = await types();
  const dir = tmpDir();
  writeFileSync(`${dir}/sheet.png`, png(64, 64, [20, 60, 230, 255]));
  const sheet = await call("import_image", { path: `${dir}/sheet.png`, as: "particle_sheet" });
  assert.equal(sheet.type, "particlesheet");
  const cube = await call("create_object", { type: "cube", name: "Particle cube" });
  const label = await call("create_object", { type: "text" });
  const hero = await call("create_object", { type: "character" });
  const arm = (await call("get_scene")).objects.find((o) => o.part_of === hero.id);

  const steps = await undoSteps();
  let now = await call("set_particle_type", { id: spawner.id, type: first.id, settings: { kind: "sheet", sprite_sheet: sheet.id, sprite_frame_width: 64, sprite_frame_height: 64, sprite_frame_start: 0, sprite_frame_end: 0 } });
  assert.deepEqual([now.kind, now.sprite_sheet], ["sheet", sheet.id]);
  assert.equal((await call("list_resources")).resources.find((r) => r.id === sheet.id).used, true);

  now = await call("set_particle_type", { id: spawner.id, type: first.id, settings: { kind: cube.id } });
  assert.equal(now.kind, cube.id);

  now = await call("set_particle_type", { id: spawner.id, type: first.id, settings: { kind: label.id, text: "Pop!" } });
  assert.deepEqual([now.kind, now.text], [label.id, "Pop!"]);

  // A body part stands for its character
  assert.equal((await call("set_particle_type", { id: spawner.id, type: first.id, settings: { kind: arm.id } })).kind, hero.id);

  await call("undo", { steps: (await undoSteps()) - steps });
  assert.equal((await types())[0].kind, first.kind);
});

test("a sprite sheet image shows in the picture", async () => {
  const dots = await call("create_object", { type: "particles", preset: "default", name: "Blue dots" });
  const dir = tmpDir();
  writeFileSync(`${dir}/blue.png`, png(16, 16, [20, 60, 230, 255]));
  const sheet = await call("import_image", { path: `${dir}/blue.png`, as: "particle_sheet" });
  for (const type of (await call("get_object", { id: dots.id })).particle_types)
    await call("set_particle_type", { id: dots.id, type: type.id, settings: { kind: "sheet", sprite_sheet: sheet.id, sprite_frame_width: 16, sprite_frame_height: 16, sprite_frame_start: 0, sprite_frame_end: 0, color: "#FFFFFF", alpha: 1, scale: 4 } });

  await call("select", { ids: [] });
  await call("set_work_camera", { focus: [0, 0, 60], angle_xy: 200, angle_z: 20, zoom: 220 });
  await call("set_frame", { frame: 0 });
  await call("play");
  await sleep(2500);
  await call("stop");
  const path = `${dir}/blue-dots.png`;
  await call("screenshot", { path });
  const blue = countPixels(decodePng(readFileSync(path)), (r, g, b) => b > 170 && r < 70 && g < 110);
  assert.ok(blue > 40, `blue pixels: ${blue}`);
  await call("remove_object", { id: dots.id });
});

test("particle kinds are checked before anything changes", async () => {
  const [first] = await types();
  const camera = await call("create_object", { type: "camera" });
  const dir = tmpDir();
  writeFileSync(`${dir}/plain.png`, png(8, 8));
  const texture = await call("import_image", { path: `${dir}/plain.png` });
  const steps = await undoSteps();
  const set = (settings, code) => assert.rejects(call("set_particle_type", { id: spawner.id, type: first.id, settings: { scale: 7, ...settings } }), (err) => err.code === code, JSON.stringify(settings));

  await set({ kind: "no-such-object" }, "not_found");
  await set({ kind: camera.id }, "bad_args");
  await set({ kind: spawner.id }, "bad_args");
  await set({ kind: "" }, "bad_args");
  await set({ sprite_sheet: "no-such-resource" }, "not_found");
  await set({ sprite_sheet: texture.id }, "bad_args");
  await set({ sprite_sheet_image: 2 }, "bad_args");
  await set({ text: 5 }, "bad_args");
  await set({ text: "x".repeat(1001) }, "bad_args");
  await assert.rejects(call("import_image", { path: `${dir}/plain.png`, as: "sky" }), (err) => err.code === "bad_args");
  assert.equal(await undoSteps(), steps);
});
