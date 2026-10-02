import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function defaultExe() {
  return process.env.MINEIMATOR_EXE ?? fileURLToPath(new URL("../../install/Mine-imator/Mine-imator.exe", import.meta.url));
}

/** Starts the custom build with the bridge unless it already answers, then waits until it is ready. */
export async function launchApp(bridge, { port, exe = defaultExe(), timeoutMs = 120000 }) {
  const ready = async () => {
    try {
      const status = await bridge.call("get_status");
      return status.window_state === "load_assets" ? null : status;
    } catch (err) {
      if (err.code === "ECONNREFUSED" || err.code === "disconnected") return null;
      throw err;
    }
  };

  const already = await ready();
  if (already) return { ...already, launched: false };

  if (!existsSync(exe)) throw new Error(`Mine-imator custom build not found at ${exe}. Set MINEIMATOR_EXE.`);
  spawn(exe, ["--bridge"], {
    cwd: path.dirname(exe),
    detached: true,
    stdio: "ignore",
    env: { ...process.env, MINEIMATOR_BRIDGE_PORT: String(port) },
  }).unref();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(500);
    const status = await ready();
    if (status) return { ...status, launched: true };
  }
  throw new Error("Mine-imator was started but did not become ready in time");
}
