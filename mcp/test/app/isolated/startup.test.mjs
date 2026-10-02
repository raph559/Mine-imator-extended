// Launch conditions that cannot share the common test instance: starting
// without the --bridge flag, and starting with the "start automatically" setting.
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { after, test } from "node:test";
import { BridgeClient } from "../../../src/bridge-client.mjs";
import { cleanupTestData, exe, killApp, sleep, snapshotAppData, spawnApp, TEST_PORT, tmpDir } from "../harness.mjs";

const dataDir = path.join(path.dirname(exe), "Data");
const logFile = path.join(dataDir, "log.txt");
const settingsFile = path.join(dataDir, "settings.midata");
if (!process.env.MI_RUNNER) snapshotAppData();
const originalSettings = existsSync(settingsFile) ? readFileSync(settingsFile, "utf8") : null;

const apps = [];
let client = null;
after(async () => {
  client?.close();
  for (const child of apps) await killApp(child);
  cleanupTestData();
});

const log = () => (existsSync(logFile) ? readFileSync(logFile, "utf8") : "");

/** True if something accepts connections on the test port. */
function portOpen() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: TEST_PORT });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

/** Starts the app WITHOUT the --bridge flag and waits until its interface is up. */
async function startPlain(env = {}) {
  rmSync(logFile, { force: true });
  const child = spawnApp({ args: [], env });
  apps.push(child);
  for (let i = 0; i < 240 && !/Project resetted/.test(log()); i++) await sleep(250);
  assert.match(log(), /Project resetted/, "the app did not finish starting");
  await sleep(1500);
  return child;
}

test("without --bridge the port stays closed, even when a port is configured", async () => {
  const child = await startPlain();
  assert.equal(await portOpen(), false);
  assert.doesNotMatch(log(), /Automation bridge started/);
  await killApp(child);
});

test("with the start automatically setting the bridge opens without the flag, and a slow export times out", async () => {
  assert.ok(originalSettings, "the custom build has no settings file yet");
  const settings = JSON.parse(originalSettings);
  settings.program.bridge_autostart = true;
  writeFileSync(settingsFile, JSON.stringify(settings, null, "\t"));

  // A 1 ms limit for commands that finish over several steps, to exercise the timeout
  const child = await startPlain({ MINEIMATOR_BRIDGE_PENDING_TIMEOUT_MS: "1" });
  assert.equal(await portOpen(), true);
  assert.match(log(), new RegExp(`New toast: Automation bridge started on port ${TEST_PORT}`));

  client = new BridgeClient({ port: TEST_PORT });
  await client.call("project_new", { name: "slow", folder: tmpDir() });

  // A high quality render takes many steps, so it is still running when the limit passes
  const out = `${tmpDir()}/slow.png`;
  await assert.rejects(client.call("export_image", { path: out, high_quality: true }, { timeoutMs: 60000 }), (err) => err.code === "timeout");
  for (let i = 0; i < 240; i++) {
    if ((await client.call("get_status")).window_state === "") break;
    await sleep(500);
  }
  assert.equal((await client.call("get_status")).window_state, "");
  assert.ok(Array.isArray((await client.call("get_scene")).objects));
});
