import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BridgeClient } from "../../src/bridge-client.mjs";

export const TEST_PORT = 41235;
export const exe = fileURLToPath(new URL("../../../install/Mine-imator/Mine-imator.exe", import.meta.url));
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Everything the tests write goes under this one folder, which is deleted afterwards
const TEST_ROOT = path.join(os.tmpdir(), "mi-bridge-tests");

// App files the tests change as a side effect (opening a project adds it to the
// recent list) or on purpose. They are put back as they were afterwards.
const dataDir = path.join(path.dirname(exe), "Data");
const PRESERVED = ["recent.midata", "settings.midata"];

/** A fresh folder for a test project, with forward slashes as the bridge expects. */
export function tmpDir() {
  mkdirSync(TEST_ROOT, { recursive: true });
  return mkdtempSync(path.join(TEST_ROOT, "p-")).replaceAll("\\", "/");
}

const backupOf = (file) => file + ".test-backup";

/**
 * Backs up the app files the tests will touch. Call it before starting the app.
 * The backups live on disk, so if a run is killed before it can clean up, the
 * next run finds them and finishes the job first.
 */
export function snapshotAppData() {
  cleanupTestData();
  for (const name of PRESERVED) {
    const file = path.join(dataDir, name);
    if (existsSync(file)) copyFileSync(file, backupOf(file));
  }
}

/** Deletes every test project and puts the app's files back. Call it after the app has stopped. */
export function cleanupTestData() {
  rmSync(TEST_ROOT, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  for (const name of PRESERVED) {
    const file = path.join(dataDir, name);
    if (!existsSync(backupOf(file))) continue;
    copyFileSync(backupOf(file), file);
    rmSync(backupOf(file), { force: true });
  }
}

/** Spawns the custom build on TEST_PORT without waiting for it. */
export function spawnApp({ args = ["--bridge"], env = {} } = {}) {
  return spawn(exe, args, {
    cwd: path.dirname(exe),
    stdio: "ignore",
    env: { ...process.env, MINEIMATOR_BRIDGE_PORT: String(TEST_PORT), ...env },
  });
}

/** Kills an app the tests started and waits until it is gone, so its files can be restored. */
export async function killApp(child) {
  // A process ended by kill() reports signalCode, not exitCode
  if (child.exitCode !== null || child.signalCode !== null) return;

  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, sleep(5000)]); // never let cleanup wait forever
}

/** Waits until the bridge answers and the app has finished loading its assets. */
export async function waitForBridge(client, child) {
  const deadline = Date.now() + Number(process.env.MI_READY_TIMEOUT_MS ?? 120000);
  for (;;) {
    try {
      const status = await client.call("get_status");
      if (status.window_state !== "load_assets") return status;
    } catch (err) {
      if (err.code !== "ECONNREFUSED" && err.code !== "disconnected") throw err;
    }
    if (child && (child.exitCode !== null || child.signalCode !== null)) throw new Error("Mine-imator exited before its bridge answered");
    if (Date.now() > deadline) {
      child?.kill();
      throw new Error("Mine-imator did not become ready");
    }
    await sleep(500);
  }
}

/**
 * Gives a test file an app to talk to.
 * Under `npm run test:app` every file shares the one instance run.mjs started
 * (MI_SHARED_APP), so the window is not opened and closed for each file, and
 * run.mjs cleans up at the end. A file run on its own starts its own instance
 * and cleans up in stop().
 */
export async function startApp({ env = {} } = {}) {
  const client = new BridgeClient({ port: TEST_PORT });
  if (process.env.MI_SHARED_APP) {
    await waitForBridge(client, null);
    return { client, pid: Number(process.env.MI_SHARED_APP), stop: () => client.close() };
  }

  snapshotAppData();
  const child = spawnApp({ env });
  await waitForBridge(client, child);
  return {
    client,
    pid: child.pid,
    async stop() {
      client.close();
      await killApp(child);
      cleanupTestData();
    },
  };
}

/** Creates and opens an empty project in a temp folder, dropping whatever an earlier test left open. */
export function newProject(client) {
  return client.call("project_new", { name: "bridge-test", folder: tmpDir(), discard: true });
}
