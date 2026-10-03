import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { countPixels, decodePng, newProject, startApp, tmpDir } from "./harness.mjs";

let app, call, cube, ball;
before(async () => {
  app = await startApp();
  await newProject(app.client);
  call = (cmd, args) => app.client.call(cmd, args);
  cube = await call("create_object", { type: "cube" });
  ball = await call("create_object", { type: "sphere" });
});
after(() => app?.stop());

const frames = async (obj) => (await call("get_object", { id: obj.id })).frames;
const keyframe = async (obj, frame) => (await call("get_object", { id: obj.id })).keyframes.find((k) => k.frame === frame);

test("set_keyframes applies many keyframes on several objects in one call", async () => {
  await call("set_frame", { frame: 7 });
  const result = await call("set_keyframes", {
    keyframes: [
      { id: cube.id, frame: 0, values: { pos_x: 0, pos_z: 0 } },
      { id: cube.id, frame: 12, values: { pos_x: 16, pos_z: 32, transition: "easeoutquad" } },
      { id: cube.id, frame: 24, values: { pos_x: 32, pos_z: 0 } },
      { id: ball.id, frame: 24, values: { pos_y: 48, rgb_mul: "#FF0000" } },
    ],
  });
  assert.deepEqual(result, { keyframes: 4, undo_steps: 4 });
  assert.deepEqual(await frames(cube), [0, 12, 24]);
  assert.deepEqual(await frames(ball), [24]);
  assert.equal((await keyframe(cube, 12)).values.pos_z, 32);
  assert.equal((await keyframe(cube, 12)).values.transition, "easeoutquad");
  assert.equal((await keyframe(ball, 24)).values.rgb_mul, "#FF0000");
});

test("set_keyframes puts the timeline marker back where it was", async () => {
  assert.equal((await call("get_status")).frame, 7);
});

test("set_keyframes applies nothing when any entry is wrong", async () => {
  const before = [await frames(cube), await frames(ball)];
  const good = { id: cube.id, frame: 40, values: { pos_x: 1 } };
  const bad = [
    [{ id: "no-such-id", frame: 40, values: { pos_x: 1 } }, "not_found"],
    [{ id: ball.id, frame: 40, values: { no_such_value: 1 } }, "bad_args"],
    [{ id: ball.id, frame: 40, values: { pos_x: "far" } }, "bad_args"],
    [{ id: ball.id, frame: -1, values: { pos_x: 1 } }, "bad_args"],
    [{ id: ball.id, frame: 40 }, "bad_args"],
    [{ id: ball.id, frame: 40, values: {} }, "bad_args"],
  ];
  for (const [entry, code] of bad)
    await assert.rejects(call("set_keyframes", { keyframes: [good, entry] }), (err) => err.code === code, JSON.stringify(entry));
  await assert.rejects(call("set_keyframes", { keyframes: [] }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_keyframes", {}), (err) => err.code === "bad_args");
  assert.deepEqual([await frames(cube), await frames(ball)], before);
});

test("undo with steps undoes a whole batch, and stops when there is nothing left", async () => {
  assert.deepEqual(await call("undo", { steps: 4 }), { done: true, steps: 4 });
  assert.deepEqual(await frames(cube), []);
  assert.deepEqual(await frames(ball), []);

  assert.deepEqual(await call("redo", { steps: 2 }), { done: true, steps: 2 });
  assert.deepEqual(await frames(cube), [0, 12]);

  const all = await call("undo", { steps: 500 });
  assert.equal(all.done, true);
  assert.ok(all.steps < 500);
  assert.deepEqual(await call("undo"), { done: false, steps: 0 });
  await assert.rejects(call("undo", { steps: 0 }), (err) => err.code === "bad_args");
});

// The batch moves the timeline marker to each keyframe and back; the scene has to follow it back
let box;
test("after set_keyframes, get_object reports the values at the timeline marker", async () => {
  box = await call("create_object", { type: "cube" });
  await call("set_frame", { frame: 0 });
  await call("set_keyframes", {
    keyframes: [
      { id: box.id, frame: 0, values: { pos_x: 0, rgb_mul: "#FF0000" } },
      { id: box.id, frame: 24, values: { pos_x: 10000, rgb_mul: "#FF0000" } },
    ],
  });
  assert.equal((await call("get_status")).frame, 0);
  assert.equal((await call("get_object", { id: box.id })).values.pos_x, 0);
});

test("after set_keyframes, the view shows the scene at the timeline marker", async () => {
  await call("set_work_camera", { focus: [0, 0, 8], angle_xy: 45, angle_z: 20, zoom: 150 });
  await call("select", { ids: [] });
  const path = `${tmpDir()}/marker.png`;
  await call("screenshot", { path, overwrite: true });
  const red = countPixels(decodePng(readFileSync(path)), (r, g, b) => r > 100 && g < 60 && b < 60);
  assert.ok(red > 0, "the red cube is in view at frame 0, and far away at the last frame keyed");
});
