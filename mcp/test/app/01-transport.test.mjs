import assert from "node:assert/strict";
import net from "node:net";
import { after, before, test } from "node:test";
import { BridgeError } from "../../src/bridge-client.mjs";
import { startApp, TEST_PORT } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(() => app?.stop());

/** Writes raw chunks and collects `count` response lines. */
function raw(chunks, count) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: TEST_PORT });
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("error", reject);
    socket.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n").filter((line) => line !== "");
      if (lines.length >= count && buffer.endsWith("\n")) {
        socket.destroy();
        resolve(lines.map((line) => JSON.parse(line)));
      }
    });
    socket.on("connect", async () => {
      for (const chunk of chunks) {
        socket.write(chunk);
        await new Promise((r) => setTimeout(r, 30));
      }
    });
  });
}

test("get_status reports version, protocol and the home screen", async () => {
  const status = await app.client.call("get_status");
  assert.equal(typeof status.version, "string");
  assert.equal(status.protocol, 1);
  assert.equal(status.window_state, "startup");
});

test("other commands are refused with no_project on the home screen", async () => {
  await assert.rejects(app.client.call("get_scene"), (err) => err instanceof BridgeError && err.code === "no_project");
  await assert.rejects(app.client.call("definitely_not_a_command"), (err) => err.code === "no_project");
});

test("a malformed line gets bad_request and the connection keeps working", async () => {
  const [bad, good] = await raw(["this is not json\n", '{"id":2,"cmd":"get_status","args":{}}\n'], 2);
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, "bad_request");
  assert.equal(bad.id, null);
  assert.equal(good.id, 2);
  assert.equal(good.ok, true);
});

test("a request without cmd or with non-object args gets bad_request with its id", async () => {
  const [noCmd, badArgs] = await raw(['{"id":"a"}\n{"id":"b","cmd":"get_status","args":5}\n'], 2);
  assert.deepEqual([noCmd.id, noCmd.error.code], ["a", "bad_request"]);
  assert.deepEqual([badArgs.id, badArgs.error.code], ["b", "bad_request"]);
});

test("two requests in one packet get two responses in order", async () => {
  const responses = await raw(['{"id":1,"cmd":"get_status"}\n{"id":2,"cmd":"get_status"}\n'], 2);
  assert.deepEqual(responses.map((r) => r.id), [1, 2]);
});

test("one request split across packets gets one response", async () => {
  const [response] = await raw(['{"id":7,"cmd":"get_', 'status","args":{}}', "\n"], 1);
  assert.equal(response.id, 7);
  assert.equal(response.ok, true);
});

test("a client that disconnects before the reply does not break the app", async () => {
  const socket = net.createConnection({ host: "127.0.0.1", port: TEST_PORT });
  await new Promise((resolve) => socket.on("connect", resolve));
  socket.write('{"id":1,"cmd":"get_status"}\n');
  socket.destroy();
  await new Promise((r) => setTimeout(r, 200));
  assert.equal((await app.client.call("get_status")).protocol, 1);
});
