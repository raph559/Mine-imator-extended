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

const settings = async (obj) => (await call("get_object", { id: obj.id })).settings;

test("get_object reports the object's settings with the app's defaults", async () => {
  const s = await settings(cube);
  assert.equal(s.hidden, false);
  assert.equal(s.locked, false);
  assert.equal(s.shadows, true);
  assert.equal(s.inherit_rotation, true);
  assert.equal(s.pivot, null);
  assert.ok(!("text" in s) && !("item" in s) && !("block" in s));
});

test("set_object_settings changes flags, reports the undo steps, and skips values already set", async () => {
  const result = await call("set_object_settings", { id: cube.id, settings: { hidden: true, shadows: false, inherit_rotation: false } });
  assert.equal(result.undo_steps, 3);
  assert.equal(result.settings.hidden, true);
  const s = await settings(cube);
  assert.deepEqual([s.hidden, s.shadows, s.inherit_rotation, s.locked], [true, false, false, false]);

  const again = await call("set_object_settings", { id: cube.id, settings: { hidden: true, shadows: false } });
  assert.equal(again.undo_steps, 0);

  assert.equal((await call("undo", { steps: 3 })).steps, 3);
  const back = await settings(cube);
  assert.deepEqual([back.hidden, back.shadows, back.inherit_rotation], [false, true, true]);
});

test("pivot sets a custom rotation point and null puts the default back", async () => {
  const set = await call("set_object_settings", { id: cube.id, settings: { pivot: [0, 4, 8] } });
  assert.deepEqual(set.settings.pivot, [0, 4, 8]);
  assert.deepEqual((await settings(cube)).pivot, [0, 4, 8]);
  const reset = await call("set_object_settings", { id: cube.id, settings: { pivot: null } });
  assert.equal(reset.settings.pivot, null);
  assert.equal(reset.undo_steps, 1);
});

test("text, item and block are set on the matching kind of object only", async () => {
  const text = await call("create_object", { type: "text" });
  assert.equal((await call("set_object_settings", { id: text.id, settings: { text: "Hello" } })).settings.text, "Hello");
  assert.equal((await settings(text)).text, "Hello");

  const items = (await call("list_names", { kind: "item" })).names;
  const item = await call("create_object", { type: "item" });
  const other = items.find((name) => name !== (item.settings ?? {}).item) ?? items[0];
  const pick = items[Math.min(40, items.length - 1)];
  assert.equal((await call("set_object_settings", { id: item.id, settings: { item: pick } })).settings.item, pick);
  assert.equal((await settings(item)).item, pick);
  assert.ok(other);

  const blocks = (await call("list_names", { kind: "block" })).names;
  const block = await call("create_object", { type: "block" });
  const blockPick = blocks[Math.min(40, blocks.length - 1)];
  assert.equal((await call("set_object_settings", { id: block.id, settings: { block: blockPick } })).settings.block, blockPick);

  await assert.rejects(call("set_object_settings", { id: cube.id, settings: { text: "no" } }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_object_settings", { id: cube.id, settings: { item: pick } }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_object_settings", { id: item.id, settings: { item: "no_such_item" } }), (err) => err.code === "not_found");
  await assert.rejects(call("set_object_settings", { id: block.id, settings: { block: "no_such_block" } }), (err) => err.code === "not_found");
});

test("set_object_settings applies nothing when any setting is wrong", async () => {
  const before = await settings(cube);
  const bad = [
    { hidden: true, no_such_setting: 1 },
    { hidden: true, shadows: "yes" },
    { hidden: true, pivot: [1, 2] },
    { hidden: true, pivot: "middle" },
    {},
  ];
  for (const s of bad)
    await assert.rejects(call("set_object_settings", { id: cube.id, settings: s }), (err) => err.code === "bad_args", JSON.stringify(s));
  await assert.rejects(call("set_object_settings", { id: cube.id }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_object_settings", { id: "no-such-id", settings: { hidden: true } }), (err) => err.code === "not_found");
  assert.deepEqual(await settings(cube), before);
});

test("list_names returns the valid item, block and character names", async () => {
  for (const kind of ["item", "block", "character"]) {
    const { names } = await call("list_names", { kind });
    assert.ok(names.length > 10, `${kind}: ${names.length} names`);
    assert.ok(names.every((name) => typeof name === "string" && name !== ""));
  }
  await assert.rejects(call("list_names", { kind: "sounds" }), (err) => err.code === "bad_args");
  await assert.rejects(call("list_names", {}), (err) => err.code === "bad_args");
});
