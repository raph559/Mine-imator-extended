import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { newProject, startApp } from "./harness.mjs";

let app, call, cube;
before(async () => {
  app = await startApp();
  await newProject(app.client);
  call = (cmd, args) => app.client.call(cmd, args);
  cube = await call("create_object", { type: "cube" });
});
after(() => app?.stop());

const object = () => call("get_object", { id: cube.id });
const keyframe = async (frame) => (await object()).keyframes.find((k) => k.frame === frame);

test("set_values creates keyframes with the given values", async () => {
  assert.deepEqual(await call("set_values", { id: cube.id, frame: 0, values: { pos_x: 16 } }), { id: cube.id, frame: 0, values_set: 1 });
  await call("set_values", { id: cube.id, frame: 24, values: { pos_x: 64, rot_z: 90, transition: "easeinoutquad" } });
  const obj = await object();
  assert.deepEqual(obj.frames, [0, 24]);
  assert.equal(obj.keyframes[0].values.pos_x, 16);
  assert.equal(obj.keyframes[1].values.pos_x, 64);
  assert.equal(obj.keyframes[1].values.rot_z, 90);
  assert.equal(obj.keyframes[1].values.transition, "easeinoutquad");
});

test("set_values on an existing keyframe edits it instead of adding one", async () => {
  await call("set_values", { id: cube.id, frame: 24, values: { pos_y: 8 } });
  const obj = await object();
  assert.deepEqual(obj.frames, [0, 24]);
  assert.equal(obj.keyframes[1].values.pos_x, 64);
  assert.equal(obj.keyframes[1].values.pos_y, 8);
});

test("set_frame moves the marker and values interpolate between keyframes", async () => {
  assert.deepEqual(await call("set_frame", { frame: 12 }), { frame: 12 });
  await new Promise((r) => setTimeout(r, 200)); // one app step to update values
  const x = (await object()).values.pos_x;
  assert.ok(x > 16 && x < 64, `pos_x ${x} should be between the keyframes`);
  await assert.rejects(call("set_frame", { frame: -1 }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_frame", {}), (err) => err.code === "bad_args");
});

test("set_values applies nothing when any name or type is wrong", async () => {
  const before = await object();
  const bad = [
    { pos_x: 1, no_such_value: 2 },
    { pos_x: "sixteen" },
    { pos_x: 1, transition: "not-an-easing" },
    { rgb_mul: 5 },
    { rgb_mul: "#zzzzzz" },
    { rgb_mul: "#12345g" },
    { rgb_mul: "FF8000x" },
    {},
  ];
  for (const values of bad)
    await assert.rejects(call("set_values", { id: cube.id, frame: 40, values }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_values", { id: "no-such-id", frame: 0, values: { pos_x: 1 } }), (err) => err.code === "not_found");
  const after = await object();
  assert.deepEqual(after.frames, before.frames);
  assert.deepEqual(after.keyframes, before.keyframes);
});

test("colours round-trip as #RRGGBB", async () => {
  await call("set_values", { id: cube.id, frame: 0, values: { rgb_mul: "#FF8000" } });
  assert.equal((await keyframe(0)).values.rgb_mul, "#FF8000");
});

test("move_keyframes moves one keyframe and refuses an occupied or missing frame", async () => {
  assert.deepEqual(await call("move_keyframes", { id: cube.id, from: 24, to: 30 }), { frame: 30 });
  assert.deepEqual((await object()).frames, [0, 30]);
  assert.equal((await keyframe(30)).values.pos_x, 64);
  const steps = (await call("get_status")).undo_steps;
  assert.deepEqual(await call("move_keyframes", { id: cube.id, from: 30, to: 30 }), { frame: 30 });
  assert.equal((await call("get_status")).undo_steps, steps, "moving to the same frame is not an undo step");
  await assert.rejects(call("move_keyframes", { id: cube.id, from: 30, to: 0 }), (err) => err.code === "bad_args");
  await assert.rejects(call("move_keyframes", { id: cube.id, from: 99, to: 5 }), (err) => err.code === "not_found");
  assert.deepEqual((await object()).frames, [0, 30]);
});

test("remove_keyframes removes them and undo restores them", async () => {
  await assert.rejects(call("remove_keyframes", { id: cube.id, frames: [30, 99] }), (err) => err.code === "not_found");
  assert.deepEqual((await object()).frames, [0, 30]);
  assert.deepEqual(await call("remove_keyframes", { id: cube.id, frames: [30] }), { removed: 1 });
  assert.deepEqual((await object()).frames, [0]);
  await call("undo");
  assert.deepEqual((await object()).frames, [0, 30]);
});

test("one set_values call is one undo step", async () => {
  await call("set_values", { id: cube.id, frame: 50, values: { pos_x: 1, pos_y: 2, pos_z: 3 } });
  assert.deepEqual((await object()).frames, [0, 30, 50]);
  await call("undo");
  assert.deepEqual((await object()).frames, [0, 30]);
});
