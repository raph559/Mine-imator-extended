import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BridgeClient } from "../../src/bridge-client.mjs";

export const TEST_PORT = 41235;
const exe = fileURLToPath(new URL("../../../install/Mine-imator/Mine-imator.exe", import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A fresh temp folder, with forward slashes as the bridge expects. */
export function tmpDir() {
  return mkdtempSync(path.join(os.tmpdir(), "mi-bridge-")).replaceAll("\\", "/");
}

/** Starts the custom build with the bridge on TEST_PORT and waits until assets are loaded. */
export async function startApp() {
  const child = spawn(exe, ["--bridge"], {
    cwd: path.dirname(exe),
    stdio: "ignore",
    env: { ...process.env, MINEIMATOR_BRIDGE_PORT: String(TEST_PORT) },
  });
  const client = new BridgeClient({ port: TEST_PORT });
  const deadline = Date.now() + Number(process.env.MI_READY_TIMEOUT_MS ?? 120000);
  for (;;) {
    try {
      const status = await client.call("get_status");
      if (status.window_state !== "load_assets") break;
    } catch (err) {
      if (err.code !== "ECONNREFUSED" && err.code !== "disconnected") throw err;
    }
    if (child.exitCode !== null) throw new Error(`Mine-imator exited with code ${child.exitCode}`);
    if (Date.now() > deadline) {
      child.kill();
      throw new Error("Mine-imator did not become ready");
    }
    await sleep(500);
  }
  return {
    client,
    stop() {
      client.close();
      child.kill();
    },
  };
}

/** Creates and opens an empty project in a temp folder. */
export function newProject(client) {
  return client.call("project_new", { name: "bridge-test", folder: tmpDir() });
}
