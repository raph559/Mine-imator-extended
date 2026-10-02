import assert from "node:assert/strict";
import net from "node:net";
import { after, before, test } from "node:test";
import { BridgeClient, BridgeError } from "../../src/bridge-client.mjs";

let server, port, onLine;

before(async () => {
  server = net.createServer((socket) => {
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf("\n")) >= 0) {
        onLine(JSON.parse(buffer.slice(0, i)), socket);
        buffer = buffer.slice(i + 1);
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});

after(() => server.close());

test("resolves with the result of an ok response", async () => {
  onLine = (req, socket) => socket.write(JSON.stringify({ id: req.id, ok: true, result: { cmd: req.cmd, args: req.args } }) + "\n");
  const client = new BridgeClient({ port });
  assert.deepEqual(await client.call("ping", { a: 1 }), { cmd: "ping", args: { a: 1 } });
  client.close();
});

test("rejects with BridgeError carrying the error code", async () => {
  onLine = (req, socket) => socket.write(JSON.stringify({ id: req.id, ok: false, error: { code: "not_found", message: "nope" } }) + "\n");
  const client = new BridgeClient({ port });
  await assert.rejects(client.call("x"), (err) => err instanceof BridgeError && err.code === "not_found" && err.message === "nope");
  client.close();
});

test("matches responses to requests when they arrive batched, split and out of order", async () => {
  const held = [];
  onLine = (req, socket) => {
    held.push(req);
    if (held.length < 2) return;
    const second = JSON.stringify({ id: held[1].id, ok: true, result: { n: 2 } }) + "\n";
    const first = JSON.stringify({ id: held[0].id, ok: true, result: { n: 1 } }) + "\n";
    const all = second + first;
    socket.write(all.slice(0, 10));
    setTimeout(() => socket.write(all.slice(10)), 20);
  };
  const client = new BridgeClient({ port });
  const [a, b] = await Promise.all([client.call("a"), client.call("b")]);
  assert.deepEqual([a, b], [{ n: 1 }, { n: 2 }]);
  client.close();
});

test("times out with code timeout", async () => {
  onLine = () => {};
  const client = new BridgeClient({ port });
  await assert.rejects(client.call("slow", {}, { timeoutMs: 50 }), (err) => err.code === "timeout");
  client.close();
});

test("rejects pending calls when the server closes, then reconnects on the next call", async () => {
  onLine = (req, socket) => socket.destroy();
  const client = new BridgeClient({ port });
  await assert.rejects(client.call("x"), (err) => err.code === "disconnected");
  onLine = (req, socket) => socket.write(JSON.stringify({ id: req.id, ok: true, result: {} }) + "\n");
  assert.deepEqual(await client.call("y"), {});
  client.close();
});

test("rejects with ECONNREFUSED when nothing listens", async () => {
  const client = new BridgeClient({ port: 1 });
  await assert.rejects(client.call("x"), (err) => err.code === "ECONNREFUSED");
});
