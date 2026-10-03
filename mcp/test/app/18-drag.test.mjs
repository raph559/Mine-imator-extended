import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { newProject, sleep, startApp } from "./harness.mjs";

let app, call;
before(async () => {
  app = await startApp();
  await newProject(app.client);
  call = (cmd, args) => app.client.call(cmd, args);
});
after(async () => {
  await call("test_set_drag", { on: false }); // never leave the shared app waiting
  await app?.stop();
});

const objectCount = async () => (await call("get_scene")).objects.length;

test("get_status says whether the person is dragging, and keeps answering meanwhile", async () => {
  assert.equal((await call("get_status")).user_dragging, false);
  await call("test_set_drag", { on: true });
  assert.equal((await call("get_status")).user_dragging, true);
  await call("test_set_drag", { on: false });
  assert.equal((await call("get_status")).user_dragging, false);
});

test("a command waits while the person drags, and runs once they let go", async () => {
  await call("test_set_drag", { on: true });
  let settled = false;
  const started = Date.now();
  const scene = call("get_scene").then((result) => { settled = true; return result; });

  await sleep(600);
  assert.equal(settled, false, "the command should be held back");
  assert.equal((await call("get_status")).window_state, ""); // get_status still answers

  await call("test_set_drag", { on: false });
  const result = await scene;
  assert.ok(Array.isArray(result.objects));
  assert.ok(Date.now() - started >= 500, "it ran after the drag ended, not before");
});

test("after the wait limit a command answers busy and is not run", async () => {
  const before = await objectCount();
  await call("test_set_drag", { on: true });
  await assert.rejects(call("create_object", { type: "cube" }), (err) => err.code === "busy");
  await call("test_set_drag", { on: false });
  assert.equal(await objectCount(), before);
  // Back to normal
  assert.equal((await call("create_object", { type: "cube" })).type, "cube");
});
