import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { after, before, test } from "node:test";
import { newProject, startApp, tmpDir } from "./harness.mjs";

let app, call;
before(async () => {
  app = await startApp();
  await newProject(app.client);
  call = (cmd, args) => app.client.call(cmd, args);
});
after(() => app?.stop());

const object = (obj) => call("get_object", { id: obj.id });
const keyframe = async (obj, frame) => (await object(obj)).keyframes.find((k) => k.frame === frame);
const partsOf = async (obj) => (await call("get_scene")).objects.filter((o) => o.part_of === obj.id);
const undoSteps = async () => (await call("get_status")).undo_steps;

test("duplicate_object copies an object with its keyframes, and undo removes the copy", async () => {
  const cube = await call("create_object", { type: "cube", name: "Box" });
  await call("set_keyframes", { keyframes: [
    { id: cube.id, frame: 0, values: { pos_x: 0 } },
    { id: cube.id, frame: 12, values: { pos_x: 32 } },
  ] });
  const count = (await call("get_scene")).objects.length;

  const copy = await call("duplicate_object", { id: cube.id });
  assert.notEqual(copy.id, cube.id);
  assert.equal(copy.type, "cube");
  assert.deepEqual(copy.frames, [0, 12]);
  assert.equal((await keyframe(copy, 12)).values.pos_x, 32);
  assert.equal((await call("get_scene")).objects.length, count + 1);

  await call("undo");
  assert.equal((await call("get_scene")).objects.length, count);
});

test("duplicate_object copies a character with its own body parts", async () => {
  const char = await call("create_object", { type: "character" });
  const copy = await call("duplicate_object", { id: char.id });
  const parts = await partsOf(char);
  const copyParts = await partsOf(copy);
  assert.equal(copyParts.length, parts.length);
  assert.ok(copyParts.every((p) => !parts.some((q) => q.id === p.id)));
});

test("duplicate_object refuses unknown objects and body parts", async () => {
  await assert.rejects(call("duplicate_object", { id: "no-such-id" }), (err) => err.code === "not_found");
  const char = await call("create_object", { type: "character" });
  const part = (await partsOf(char))[0];
  await assert.rejects(call("duplicate_object", { id: part.id }), (err) => err.code === "bad_args");
  await assert.rejects(call("duplicate_object", {}), (err) => err.code === "not_found");
});

test("copy_keyframes copies one frame and a range of frames to another frame", async () => {
  const cube = await call("create_object", { type: "cube" });
  await call("set_keyframes", { keyframes: [
    { id: cube.id, frame: 0, values: { pos_x: 0 } },
    { id: cube.id, frame: 10, values: { pos_x: 16, transition: "easeoutquad" } },
  ] });

  assert.deepEqual(await call("copy_keyframes", { id: cube.id, frame: 10, to_frame: 30 }), { copied: 1, replaced: 0, undo_steps: 1 });
  assert.deepEqual((await object(cube)).frames, [0, 10, 30]);
  assert.equal((await keyframe(cube, 30)).values.pos_x, 16);
  assert.equal((await keyframe(cube, 30)).values.transition, "easeoutquad");

  // A range keeps the keyframes' distance from its first frame, even when no keyframe is there
  const range = await call("copy_keyframes", { id: cube.id, frame: 0, end_frame: 12, to_frame: 40 });
  assert.equal(range.copied, 2);
  assert.deepEqual((await object(cube)).frames, [0, 10, 30, 40, 50]);
  await call("copy_keyframes", { id: cube.id, frame: 5, end_frame: 10, to_frame: 60 });
  assert.deepEqual((await object(cube)).frames, [0, 10, 30, 40, 50, 65]);
});

test("copy_keyframes replaces keyframes already at the target frames, and undo puts them back", async () => {
  const cube = await call("create_object", { type: "cube" });
  await call("set_keyframes", { keyframes: [
    { id: cube.id, frame: 0, values: { pos_y: 8 } },
    { id: cube.id, frame: 20, values: { pos_y: 64 } },
  ] });

  const result = await call("copy_keyframes", { id: cube.id, frame: 0, to_frame: 20 });
  assert.deepEqual(result, { copied: 1, replaced: 1, undo_steps: 2 });
  assert.deepEqual((await object(cube)).frames, [0, 20]);
  assert.equal((await keyframe(cube, 20)).values.pos_y, 8);

  await call("undo", { steps: 2 });
  assert.deepEqual((await object(cube)).frames, [0, 20]);
  assert.equal((await keyframe(cube, 20)).values.pos_y, 64);
});

test("copy_keyframes copies a character's whole pose, to another frame and to another character", async () => {
  const hero = await call("create_object", { type: "character" });
  const parts = await partsOf(hero);
  const [arm, leg] = parts;
  await call("set_keyframes", { keyframes: [
    { id: hero.id, frame: 0, values: { rot_z: 45 } },
    { id: arm.id, frame: 0, values: { rot_x: -90 } },
    { id: leg.id, frame: 0, values: { rot_x: 30 } },
  ] });

  const same = await call("copy_keyframes", { id: hero.id, frame: 0, to_frame: 24 });
  assert.equal(same.copied, 3);
  assert.equal((await keyframe(hero, 24)).values.rot_z, 45);
  assert.equal((await keyframe(arm, 24)).values.rot_x, -90);
  assert.equal((await keyframe(leg, 24)).values.rot_x, 30);

  const other = await call("create_object", { type: "character" });
  const otherParts = await partsOf(other);
  const twin = (part) => otherParts.find((p) => p.part === part.part);
  const across = await call("copy_keyframes", { id: hero.id, frame: 0, to_frame: 6, to_id: other.id });
  assert.equal(across.copied, 3);
  assert.equal((await keyframe(other, 6)).values.rot_z, 45);
  assert.equal((await keyframe(twin(arm), 6)).values.rot_x, -90);
  assert.equal((await keyframe(twin(leg), 6)).values.rot_x, 30);
  // The source keeps its keyframes
  assert.deepEqual((await object(arm)).frames, [0, 24]);

  // One body part on its own goes to the same part of the other character
  await call("copy_keyframes", { id: arm.id, frame: 0, to_frame: 12, to_id: other.id });
  assert.equal((await keyframe(twin(arm), 12)).values.rot_x, -90);
  assert.equal(await keyframe(other, 12), undefined);
});

test("copy_keyframes changes nothing when the request is wrong", async () => {
  const cube = await call("create_object", { type: "cube" });
  const char = await call("create_object", { type: "character" });
  const arm = (await partsOf(char))[0];
  await call("set_keyframes", { keyframes: [
    { id: cube.id, frame: 0, values: { pos_x: 1 } },
    { id: arm.id, frame: 0, values: { rot_x: 10 } },
  ] });
  const steps = await undoSteps();

  await assert.rejects(call("copy_keyframes", { id: "no-such-id", frame: 0, to_frame: 5 }), (err) => err.code === "not_found");
  await assert.rejects(call("copy_keyframes", { id: cube.id, frame: 0, to_frame: 5, to_id: "no-such-id" }), (err) => err.code === "not_found");
  await assert.rejects(call("copy_keyframes", { id: cube.id, frame: 3, to_frame: 5 }), (err) => err.code === "not_found");
  await assert.rejects(call("copy_keyframes", { id: cube.id, frame: 0 }), (err) => err.code === "bad_args");
  await assert.rejects(call("copy_keyframes", { id: cube.id, frame: 0, to_frame: -1 }), (err) => err.code === "bad_args");
  await assert.rejects(call("copy_keyframes", { id: cube.id, frame: 5, end_frame: 2, to_frame: 9 }), (err) => err.code === "bad_args");
  // A character's pose needs a target with the same body parts
  await assert.rejects(call("copy_keyframes", { id: char.id, frame: 0, to_frame: 5, to_id: cube.id }), (err) => err.code === "bad_args");
  await assert.rejects(call("copy_keyframes", { id: arm.id, frame: 0, to_frame: 5, to_id: cube.id }), (err) => err.code === "bad_args");

  // A missing frame is not taken as frame 0
  await assert.rejects(call("copy_keyframes", { id: cube.id, to_frame: 5 }), (err) => err.code === "bad_args");
  await assert.rejects(call("move_keyframes", { id: cube.id, from: 0 }), (err) => err.code === "bad_args");
  await assert.rejects(call("remove_marker", {}), (err) => err.code === "bad_args");

  assert.equal(await undoSteps(), steps);
  assert.deepEqual((await object(cube)).frames, [0]);
});

test("set_view_camera looks through a scene camera and back through the work camera", async () => {
  assert.equal((await call("get_status")).view_camera, "work");
  await call("create_object", { type: "cube" });
  const camera = await call("create_object", { type: "camera" });
  await call("set_values", { id: camera.id, values: { pos_x: 400, pos_y: 400, pos_z: 300 } });

  const out = tmpDir();
  await call("screenshot", { path: `${out}/work.png` });
  assert.deepEqual(await call("set_view_camera", { camera: camera.id }), { camera: camera.id });
  assert.equal((await call("get_status")).view_camera, camera.id);
  await sleep(300); // Let the view draw through the new camera
  await call("screenshot", { path: `${out}/scene.png` });
  assert.ok(!readFileSync(`${out}/work.png`).equals(readFileSync(`${out}/scene.png`)), "the view should change");

  assert.deepEqual(await call("set_view_camera", { camera: "active" }), { camera: "active" });
  assert.deepEqual(await call("set_view_camera", { camera: "work" }), { camera: "work" });
  assert.equal((await call("get_status")).view_camera, "work");

  const cube = await call("create_object", { type: "cube" });
  await assert.rejects(call("set_view_camera", { camera: cube.id }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_view_camera", { camera: "no-such-id" }), (err) => err.code === "not_found");
  await assert.rejects(call("set_view_camera", {}), (err) => err.code === "bad_args");
});

test("set_marker adds, renames, recolours and moves markers, and get_scene lists them in order", async () => {
  const start = await undoSteps();
  assert.deepEqual((await call("get_scene")).markers, []);

  assert.deepEqual((await call("set_marker", { frame: 20, name: "Land", color: "blue" })).marker, { frame: 20, name: "Land", color: "blue" });
  const added = await call("set_marker", { frame: 5 });
  assert.equal(added.marker.frame, 5);
  assert.equal(typeof added.marker.name, "string");
  assert.equal(added.marker.color, "red");

  assert.deepEqual((await call("set_marker", { frame: 5, name: "Jump" })).marker, { frame: 5, name: "Jump", color: "red" });
  assert.deepEqual((await call("set_marker", { frame: 20, color: "forest_green" })).marker, { frame: 20, name: "Land", color: "forest_green" });
  assert.deepEqual((await call("set_marker", { frame: 20, to_frame: 2 })).marker, { frame: 2, name: "Land", color: "forest_green" });

  assert.deepEqual((await call("get_scene")).markers, [
    { frame: 2, name: "Land", color: "forest_green" },
    { frame: 5, name: "Jump", color: "red" },
  ]);

  await call("undo", { steps: (await undoSteps()) - start });
  assert.deepEqual((await call("get_scene")).markers, []);
});

test("remove_marker removes the marker at a frame, and undo brings it back", async () => {
  await call("set_marker", { frame: 8, name: "Hit", color: "pink" });
  assert.deepEqual(await call("remove_marker", { frame: 8 }), { removed: 1 });
  assert.deepEqual((await call("get_scene")).markers, []);
  await call("undo");
  assert.deepEqual((await call("get_scene")).markers, [{ frame: 8, name: "Hit", color: "pink" }]);
  await assert.rejects(call("remove_marker", { frame: 9 }), (err) => err.code === "not_found");
  await call("remove_marker", { frame: 8 });
});

test("set_marker changes nothing when the request is wrong", async () => {
  await call("set_marker", { frame: 1, name: "A" });
  await call("set_marker", { frame: 3, name: "B" });
  const before = (await call("get_scene")).markers;
  const steps = await undoSteps();
  const bad = [
    { frame: 1, color: "brown" },
    { frame: 1, name: 5 },
    { frame: 1, name: "x".repeat(101) },
    { frame: -1 },
    { frame: 1, to_frame: 3 },
    { frame: 1, to_frame: -2 },
    { frame: 7, to_frame: 9 },
    {},
  ];
  for (const args of bad)
    await assert.rejects(call("set_marker", args), (err) => err.code === "bad_args" || err.code === "not_found", JSON.stringify(args));
  await assert.rejects(call("set_marker", { frame: 7, to_frame: 9 }), (err) => err.code === "not_found");
  assert.deepEqual((await call("get_scene")).markers, before);
  assert.equal(await undoSteps(), steps);
});

test("set_loop sets the play region and repeat mode, and playback loops inside it", async () => {
  assert.deepEqual((await call("get_project_settings")).loop, { start: null, end: null, repeat: "off" });

  assert.deepEqual(await call("set_loop", { start: 10, end: 20, repeat: "repeat" }), { start: 10, end: 20, repeat: "repeat" });
  assert.deepEqual(await call("set_loop", { repeat: "seamless" }), { start: 10, end: 20, repeat: "seamless" });
  assert.deepEqual((await call("get_project_settings")).loop, { start: 10, end: 20, repeat: "seamless" });

  await call("set_frame", { frame: 10 });
  await call("play");
  await sleep(1500); // About 36 frames at 24 per second, longer than the region
  const frame = (await call("get_status")).frame;
  await call("stop");
  assert.ok(frame >= 10 && frame <= 20, `frame ${frame} should stay in the loop region`);

  assert.deepEqual(await call("set_loop", { clear: true, repeat: "off" }), { start: null, end: null, repeat: "off" });
});

test("set_loop changes nothing when the request is wrong", async () => {
  await call("set_loop", { start: 4, end: 8 });
  const before = (await call("get_project_settings")).loop;
  const bad = [
    { start: 4 },
    { end: 8 },
    { start: 8, end: 8 },
    { start: 9, end: 2 },
    { start: -1, end: 5 },
    { repeat: "sometimes" },
    { clear: true, start: 1, end: 2 },
    { start: 1, end: 5, repeat: "sometimes" },
    {},
  ];
  for (const args of bad)
    await assert.rejects(call("set_loop", args), (err) => err.code === "bad_args", JSON.stringify(args));
  assert.deepEqual((await call("get_project_settings")).loop, before);
  await call("set_loop", { clear: true });
});
