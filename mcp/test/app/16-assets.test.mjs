import assert from "node:assert/strict";
import { copyFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { after, before, test } from "node:test";
import { exe, newProject, SKIN_TEST_PORT, startApp, tmpDir } from "./harness.mjs";

/** A PNG of the given size filled with one colour. */
function png(width, height, [r, g, b, a] = [200, 120, 40, 255]) {
  const row = Buffer.alloc(1 + width * 4);
  for (let x = 0; x < width; x++) row.set([r, g, b, a], 1 + x * 4);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const model = {
  name: "bridge_box",
  texture: "box.png",
  texture_size: [16, 16],
  parts: [
    { name: "base", position: [0, 0, 0], shapes: [{ type: "block", from: [-4, -4, 0], to: [4, 4, 8], uv: [0, 0] }] },
    { name: "lid", position: [0, 0, 8], shapes: [{ type: "block", from: [-4, -4, 0], to: [4, 4, 2], uv: [0, 0] }] },
  ],
};

let app, call, dir, server;
const requested = [];
before(async () => {
  // Stands in for the Mine-imator skin service: the app is started pointing at this port
  server = createServer((req, res) => {
    const name = new URL(req.url, "http://localhost").searchParams.get("username");
    requested.push(name);
    if (name?.startsWith("bridgetest_")) {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(png(64, 64, [30, 90, 200, 255]));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(SKIN_TEST_PORT, "127.0.0.1", resolve));

  app = await startApp();
  await newProject(app.client);
  call = (cmd, args) => app.client.call(cmd, args, { timeoutMs: 120000 });
  dir = tmpDir();
  writeFileSync(`${dir}/skin.png`, png(64, 64));
  writeFileSync(`${dir}/broken.png`, "not a png");
  writeFileSync(`${dir}/wood.png`, png(16, 16, [120, 80, 30, 255]));
  writeFileSync(`${dir}/box.png`, png(16, 16));
  writeFileSync(`${dir}/box.mimodel`, JSON.stringify(model));
  writeFileSync(`${dir}/bad.mimodel`, JSON.stringify({ name: "no_parts", texture: "box.png" }));
  writeFileSync(`${dir}/garbage.schematic`, "this is not a schematic");
  copyFileSync(path.join(path.dirname(exe), "Schematics/Nature/Trees/Trees2.schematic"), `${dir}/tree.schematic`);
});
after(async () => {
  await app?.stop();
  server?.close();
});

const resources = async () => (await call("list_resources")).resources;
const undoSteps = async () => (await call("get_status")).undo_steps;
const skinOf = async (obj) => (await call("get_object", { id: obj.id })).settings.skin;

test("set_skin gives a character a skin from a file, and undo puts the old one back", async () => {
  const hero = await call("create_object", { type: "character" });
  assert.equal(await skinOf(hero), null);

  const result = await call("set_skin", { id: hero.id, path: `${dir}/skin.png` });
  assert.equal(result.id, hero.id);
  assert.equal(result.undo_steps, 1);
  const skin = (await resources()).find((r) => r.id === result.skin);
  assert.deepEqual([skin.type, skin.file, skin.used], ["skin", "skin.png", true]);
  assert.equal(await skinOf(hero), result.skin);

  // A body part stands for its character
  const part = (await call("get_scene")).objects.find((o) => o.part_of === hero.id);
  assert.equal((await call("set_skin", { id: part.id, path: `${dir}/skin.png` })).id, hero.id);

  await call("undo", { steps: 2 });
  assert.equal(await skinOf(hero), null);
});

test("set_skin downloads a player's skin by name", async () => {
  const hero = await call("create_object", { type: "character" });
  const result = await call("set_skin", { id: hero.id, player: "bridgetest_alex" });
  assert.ok(requested.includes("bridgetest_alex"));
  const skin = (await resources()).find((r) => r.id === result.skin);
  assert.deepEqual([skin.type, skin.file], ["downloadskin", "bridgetest_alex.png"]);
  assert.equal(await skinOf(hero), result.skin);
  // The bridge is free again once the download is done
  assert.equal((await call("get_status")).window_state, "");
});

test("set_skin reports unknown players and bad requests without changing anything", async () => {
  const hero = await call("create_object", { type: "character" });
  const cube = await call("create_object", { type: "cube" });
  const steps = await undoSteps();
  await assert.rejects(call("set_skin", { id: hero.id, player: "nobody_here" }), (err) => err.code === "not_found");
  await assert.rejects(call("set_skin", { id: hero.id, player: "not a name!" }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_skin", { id: hero.id }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_skin", { id: hero.id, path: `${dir}/skin.png`, player: "bridgetest_x" }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_skin", { id: hero.id, path: `${dir}/missing.png` }), (err) => err.code === "not_found");
  await assert.rejects(call("set_skin", { id: hero.id, path: `${dir}/box.mimodel` }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_skin", { id: hero.id, path: `${dir}/broken.png` }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_skin", { id: cube.id, path: `${dir}/skin.png` }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_skin", { id: "no-such-id", path: `${dir}/skin.png` }), (err) => err.code === "not_found");
  assert.equal(await undoSteps(), steps);
  assert.equal(await skinOf(hero), null);
});

test("import_model adds a custom model as an object with its parts, in one undo step", async () => {
  const before = (await call("get_scene")).objects.length;
  const box = await call("import_model", { path: `${dir}/box.mimodel`, name: "Crate" });
  assert.equal(box.type, "model");
  assert.equal(box.name, "Crate");
  const parts = (await call("get_scene")).objects.filter((o) => o.part_of === box.id);
  assert.deepEqual(parts.map((p) => p.part).sort(), ["base", "lid"]);
  assert.ok((await resources()).some((r) => r.type === "model" && r.file === "box.mimodel" && r.used));

  // Parts can be animated like a character's
  const lid = parts.find((p) => p.part === "lid");
  await call("set_values", { id: lid.id, frame: 10, values: { rot_x: -60 } });

  await call("undo", { steps: 3 });
  assert.equal((await call("get_scene")).objects.length, before);
});

test("import_model refuses broken models without a dialog or a leftover object", async () => {
  const before = (await call("get_scene")).objects.length;
  const steps = await undoSteps();
  await assert.rejects(call("import_model", { path: `${dir}/bad.mimodel` }), (err) => err.code === "bad_args");
  await assert.rejects(call("import_model", { path: `${dir}/missing.mimodel` }), (err) => err.code === "not_found");
  await assert.rejects(call("import_model", { path: `${dir}/skin.png` }), (err) => err.code === "bad_args");
  assert.equal((await call("get_scene")).objects.length, before);
  assert.equal(await undoSteps(), steps);
  assert.equal((await call("get_status")).window_state, "");
});

test("import_scenery loads a schematic as an object and waits until it is built", async () => {
  const tree = await call("import_scenery", { path: `${dir}/tree.schematic`, name: "Tree" });
  assert.equal(tree.type, "scenery");
  assert.equal(tree.name, "Tree");
  assert.equal(tree.size.length, 3);
  assert.ok(tree.size.every((n) => n > 0));
  assert.ok((await resources()).some((r) => r.type === "scenery" && r.used));
  await call("set_values", { id: tree.id, values: { pos_x: 32 } });
});

test("import_scenery refuses broken files without a dialog or a leftover object", async () => {
  const before = (await call("get_scene")).objects.length;
  await assert.rejects(call("import_scenery", { path: `${dir}/garbage.schematic` }), (err) => err.code === "bad_args");
  await assert.rejects(call("import_scenery", { path: `${dir}/missing.schematic` }), (err) => err.code === "not_found");
  await assert.rejects(call("import_scenery", { path: `${dir}/skin.png` }), (err) => err.code === "bad_args");
  assert.equal((await call("get_scene")).objects.length, before);
  assert.equal((await call("get_status")).window_state, "");
});

test("import_image adds a texture that shapes can use, and remove_resource takes it off them", async () => {
  const image = await call("import_image", { path: `${dir}/wood.png` });
  assert.deepEqual([image.type, image.file, image.used], ["texture", "wood.png", false]);

  const cube = await call("create_object", { type: "cube" });
  const set = await call("set_object_settings", { id: cube.id, settings: { texture: image.id } });
  assert.equal(set.settings.texture, image.id);
  assert.equal((await resources()).find((r) => r.id === image.id).used, true);

  assert.equal((await call("set_object_settings", { id: cube.id, settings: { texture: null } })).settings.texture, null);
  await call("set_object_settings", { id: cube.id, settings: { texture: image.id } });

  assert.deepEqual(await call("remove_resource", { id: image.id }), { removed: 1 });
  assert.ok(!(await resources()).some((r) => r.id === image.id));
  assert.equal((await call("get_object", { id: cube.id })).settings.texture, null);
  await call("undo");
  assert.ok((await resources()).some((r) => r.id === image.id));

  await assert.rejects(call("set_object_settings", { id: cube.id, settings: { texture: "no-such-id" } }), (err) => err.code === "not_found");
  const hero = await call("create_object", { type: "character" });
  await assert.rejects(call("set_object_settings", { id: hero.id, settings: { texture: image.id } }), (err) => err.code === "bad_args");
  await assert.rejects(call("import_image", { path: `${dir}/broken.png` }), (err) => err.code === "bad_args");
  await assert.rejects(call("import_image", { path: `${dir}/box.mimodel` }), (err) => err.code === "bad_args");
  await assert.rejects(call("remove_resource", { id: "no-such-id" }), (err) => err.code === "not_found");
  // The built-in pack is listed but stays
  assert.ok((await resources()).some((r) => r.id === "default" && r.type === "pack"));
  await assert.rejects(call("remove_resource", { id: "default" }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_object_settings", { id: cube.id, settings: { texture: "default" } }), (err) => err.code === "bad_args");
});

test("importing the same file twice keeps both, without asking", async () => {
  const first = await call("import_image", { path: `${dir}/wood.png` });
  const second = await call("import_image", { path: `${dir}/wood.png` });
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.file, second.file);
  assert.equal((await call("get_status")).window_state, "");
});

