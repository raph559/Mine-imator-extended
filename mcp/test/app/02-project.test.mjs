import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { startApp, tmpDir } from "./harness.mjs";

let app;
const folder = tmpDir();
const file = `${folder}/My test.miproject`;
before(async () => { app = await startApp(); });
after(() => app?.stop());

test("project_new requires a name", async () => {
  await assert.rejects(app.client.call("project_new", {}), (err) => err.code === "bad_args");
});

test("project_new creates the project file and leaves the home screen", async () => {
  const status = await app.client.call("project_new", { name: "My test", folder });
  assert.equal(status.project_name, "My test");
  assert.equal(status.project_file, file);
  assert.equal(status.window_state, "");
  assert.equal(status.project_changed, false);
  assert.ok(existsSync(file));
});

test("project_new refuses to overwrite an existing project", async () => {
  await assert.rejects(app.client.call("project_new", { name: "My test", folder }), (err) => err.code === "already_exists");
});

test("unknown commands report unknown_command once a project is open", async () => {
  await assert.rejects(app.client.call("definitely_not_a_command"), (err) => err.code === "unknown_command");
});

test("project_save succeeds and project_open reopens the file", async () => {
  assert.equal((await app.client.call("project_save")).project_changed, false);
  const status = await app.client.call("project_open", { path: file });
  assert.equal(status.project_name, "My test");
  assert.equal(status.window_state, "");
});

test("project_open reports not_found for a missing file and bad_args for other file types", async () => {
  await assert.rejects(app.client.call("project_open", { path: `${folder}/missing.miproject` }), (err) => err.code === "not_found");
  await assert.rejects(app.client.call("project_open", { path: `${folder}/thumbnail.png` }), (err) => err.code === "bad_args" || err.code === "not_found");
});

test("project_open refuses unloadable project files without opening a dialog", async () => {
  const cases = {
    "garbage.miproject": "this is not json",
    "no-format.miproject": "{}",
    "too-new.miproject": '{"format": 9999}',
    "too-old.miproject": '{"format": 3}',
  };
  for (const [name, content] of Object.entries(cases)) {
    writeFileSync(`${folder}/${name}`, content);
    await assert.rejects(
      app.client.call("project_open", { path: `${folder}/${name}` }, { timeoutMs: 8000 }),
      (err) => err.code === "load_failed",
      name,
    );
  }
  const status = await app.client.call("get_status", {}, { timeoutMs: 8000 });
  assert.equal(status.window_state, "");
  assert.equal(status.project_name, "My test");
});