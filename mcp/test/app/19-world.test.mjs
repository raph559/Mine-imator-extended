import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { after, before, test } from "node:test";
import { countPixels, decodePng, newProject, startApp, tmpDir } from "./harness.mjs";
import { writeWorld } from "./world-fixture.mjs";

// A floor of stone in the first chunk and a column of planks in the second
const world = tmpDir();
writeWorld(world, [
  { cx: 0, cz: 0, sections: [{ y: 0, blocks: (x, y, z) => (y === 0 ? "minecraft:stone" : null) }] },
  { cx: 1, cz: 0, sections: [{ y: 0, blocks: (x, y, z) => (x === 1 && z === 1 && y < 6 ? "minecraft:oak_planks" : null) }] },
]);
const box = { from: [0, 0, 0], to: [32, 8, 16] };

let app, call, out;
before(async () => {
  app = await startApp();
  await newProject(app.client);
  call = (cmd, args) => app.client.call(cmd, args, { timeoutMs: 300000 });
  out = tmpDir();
});
after(() => app?.stop());

const status = () => call("get_status");
const objectIds = async () => (await call("get_scene")).objects.map((o) => o.id).sort();
const resourceIds = async () => (await call("list_resources")).resources.map((r) => r.id).sort();

/** Imports a box with the given options, looks at it from a fixed camera, takes it out again, and counts what the picture shows. */
async function look(name, extra) {
  const before = (await status()).undo_steps;
  await call("import_world", { world_folder: world, ...box, ...extra });
  await call("select", { ids: [] }); // No selection outline
  await call("set_work_camera", { focus: [128, 64, 16], angle_xy: 200, angle_z: 35, zoom: 500 });
  await sleep(1000);
  const path = `${out}/${name}.png`;
  await call("screenshot", { path });
  if (process.env.MI_KEEP_SHOTS) {
    mkdirSync(process.env.MI_KEEP_SHOTS, { recursive: true });
    copyFileSync(path, `${process.env.MI_KEEP_SHOTS}/${name}.png`);
  }
  await call("undo", { steps: (await status()).undo_steps - before });

  const image = decodePng(readFileSync(path));
  return {
    // Grey stone against green grass and orange planks
    stone: countPixels(image, (r, g, b) => Math.abs(r - g) < 14 && Math.abs(g - b) < 14 && r > 90 && r < 210),
    planks: countPixels(image, (r, g, b) => r > g + 25 && g > b + 25),
  };
}

test("import_world adds a box of a world as a scenery object and waits until it is built", async () => {
  const before = await status();
  const spot = await call("import_world", { world_folder: world, ...box, name: "Spot" });
  assert.equal(spot.type, "scenery");
  assert.equal(spot.name, "Spot");
  assert.equal(spot.size.length, 3);
  assert.ok(spot.size.every((n) => n > 0), JSON.stringify(spot.size));
  assert.ok((await resourceIds()).length > 1);
  assert.ok((await call("list_resources")).resources.some((r) => r.type === "fromworld" && r.used));

  // Back to nothing, as one Ctrl+Z per step
  const steps = (await status()).undo_steps - before.undo_steps;
  assert.ok(steps >= 2 && steps <= 3, `undo steps: ${steps}`);
  await call("undo", { steps });
  assert.equal((await call("get_scene")).objects.length, before.object_count);
});

test("a region folder can be given directly, and the same box gives the same size", async () => {
  const before = (await status()).undo_steps;
  const viaWorld = await call("import_world", { world_folder: world, ...box });
  const viaRegions = await call("import_world", { world_folder: `${world}/region`, ...box });
  assert.deepEqual(viaRegions.size, viaWorld.size);
  await call("undo", { steps: (await status()).undo_steps - before }); // Nothing stays in the scene for the next test
});

test("only_blocks and exclude_blocks change what is built", async () => {
  const everything = await look("everything", {});
  assert.ok(everything.stone > 1500 && everything.planks > 100, JSON.stringify(everything));

  const planksOnly = await look("planks-only", { only_blocks: ["planks"] });
  assert.ok(planksOnly.planks > 100 && planksOnly.stone < 100, JSON.stringify(planksOnly));

  const stoneOnly = await look("stone-only", { only_blocks: ["stone"] });
  assert.ok(stoneOnly.stone > 1500 && stoneOnly.planks < 50, JSON.stringify(stoneOnly));

  const noStone = await look("no-stone", { exclude_blocks: ["stone"] });
  assert.ok(noStone.planks > 100 && noStone.stone < 100, JSON.stringify(noStone));

  const noPlanks = await look("no-planks", { exclude_blocks: ["planks"] });
  assert.ok(noPlanks.stone > 1500 && noPlanks.planks < 50, JSON.stringify(noPlanks));
});

test("import_world refuses bad requests and leaves nothing behind", async () => {
  const objects = await objectIds();
  const resources = await resourceIds();
  const before = await status();
  const empty = tmpDir();
  const reject = (args, code) => assert.rejects(call("import_world", args), (err) => err.code === code, JSON.stringify(args));

  await reject({ world_folder: `${empty}/nowhere`, ...box }, "not_found");
  await reject({ world_folder: empty, ...box }, "not_found"); // no region files
  await reject({ world_folder: world, ...box, dimension: "nether" }, "not_found"); // no such dimension in the world
  await reject({ world_folder: world, ...box, dimension: "sky" }, "bad_args");
  await reject({ world_folder: world, from: [0, 0, 0], to: [0, 8, 16] }, "bad_args");
  await reject({ world_folder: world, from: [8, 8, 8], to: [0, 16, 16] }, "bad_args");
  await reject({ world_folder: world, from: [0, 0, 0], to: [2000, 8, 16] }, "bad_args");
  await reject({ world_folder: world, from: [0, 0, 0.5], to: [16, 8, 16] }, "bad_args");
  await reject({ world_folder: world, from: [0, 0], to: [16, 8, 16] }, "bad_args");
  await reject({ world_folder: world, ...box, only_blocks: ["stone"], exclude_blocks: ["dirt"] }, "bad_args");
  await reject({ world_folder: world, ...box, only_blocks: [] }, "bad_args");
  await reject({ world_folder: world, ...box, exclude_blocks: ["no_such_block"] }, "not_found");
  await reject({ ...box }, "bad_args");

  // A box that is all air builds nothing: refused after the app tried, and taken back
  await reject({ world_folder: world, from: [400, 0, 400], to: [416, 8, 416] }, "not_found");
  await reject({ world_folder: world, from: [0, 100, 0], to: [16, 108, 16] }, "not_found");

  assert.deepEqual(await objectIds(), objects);
  assert.deepEqual(await resourceIds(), resources);
  const after = await status();
  assert.equal(after.undo_steps, before.undo_steps);
  assert.equal((await call("redo")).done, false, "a refused import cannot be redone");
  assert.equal(after.window_state, "");
});
