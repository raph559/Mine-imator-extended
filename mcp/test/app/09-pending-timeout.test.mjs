import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { newProject, startApp, tmpDir } from "./harness.mjs";

let app;
before(async () => {
  app = await startApp({ env: { MINEIMATOR_BRIDGE_PENDING_TIMEOUT_MS: "1" } });
  await newProject(app.client);
});
after(() => app?.stop());

test("a pending export that takes longer than the timeout is answered with timeout, and the bridge keeps working", async () => {
  const path = `${tmpDir()}/slow.png`;
  await assert.rejects(app.client.call("export_image", { path, high_quality: true }, { timeoutMs: 60000 }), (err) => err.code === "timeout");
  // A high quality render takes many steps, so it is still running when the 1 ms timeout passes. Let it finish.
  for (let i = 0; i < 240; i++) {
    if ((await app.client.call("get_status")).window_state === "") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal((await app.client.call("get_status")).window_state, "");
  assert.ok((await app.client.call("get_scene")).objects.length >= 0);
});