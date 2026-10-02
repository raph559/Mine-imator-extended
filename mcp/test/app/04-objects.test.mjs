import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { newProject, startApp, tmpDir } from "./harness.mjs";

let app, call;
before(async () => {
  app = await startApp();
  await newProject(app.client);
  call = (cmd, args) => app.client.call(cmd, args);
});
after(() => app?.stop());

const ids = async () => (await call("get_scene")).objects.map((o) => o.id);

test("create_object makes a cube that shows up in the scene", async () => {
  const cube = await call("create_object", { type: "cube", name: "Box" });
  assert.equal(cube.type, "cube");
  assert.equal(cube.name, "Box");
  assert.equal(cube.parent, "");
  assert.ok((await ids()).includes(cube.id));
});

test("create_object makes a character with body parts", async () => {
  const char = await call("create_object", { type: "character" });
  assert.equal(char.type, "char");
  const parts = (await call("get_scene")).objects.filter((o) => o.part_of === char.id);
  assert.ok(parts.length >= 6, `expected body parts, got ${parts.length}`);
  assert.ok(parts.every((p) => p.type === "bodypart"));
});

test("create_object makes cameras, lights and folders", async () => {
  for (const type of ["camera", "pointlight", "spotlight", "folder"])
    assert.equal((await call("create_object", { type })).type, type);
});

test("create_object rejects unsupported types and unknown models without changing the scene", async () => {
  const before = await ids();
  await assert.rejects(call("create_object", { type: "scenery" }), (err) => err.code === "bad_args");
  await assert.rejects(call("create_object", { type: "nonsense" }), (err) => err.code === "bad_args");
  await assert.rejects(call("create_object", { type: "char", model: "no_such_model" }), (err) => err.code === "not_found");
  await assert.rejects(call("create_object", { type: "char", skin: "C:/no/such/skin.png" }), (err) => err.code === "not_found");
  assert.deepEqual(await ids(), before);
});

test("rename_object and set_parent change the object", async () => {
  const folder = await call("create_object", { type: "folder", name: "Group" });
  const cube = await call("create_object", { type: "cube" });
  assert.equal((await call("rename_object", { id: cube.id, name: "Renamed" })).name, "Renamed");
  assert.equal((await call("set_parent", { id: cube.id, parent: folder.id })).parent, folder.id);
  await assert.rejects(call("set_parent", { id: folder.id, parent: cube.id }), (err) => err.code === "bad_args");
  assert.equal((await call("set_parent", { id: cube.id, parent: "" })).parent, "");
  await assert.rejects(call("set_parent", { id: cube.id, parent: "no-such-id" }), (err) => err.code === "not_found");
});

test("select marks exactly the given objects", async () => {
  const a = await call("create_object", { type: "cube" });
  const b = await call("create_object", { type: "sphere" });
  assert.deepEqual(await call("select", { ids: [a.id, b.id] }), { selected: 2 });
  const selected = (await call("get_scene")).objects.filter((o) => o.selected).map((o) => o.id).sort();
  assert.deepEqual(selected, [a.id, b.id].sort());
  await assert.rejects(call("select", { ids: [a.id, "no-such-id"] }), (err) => err.code === "not_found");
});

test("remove_object removes it, a stale id is not_found, undo brings it back", async () => {
  const cube = await call("create_object", { type: "cube" });
  assert.deepEqual(await call("remove_object", { id: cube.id }), {});
  assert.ok(!(await ids()).includes(cube.id));
  const afterRemove = await ids();
  await assert.rejects(call("remove_object", { id: cube.id }), (err) => err.code === "not_found");
  await assert.rejects(call("rename_object", { id: cube.id, name: "x" }), (err) => err.code === "not_found");
  assert.deepEqual(await ids(), afterRemove);
  assert.deepEqual(await call("undo"), { done: true, steps: 1 });
  assert.ok((await ids()).includes(cube.id));
  assert.deepEqual(await call("redo"), { done: true, steps: 1 });
  assert.ok(!(await ids()).includes(cube.id));
});

test("undoing a creation removes the object and the app keeps running", async () => {
  const cube = await call("create_object", { type: "cube", name: "Short lived" });
  await call("set_values", { id: cube.id, frame: 3, values: { pos_x: 5 } }); // leaves the cube selected with its editor open
  const undone = await app.client.call("undo", { steps: 3 }, { timeoutMs: 8000 }); // values, name, creation
  assert.equal(undone.steps, 3);
  await new Promise((r) => setTimeout(r, 500)); // let the app draw a few frames
  assert.equal((await app.client.call("get_status", {}, { timeoutMs: 8000 })).protocol, 1);
  assert.ok(!(await ids()).includes(cube.id));
});

test("body parts cannot be removed on their own", async () => {
  const char = await call("create_object", { type: "char" });
  const part = (await call("get_scene")).objects.find((o) => o.part_of === char.id);
  await assert.rejects(call("remove_object", { id: part.id }), (err) => err.code === "bad_args");
});

test("project_new and project_open refuse to drop unsaved changes", async () => {
  assert.equal((await call("get_status")).project_changed, true);
  await assert.rejects(call("project_new", { name: "other", folder: tmpDir() }), (err) => err.code === "unsaved_changes");
  const file = (await call("get_status")).project_file;
  await assert.rejects(call("project_open", { path: file }), (err) => err.code === "unsaved_changes");
  assert.equal((await call("project_new", { name: "other", folder: tmpDir(), discard: true })).project_name, "other");
});
