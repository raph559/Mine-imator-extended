import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { newProject, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); await newProject(app.client); });
after(() => app?.stop());

test("get_scene lists objects of a new project as an array", async () => {
  const scene = await app.client.call("get_scene");
  assert.ok(Array.isArray(scene.objects));
  assert.equal(scene.frame, 0);
  assert.equal(scene.objects.length, (await app.client.call("get_status")).object_count);
});

test("get_object reports not_found for an unknown or missing id", async () => {
  await assert.rejects(app.client.call("get_object", { id: "no-such-id" }), (err) => err.code === "not_found");
  await assert.rejects(app.client.call("get_object", {}), (err) => err.code === "not_found");
});
