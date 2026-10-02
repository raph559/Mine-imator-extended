import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { newProject, startApp, tmpDir } from "./harness.mjs";

let app, call;
const out = tmpDir();
before(async () => {
  app = await startApp();
  await newProject(app.client);
  call = (cmd, args, opts) => app.client.call(cmd, args, { timeoutMs: 120000, ...opts });
  const cube = await call("create_object", { type: "cube" });
  await call("set_keyframes", {
    keyframes: [
      { id: cube.id, frame: 0, values: { pos_x: -32 } },
      { id: cube.id, frame: 12, values: { pos_x: 32 } },
    ],
  });
  await call("set_frame", { frame: 5 });
});
after(() => app?.stop());

/** The four letters at byte 4 of an MP4 or MOV file. */
const boxType = (file) => readFileSync(file).subarray(4, 8).toString("latin1");

test("export_movie refuses bad paths and ranges without starting an export", async () => {
  const existing = `${out}/keep.mp4`;
  writeFileSync(existing, "keep me");
  const bad = [
    {},
    { path: `${out}/a.avi` },
    { path: `${out}/no-such-folder/a.mp4` },
    { path: existing },
    { path: `${out}/a.mp4`, start_frame: 12, end_frame: 12 },
    { path: `${out}/a.mp4`, start_frame: -1 },
    { path: `${out}/a.mp4`, frame_rate: 0 },
    { path: `${out}/a.mp4`, bit_rate: -5 },
  ];
  for (const args of bad)
    await assert.rejects(call("export_movie", args), (err) => err.code === "bad_args", JSON.stringify(args));
  assert.equal(readFileSync(existing, "utf8"), "keep me");
  assert.equal(existsSync(`${out}/a.mp4`), false);
  assert.equal((await call("get_status")).window_state, "");
});

test("export_movie renders the whole timeline to an MP4 and reports what it made", async () => {
  const path = `${out}/whole.mp4`;
  const result = await call("export_movie", { path, high_quality: false });
  assert.deepEqual(result, { path, frames: 13, frame_rate: 24, width: 1280, height: 720, seconds: 0.542 });
  assert.equal(boxType(path), "ftyp");
  assert.ok(readFileSync(path).length > 2000);
});

test("after an export the marker is back where it was and the app is idle", async () => {
  const status = await call("get_status");
  assert.equal(status.window_state, "");
  assert.equal(status.frame, 5);
});

test("get_status reports progress while a movie is exporting", async () => {
  const path = `${out}/progress.mp4`;
  const exported = call("export_movie", { path, high_quality: false });
  const status = await call("get_status");
  assert.equal(status.window_state, "export_movie");
  assert.equal(status.export_frames, 13);
  assert.ok(status.export_frame >= 0 && status.export_frame <= 13);
  assert.equal((await exported).frames, 13);
});

test("export_movie honours a frame range, a frame rate, overwrite and the MOV format", async () => {
  const path = `${out}/part.mov`;
  writeFileSync(path, "old");
  const result = await call("export_movie", { path, overwrite: true, start_frame: 4, end_frame: 8, frame_rate: 12, high_quality: false });
  assert.equal(result.frames, 3); // frames 4, 6 and 8 of a 24-per-second timeline at 12 per second
  assert.equal(result.frame_rate, 12);
  assert.equal(boxType(path), "ftyp");
});
