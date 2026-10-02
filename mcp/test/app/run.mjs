// Runs the integration tests with as few app launches as possible:
// one shared instance for every file in this folder, then the files in
// isolated/, which need their own launch conditions. Afterwards it deletes
// every test project and puts the app's recent list and settings back.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BridgeClient } from "../../src/bridge-client.mjs";
import { cleanupTestData, killApp, snapshotAppData, spawnApp, TEST_PORT, waitForBridge } from "./harness.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const testFiles = (dir) => readdirSync(dir).filter((name) => name.endsWith(".test.mjs")).sort().map((name) => dir + name);

function runTests(files, env) {
  const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files], {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  return result.status ?? 1;
}

snapshotAppData();
let sharedStatus = 1;
let isolatedStatus = 1;
try {
  const app = spawnApp();
  try {
    const client = new BridgeClient({ port: TEST_PORT });
    await waitForBridge(client, app);
    client.close();
    sharedStatus = runTests(testFiles(here), { MI_SHARED_APP: String(app.pid) });
  } finally {
    await killApp(app);
  }

  isolatedStatus = runTests(testFiles(here + "isolated/"), { MI_RUNNER: "1" });
} finally {
  cleanupTestData();
}

process.exit(sharedStatus || isolatedStatus);
