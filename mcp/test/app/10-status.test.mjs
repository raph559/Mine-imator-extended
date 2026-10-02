import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { exe, sleep, startApp, TEST_PORT } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(() => app?.stop());

const logFile = path.join(path.dirname(exe), "Data", "log.txt");

test("get_status reports the number of connected clients", async () => {
  assert.equal((await app.client.call("get_status")).clients, 1);
});

test("the window title carries no bridge text", () => {
  const title = execFileSync("powershell.exe", ["-NoProfile", "-Command", `(Get-Process -Id ${app.pid}).MainWindowTitle`], { encoding: "utf8" }).trim();
  assert.match(title, /Mine-imator$/);
  assert.doesNotMatch(title, /Bridge/);
});

test("only the start of the bridge is announced, not each client", async () => {
  await sleep(500);
  const log = readFileSync(logFile, "utf8");
  assert.match(log, new RegExp(`New toast: Automation bridge started on port ${TEST_PORT}`));
  assert.doesNotMatch(log, /New toast: Bridge: client/);
});
