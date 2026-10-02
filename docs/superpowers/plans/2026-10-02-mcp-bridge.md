# Mine-imator MCP Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an MCP client control a running Mine-imator live (create objects, keyframe them, move the camera, read the scene, screenshot, export) through a local socket built into a custom build of the app.

**Architecture:** A `QTcpServer` inside the app (C++/Qt) accepts newline-delimited JSON on 127.0.0.1. Once per step it hands each request to a GML dispatcher (`bridge_dispatch`) that calls the same `action_*` scripts the UI uses and returns a ds_map, which C++ serialises back to JSON. A Node MCP server (stdio) maps one tool to one bridge command.

**Tech Stack:** C++17 + Qt 5.15 (QtNetwork), GML transpiled by CppGen, Node 22 (plain ESM JavaScript, `node:test`), `@modelcontextprotocol/sdk`, `zod`.

**Spec:** `docs/superpowers/specs/2026-10-02-mcp-bridge-design.md`

## Global Constraints

- Socket binds to `127.0.0.1` only. It opens only when the app is started with `--bridge` or env `MINEIMATOR_BRIDGE_PORT` is set. Default port `41234`. Integration tests use `41235`.
- Protocol: one JSON object per line. Request `{"id", "cmd", "args"}`. Response `{"id", "ok": true, "result": {...}}` or `{"id", "ok": false, "error": {"code", "message"}}`.
- Objects are addressed by `save_id` (string). Value names are the app's own `value_name_list` names, accepted and returned in lower case (`pos_x`, `rot_z`, `transition`, ...).
- Colours cross the bridge as `"#RRGGBB"`.
- Paths sent to the bridge use forward slashes. The MCP server converts backslashes; raw bridge clients must send forward slashes.
- No command may open a dialog. Never call `error()`, `question()`, `show_message*`, `file_dialog_*`, or `new_res()` on a filename that already exists as a resource.
- Commands mutate state through existing `action_*` / `tl_*` scripts so undo history stays consistent. Never edit files under `CppProject/Generated/`.
- CppGen supports no `try`/`catch`, no `json_encode`, no struct literals. Write GML in the idiom of the surrounding scripts (tabs, `=` comparisons, `var a, b;` then assignments, `map[?key]`, `list[|i]`). If CppGen or the C++ compile rejects a construct, rewrite it using an idiom that already exists in `GmProject/scripts`.
- In bridge mode the app uses `%APPDATA%/Mine-imator/Bridge/` as its temporary folder, so it can run next to the official build.
- The custom build lives in `install/Mine-imator/`. Build with `mcp/scripts/build.ps1` (it stops a running custom build first; it never touches the official install).
- Integration tests launch the real app and open its window. Tell the user before running them.
- Commit messages: plain, no AI attribution or co-author trailers.

## Review Focus

1. A request line that is malformed, split across TCP packets, or batched with another line: each complete line gets exactly one response, in order, and a bad line gets `bad_request` without breaking the connection. (Task 1 test.)
2. Any command other than `get_status` / `project_new` / `project_open` sent while the app is on its home screen: `no_project`, nothing changes. `project_new` / `project_open` with unsaved changes: `unsaved_changes` unless `discard: true`. (Task 1 and Task 4 tests.)
3. A stale or unknown object id (for example after `remove_object`): `not_found`, scene unchanged. (Task 4 test.)
4. `set_values` where one name or type is wrong among valid ones: `bad_args` and nothing is applied, no keyframe is created. (Task 5 test.)
5. `screenshot` / `export_image` to a path that already exists or whose folder is missing: `bad_args`, existing file untouched, unless `overwrite: true`. (Task 6 test.)

## File Structure

| File | Responsibility |
|---|---|
| `CppProject/Bridge/Bridge.hpp`, `Bridge.cpp` | TCP server, line framing, JSON envelope, ds_map → JSON, calling `bridge_dispatch` once per step |
| `CppProject/AppHandler.cpp` (modify) | Opt-in start of the bridge, separate temp folder, per-step hook |
| `GmProject/scripts/bridge_core/` | `bridge_dispatch`, `bridge_dispatch_command`, response and argument helpers, `get_status` |
| `GmProject/scripts/bridge_project/` | `project_new`, `project_open`, `project_save` |
| `GmProject/scripts/bridge_scene/` | `get_scene`, `get_object`, summary and value serialisation |
| `GmProject/scripts/bridge_objects/` | `create_object`, `remove_object`, `rename_object`, `set_parent`, `select`, `undo`, `redo` |
| `GmProject/scripts/bridge_keyframes/` | `set_frame`, `set_values`, `remove_keyframes`, `move_keyframes` |
| `GmProject/scripts/bridge_view/` | `set_work_camera`, `play`, `stop`, `screenshot`, `export_image`, `set_background`, `bridge_pending_poll` |
| `mcp/scripts/add-gml-script.ps1`, `build.ps1` | Register a new GML script; rebuild + install the custom build |
| `mcp/src/bridge-client.mjs` | TCP client: framing, request ids, timeouts, typed errors |
| `mcp/src/tools.mjs` | Tool table: name, description, zod shape, bridge command, path handling |
| `mcp/src/launcher.mjs` | Start the custom build with the bridge and wait until it is ready |
| `mcp/src/server.mjs` | MCP stdio server wiring |
| `mcp/test/unit/*.test.mjs` | Client and tool-table tests against a fake bridge |
| `mcp/test/app/*.test.mjs`, `harness.mjs` | Integration tests against the real app |

---

### Task 1: Transport and `get_status` round trip

**Files:**
- Create: `mcp/scripts/add-gml-script.ps1`, `mcp/scripts/build.ps1`
- Create: `CppProject/Bridge/Bridge.hpp`, `CppProject/Bridge/Bridge.cpp`
- Modify: `CppProject/AppHandler.cpp` (constructor temp-folder block near line 95; `timerEvent` near line 333)
- Create: `GmProject/scripts/bridge_core/bridge_core.gml` (+ `.yy`), entry in `GmProject/Mine-imator.yyp`
- Create: `mcp/package.json`, `mcp/src/bridge-client.mjs`, `mcp/test/app/harness.mjs`
- Test: `mcp/test/unit/bridge-client.test.mjs`, `mcp/test/app/01-transport.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces (GML): `bridge_dispatch(cmd, argsjson)` → response map id; `bridge_dispatch_command(cmd, args)` → response map id (later tasks add `case`s here); `bridge_ok(result)`, `bridge_error(code, message)` → response map id; `bridge_arg(args, name, def)`; `bridge_find_tl(saveid)` → timeline instance or `null`; `bridge_cmd_get_status(args)`.
- Produces (C++): `Bridge::instance`, `Bridge::Start(quint16)`, `Bridge::ProcessPending()`. A response map containing `"pending": true` makes C++ hold the request and call `bridge_pending_poll()` every step until it returns a map id ≥ 0 (defined in Task 6).
- Produces (JS): `class BridgeClient({host, port, timeoutMs})` with `call(cmd, args, {timeoutMs})` → result object, throws `BridgeError` (`.code`, `.message`); `close()`. `startApp()` → `{ client, stop() }`, `newProject(client)` → status, `tmpDir()` → forward-slash temp folder.

- [ ] **Step 1: Helper scripts**

`mcp/scripts/add-gml-script.ps1`:

```powershell
# Usage: .\add-gml-script.ps1 <name>
# Creates GmProject/scripts/<name>/<name>.gml + .yy and registers it in Mine-imator.yyp.
param([Parameter(Mandatory = $true)][string] $Name)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dir = Join-Path $repo "GmProject\scripts\$Name"
if (Test-Path $dir) { throw "Script $Name already exists" }

$yyp = Join-Path $repo "GmProject\Mine-imator.yyp"
$text = [IO.File]::ReadAllText($yyp)
$anchor = '{"id":{"name":"app_event_http","path":"scripts/app_event_http/app_event_http.yy",},"order":35,},'
if (-not $text.Contains($anchor)) { throw "Anchor entry not found in Mine-imator.yyp" }

New-Item -ItemType Directory $dir | Out-Null
$yy = "{`n  `"resourceType`": `"GMScript`",`n  `"resourceVersion`": `"1.0`",`n  `"name`": `"$Name`",`n  `"isDnD`": false,`n  `"isCompatibility`": false,`n  `"parent`": {`n    `"name`": `"App`",`n    `"path`": `"folders/Scripts/App.yy`",`n  },`n}"
[IO.File]::WriteAllText((Join-Path $dir "$Name.yy"), $yy)
[IO.File]::WriteAllText((Join-Path $dir "$Name.gml"), "")

$entry = '{"id":{"name":"' + $Name + '","path":"scripts/' + $Name + '/' + $Name + '.yy",},"order":35,},'
$newline = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
[IO.File]::WriteAllText($yyp, $text.Replace($anchor, $anchor + $newline + "    " + $entry))
Write-Host "Added script $Name"
```

`mcp/scripts/build.ps1`:

```powershell
# Rebuilds and installs the custom build into install/Mine-imator.
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$exe = Join-Path $repo "install\Mine-imator\Mine-imator.exe"

# The install step cannot overwrite a running exe
Get-Process | Where-Object { $_.Path -eq $exe } | Stop-Process -Force

if (-not $env:DEV_DIR) { $env:DEV_DIR = [Environment]::GetEnvironmentVariable("DEV_DIR", "Machine") }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "Setup.ps1") Release
exit $LASTEXITCODE
```

Append to `.gitignore`:

```
/mcp/node_modules/
```

- [ ] **Step 2: Node package and bridge client unit test (failing)**

Run in `mcp/`: `npm init -y`, then `npm install @modelcontextprotocol/sdk zod`. Then set in `mcp/package.json`: `"type": "module"`, `"private": true`, and

```json
"scripts": {
  "test": "node --test test/unit",
  "test:app": "node --test --test-concurrency=1 test/app"
}
```

`mcp/test/unit/bridge-client.test.mjs`:

```js
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
```

Run: `npm test` in `mcp/`. Expected: FAIL, cannot find `../../src/bridge-client.mjs`.

- [ ] **Step 3: Bridge client**

`mcp/src/bridge-client.mjs`:

```js
import net from "node:net";

export class BridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
  }
}

/** Newline-delimited JSON client for the Mine-imator bridge socket. */
export class BridgeClient {
  #socket = null;
  #connecting = null;
  #buffer = "";
  #nextId = 1;
  #pending = new Map();

  constructor({ host = "127.0.0.1", port = 41234, timeoutMs = 30000 } = {}) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
  }

  #connect() {
    if (this.#socket) return Promise.resolve();
    this.#connecting ??= new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      socket.setEncoding("utf8");
      socket.once("connect", () => {
        this.#socket = socket;
        this.#connecting = null;
        resolve();
      });
      socket.on("error", (err) => {
        if (this.#socket !== socket) {
          this.#connecting = null;
          reject(err);
        }
      });
      socket.on("data", (chunk) => this.#onData(chunk));
      socket.on("close", () => {
        if (this.#socket === socket) this.#onClose();
      });
    });
    return this.#connecting;
  }

  #onData(chunk) {
    this.#buffer += chunk;
    let newline;
    while ((newline = this.#buffer.indexOf("\n")) >= 0) {
      const line = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      if (line.trim() === "") continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const entry = this.#pending.get(message.id);
      if (!entry) continue;
      this.#pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.ok) entry.resolve(message.result ?? {});
      else entry.reject(new BridgeError(message.error?.code ?? "unknown", message.error?.message ?? "Unknown bridge error"));
    }
  }

  #onClose() {
    this.#socket = null;
    this.#buffer = "";
    for (const entry of this.#pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new BridgeError("disconnected", "Mine-imator closed the connection"));
    }
    this.#pending.clear();
  }

  async call(cmd, args = {}, { timeoutMs = this.timeoutMs } = {}) {
    await this.#connect();
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new BridgeError("timeout", `Mine-imator did not answer ${cmd} within ${timeoutMs} ms`));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      this.#socket.write(JSON.stringify({ id, cmd, args }) + "\n");
    });
  }

  close() {
    this.#socket?.destroy();
  }
}
```

Run: `npm test`. Expected: 6 passing.

- [ ] **Step 4: Integration harness and transport test (failing)**

`mcp/test/app/harness.mjs`:

```js
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
  const deadline = Date.now() + 120000;
  for (;;) {
    try {
      const status = await client.call("get_status");
      if (status.window_state !== "load_assets") break;
    } catch (err) {
      if (err.code !== "ECONNREFUSED" && err.code !== "disconnected") throw err;
    }
    if (child.exitCode !== null) throw new Error(`Mine-imator exited with code ${child.exitCode}`);
    if (Date.now() > deadline) throw new Error("Mine-imator did not become ready");
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
```

`mcp/test/app/01-transport.test.mjs`:

```js
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
```

Run: `node --test test/app/01-transport.test.mjs` in `mcp/`. Expected: FAIL after 120 s with "did not become ready" (the stock build ignores `--bridge`). It is fine to interrupt once the connection refusals are visible.

- [ ] **Step 5: GML core script**

Run: `.\mcp\scripts\add-gml-script.ps1 bridge_core`, then write `GmProject/scripts/bridge_core/bridge_core.gml`:

```gml
/// bridge_dispatch(cmd, argsjson)
/// @arg cmd
/// @arg argsjson
/// @desc Runs one command from the automation bridge. Returns a response map
/// holding "ok" and either "result" or "error". The caller destroys the map.

function bridge_dispatch(cmd, argsjson)
{
	var args, res;
	args = json_decode(argsjson)
	if (args < 0)
		return bridge_error("bad_request", "args must be a JSON object")
	
	if (cmd = "get_status")
		res = bridge_cmd_get_status(args)
	else if (window_state != "" && window_state != "startup")
		res = bridge_error("busy", "Mine-imator is busy: " + window_state)
	else
		res = bridge_dispatch_command(cmd, args)
	
	ds_map_destroy(args)
	return res
}

/// bridge_dispatch_command(cmd, args)
/// @arg cmd
/// @arg args

function bridge_dispatch_command(cmd, args)
{
	// Only these work from the home screen
	if (window_state = "startup")
		return bridge_error("no_project", "No project is open. Call project_new or project_open first")
	
	return bridge_error("unknown_command", "Unknown command " + cmd)
}

/// bridge_ok(result)
/// @arg result
/// @desc Wraps a result map in a success response. The result map is owned by the response.

function bridge_ok(result)
{
	var res = ds_map_create();
	res[?"ok"] = true
	ds_map_add_map(res, "result", result)
	return res
}

/// bridge_error(code, message)
/// @arg code
/// @arg message

function bridge_error(code, message)
{
	var res, err;
	res = ds_map_create()
	err = ds_map_create()
	err[?"code"] = code
	err[?"message"] = message
	res[?"ok"] = false
	ds_map_add_map(res, "error", err)
	return res
}

/// bridge_arg(args, name, default)
/// @arg args
/// @arg name
/// @arg default

function bridge_arg(args, name, def)
{
	if (!ds_map_exists(args, name))
		return def
	
	return args[?name]
}

/// bridge_find_tl(saveid)
/// @arg saveid
/// @desc Returns the timeline with the given save ID, or null.

function bridge_find_tl(saveid)
{
	if (!is_string(saveid) || saveid = "")
		return null
	
	with (obj_timeline)
		if (save_id = saveid)
			return id
	
	return null
}

/// bridge_cmd_get_status(args)
/// @arg args

function bridge_cmd_get_status(args)
{
	var result = ds_map_create();
	result[?"version"] = mineimator_version
	result[?"protocol"] = 1
	result[?"window_state"] = window_state
	
	// Project variables are not set up until the assets are loaded
	if (window_state = "load_assets")
		return bridge_ok(result)
	
	result[?"project_name"] = project_name
	result[?"project_file"] = project_file
	result[?"project_changed"] = project_changed
	result[?"tempo"] = project_tempo
	result[?"frame"] = timeline_marker
	result[?"timeline_length"] = timeline_length
	result[?"playing"] = timeline_playing
	result[?"object_count"] = instance_number(obj_timeline)
	result[?"undo_steps"] = history_amount - history_pos
	result[?"redo_steps"] = history_pos
	
	return bridge_ok(result)
}
```

- [ ] **Step 6: C++ transport**

`CppProject/Bridge/Bridge.hpp`:

```cpp
#pragma once

#include "Common.hpp"

#include <QJsonObject>
#include <QJsonValue>
#include <QPointer>
#include <QQueue>
#include <QTcpServer>
#include <QTcpSocket>

namespace CppProject
{
	// Local command socket for external automation.
	// Protocol and command set: docs/superpowers/specs/2026-10-02-mcp-bridge-design.md
	struct Bridge : QObject
	{
		// Starts listening on 127.0.0.1, returns false if the port could not be opened.
		bool Start(quint16 port);

		// Runs queued requests through the GML dispatcher. Called once per step
		// for the main window, while its graphics state is active.
		void ProcessPending();

		static Bridge* instance;

	private:
		struct Request
		{
			QPointer<QTcpSocket> socket;
			QJsonValue id;
			QString cmd;
			QString argsJson;
		};

		void ReadSocket(QTcpSocket* socket);
		void HandleLine(QTcpSocket* socket, const QByteArray& line);
		void Reply(QTcpSocket* socket, const QJsonValue& id, QJsonObject body);
		void ReplyError(QTcpSocket* socket, const QJsonValue& id, const QString& code, const QString& message);

		QTcpServer server;
		QHash<QTcpSocket*, QByteArray> buffers;
		QQueue<Request> queue;

		// A command that finishes over several steps (e.g. an export)
		BoolType waiting = false;
		Request waitingRequest;
	};
}
```

`CppProject/Bridge/Bridge.cpp`:

```cpp
#include "Bridge.hpp"

#include "AppHandler.hpp"
#include "Asset/DataStructure.hpp"
#include "Generated/GmlFunc.hpp"
#include "Generated/Scripts.hpp"

#include <QJsonArray>
#include <QJsonDocument>

namespace CppProject
{
	Bridge* Bridge::instance = nullptr;

	static const int maxLineBytes = 1024 * 1024;
	static const double stepBudgetMs = 8.0;

	static QJsonObject EncodeMap(IntType id);

	// Converts a ds_map/ds_list value to JSON, following nested structures marked with a dsType.
	static QJsonValue EncodeValue(const VarType& value, IntType dsType)
	{
		if (dsType == ds_type_map)
			return EncodeMap(value.ToInt());

		if (dsType == ds_type_list)
		{
			QJsonArray arr;
			if (List* list = FindList(value.ToInt()))
				for (const List::ListValue& item : list->vec)
					arr.append(EncodeValue(item.value, item.dsType));
			return arr;
		}

		if (value.IsString())
			return value.Str().QStr();
		if (value.IsBool())
			return value.ToBool();
		if (value.IsInt())
			return (double)value.ToInt();
		if (value.IsReal())
			return value.ToReal();

		return QJsonValue(); // Undefined and containers
	}

	static QJsonObject EncodeMap(IntType id)
	{
		QJsonObject obj;
		Map* map = FindMap(id);
		if (!map)
			return obj;

		if (map->GetType() == Map::HASH_STRING)
		{
			const QHash<StringType, Map::MapValue>& hash = static_cast<StringHashMap*>(map)->hash;
			for (auto it = hash.constBegin(); it != hash.constEnd(); ++it)
				obj[it.key().QStr()] = EncodeValue(it.value().value, it.value().dsType);
		}
		else if (map->GetType() == Map::MAP)
		{
			for (auto it = map->map.constBegin(); it != map->map.constEnd(); ++it)
				obj[it.key().ToStr().QStr()] = EncodeValue(it.value().value, it.value().dsType);
		}

		return obj;
	}

	bool Bridge::Start(quint16 port)
	{
		connect(&server, &QTcpServer::newConnection, this, [this]()
		{
			while (QTcpSocket* socket = server.nextPendingConnection())
			{
				connect(socket, &QTcpSocket::readyRead, this, [this, socket]() { ReadSocket(socket); });
				connect(socket, &QTcpSocket::disconnected, this, [this, socket]()
				{
					buffers.remove(socket);
					socket->deleteLater();
				});
			}
		});

		if (!server.listen(QHostAddress::LocalHost, port))
		{
			WARNING("Bridge could not listen on port " + NumStr(port) + ": " + server.errorString());
			return false;
		}

		DEBUG("Bridge listening on 127.0.0.1:" + NumStr(port));
		return true;
	}

	void Bridge::ReadSocket(QTcpSocket* socket)
	{
		buffers[socket].append(socket->readAll());

		for (;;)
		{
			QByteArray& buffer = buffers[socket];
			int newline = buffer.indexOf('\n');
			if (newline < 0)
				break;

			QByteArray line = buffer.left(newline).trimmed();
			buffer.remove(0, newline + 1);
			if (!line.isEmpty())
				HandleLine(socket, line);
		}

		if (buffers[socket].size() > maxLineBytes)
		{
			ReplyError(socket, QJsonValue(), "bad_request", "Request line is too long");
			socket->disconnectFromHost();
		}
	}

	void Bridge::HandleLine(QTcpSocket* socket, const QByteArray& line)
	{
		QJsonParseError parseError;
		QJsonDocument doc = QJsonDocument::fromJson(line, &parseError);
		if (parseError.error || !doc.isObject())
		{
			ReplyError(socket, QJsonValue(), "bad_request", "Each line must be one JSON object");
			return;
		}

		QJsonObject obj = doc.object();
		QJsonValue id = obj.value("id");
		QString cmd = obj.value("cmd").toString();
		QJsonValue args = obj.value("args");
		if (cmd.isEmpty())
		{
			ReplyError(socket, id, "bad_request", "cmd must be a non-empty string");
			return;
		}
		if (!args.isUndefined() && !args.isObject())
		{
			ReplyError(socket, id, "bad_request", "args must be a JSON object");
			return;
		}

		// A modal dialog stalls the step loop, so nothing queued would run until it closes
		if (App->blocked)
		{
			ReplyError(socket, id, "busy_modal", "Mine-imator is showing a dialog. Close it in the app and try again");
			return;
		}

		queue.enqueue({ socket, id, cmd, QString(QJsonDocument(args.toObject()).toJson(QJsonDocument::Compact)) });
	}

	void Bridge::ProcessPending()
	{
		if (!global::_app)
			return;

		ScopeAny scope(global::_app->id);

		try
		{
			if (waiting)
			{
				IntType mapId = VarType(bridge_pending_poll(scope)).ToInt();
				if (mapId < 0)
					return;

				Reply(waitingRequest.socket, waitingRequest.id, EncodeMap(mapId));
				ds_map_destroy(mapId);
				waiting = false;
			}

			Timer budget;
			while (!queue.isEmpty() && !waiting && budget.ElapsedMs() < stepBudgetMs)
			{
				Request request = queue.dequeue();
				if (!request.socket)
					continue;

				try
				{
					IntType mapId = VarType(bridge_dispatch(scope, StringType(request.cmd), StringType(request.argsJson))).ToInt();
					QJsonObject body = EncodeMap(mapId);
					ds_map_destroy(mapId);

					if (body.value("pending").toBool())
					{
						waiting = true;
						waitingRequest = request;
					}
					else
						Reply(request.socket, request.id, body);
				}
				catch (const QString& ex)
				{
					DEBUG("Bridge command " + request.cmd + " failed: " + ex);
					ReplyError(request.socket, request.id, "internal_error", ex);
				}
			}
		}
		catch (const QString& ex)
		{
			DEBUG("Bridge poll failed: " + ex);
			ReplyError(waitingRequest.socket, waitingRequest.id, "internal_error", ex);
			waiting = false;
		}
	}

	void Bridge::Reply(QTcpSocket* socket, const QJsonValue& id, QJsonObject body)
	{
		if (!socket || socket->state() != QAbstractSocket::ConnectedState)
			return;

		body.remove("pending");
		body["id"] = id;
		socket->write(QJsonDocument(body).toJson(QJsonDocument::Compact) + "\n");
	}

	void Bridge::ReplyError(QTcpSocket* socket, const QJsonValue& id, const QString& code, const QString& message)
	{
		QJsonObject error { { "code", code }, { "message", message } };
		Reply(socket, id, QJsonObject { { "ok", false }, { "error", error } });
	}
}
```

`bridge_pending_poll` does not exist until Task 6. For this task add a stub at the end of `bridge_core.gml` so the C++ compiles; Task 6 moves it to `bridge_view.gml` with its real body:

```gml
/// bridge_pending_poll()
/// @desc Returns the response map of a command that finishes over several steps, or -1 while it is still running.

function bridge_pending_poll()
{
	if (window_state = "export_image")
		return -1
	
	return bridge_error("internal_error", "No command is pending")
}
```

- [ ] **Step 7: Hook into `AppHandler.cpp`**

Add `#include "Bridge/Bridge.hpp"` after `#include "AppWindow.hpp"`.

In the constructor, replace the temporary-folder block

```cpp
			// Create temporary folder
		#if OS_WINDOWS
			gmlGlobal::game_save_id = QStandardPaths::standardLocations(QStandardPaths::AppDataLocation)[0] + "/";
		#else
			gmlGlobal::game_save_id = QDir::tempPath() + "/" + StringType(PROJECT_NAME) + "_tmp/";
		#endif
			if (QDir(gmlGlobal::game_save_id).exists())
				DEBUG("Found temporary folder " + gmlGlobal::game_save_id);
			else if (QDir().mkdir(gmlGlobal::game_save_id))
```

with

```cpp
			// Automation bridge, only when asked for
			const QString bridgePort = qEnvironmentVariable("MINEIMATOR_BRIDGE_PORT");
			const bool bridgeEnabled = (qApp->arguments().contains("--bridge") || !bridgePort.isEmpty());

			// Create temporary folder
		#if OS_WINDOWS
			gmlGlobal::game_save_id = QStandardPaths::standardLocations(QStandardPaths::AppDataLocation)[0] + "/";
		#else
			gmlGlobal::game_save_id = QDir::tempPath() + "/" + StringType(PROJECT_NAME) + "_tmp/";
		#endif
			if (bridgeEnabled) // Own folder, so it can run next to a normal instance
				gmlGlobal::game_save_id = gmlGlobal::game_save_id + "Bridge/";
			if (QDir(gmlGlobal::game_save_id).exists())
				DEBUG("Found temporary folder " + gmlGlobal::game_save_id);
			else if (QDir().mkpath(gmlGlobal::game_save_id))
```

Directly after the `DEBUG("Minecraft saves: " ...)` line add:

```cpp
			if (bridgeEnabled)
			{
				Bridge::instance = new Bridge;
				Bridge::instance->Start(bridgePort.toUShort() > 0 ? bridgePort.toUShort() : 41234);
			}
```

In `timerEvent`, between the `if (!global::_app) { ... }` block and `app_event_step(global::_app->id);` add:

```cpp
					// Run queued automation commands before the step
					if (win == mainWindow && Bridge::instance)
						Bridge::instance->ProcessPending();
```

- [ ] **Step 8: Build**

Run: `.\mcp\scripts\build.ps1`. Expected: exit code 0, "Running CppGen" in the output.

Then check `CppProject/Generated/Scripts.hpp` contains `bridge_dispatch(ScopeAny self, ` and `bridge_pending_poll(ScopeAny self`. If CppGen generated either without a `self` parameter or with different parameter types, adapt the two call sites in `Bridge.cpp` to the generated signature (keep the `VarType(...).ToInt()` wrapping) and rebuild.

- [ ] **Step 9: Run the transport test**

Run in `mcp/`: `node --test test/app/01-transport.test.mjs`. Expected: 7 passing. Also confirm `install/Mine-imator/Data/log.txt` contains `Bridge listening on 127.0.0.1:41235` and that `%APPDATA%\Mine-imator\Bridge\` exists.

Then start `install\Mine-imator\Mine-imator.exe` with no arguments and no `MINEIMATOR_BRIDGE_PORT`, and confirm its log has no "Bridge listening" line. Close it.

- [ ] **Step 10: Commit**

```bash
git add .gitignore mcp CppProject/Bridge CppProject/AppHandler.cpp GmProject/scripts/bridge_core GmProject/Mine-imator.yyp docs
git commit -m "Add opt-in automation bridge socket with get_status"
```

---

### Task 2: Project commands

**Files:**
- Create: `GmProject/scripts/bridge_project/bridge_project.gml` (+ `.yy`, yyp entry)
- Modify: `GmProject/scripts/bridge_core/bridge_core.gml` (`bridge_dispatch_command`)
- Test: `mcp/test/app/02-project.test.mjs`

**Interfaces:**
- Consumes: `bridge_ok`, `bridge_error`, `bridge_arg`, `bridge_cmd_get_status`, harness `startApp`, `tmpDir`.
- Produces: commands `project_new {name, folder?, discard?}`, `project_open {path, discard?}`, `project_save {}`; each returns the `get_status` result.

- [ ] **Step 1: Write the failing test**

`mcp/test/app/02-project.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, before, test } from "node:test";
import { startApp, tmpDir } from "./harness.mjs";

let app;
const folder = tmpDir();
const file = `${folder}/My test.miproject`;
before(async () => { app = await startApp(); });
after(() => app?.stop());

test("project_new requires a name", async () => {
  await assert.rejects(app.client.call("project_new", {}), (err) => err.code === "bad_args");
});

test("project_new creates the project file and leaves the home screen", async () => {
  const status = await app.client.call("project_new", { name: "My test", folder });
  assert.equal(status.project_name, "My test");
  assert.equal(status.project_file, file);
  assert.equal(status.window_state, "");
  assert.equal(status.project_changed, false);
  assert.ok(existsSync(file));
});

test("project_new refuses to overwrite an existing project", async () => {
  await assert.rejects(app.client.call("project_new", { name: "My test", folder }), (err) => err.code === "already_exists");
});

test("unknown commands report unknown_command once a project is open", async () => {
  await assert.rejects(app.client.call("definitely_not_a_command"), (err) => err.code === "unknown_command");
});

test("project_save succeeds and project_open reopens the file", async () => {
  assert.equal((await app.client.call("project_save")).project_changed, false);
  const status = await app.client.call("project_open", { path: file });
  assert.equal(status.project_name, "My test");
  assert.equal(status.window_state, "");
});

test("project_open reports not_found for a missing file and bad_args for other file types", async () => {
  await assert.rejects(app.client.call("project_open", { path: `${folder}/missing.miproject` }), (err) => err.code === "not_found");
  await assert.rejects(app.client.call("project_open", { path: `${folder}/thumbnail.png` }), (err) => err.code === "bad_args" || err.code === "not_found");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/app/02-project.test.mjs`. Expected: FAIL, `project_new` rejects with `no_project`.

- [ ] **Step 3: Implement**

Run: `.\mcp\scripts\add-gml-script.ps1 bridge_project`, then write `GmProject/scripts/bridge_project/bridge_project.gml`:

```gml
/// bridge_cmd_project_new(args)
/// @arg args
/// @desc Creates and opens a new project without the new project dialog.

function bridge_cmd_project_new(args)
{
	var name, dirname, fn;
	name = bridge_arg(args, "name", "")
	if (!is_string(name) || name = "")
		return bridge_error("bad_args", "name must be a non-empty string")
	
	if (project_changed && !bridge_arg(args, "discard", false))
		return bridge_error("unsaved_changes", "The open project has unsaved changes. Save it first or pass discard: true")
	
	dirname = bridge_arg(args, "folder", setting_project_folder + filename_get_valid(name))
	fn = dirname + "/" + filename_get_valid(name) + ".miproject"
	if (file_exists_lib(fn))
		return bridge_error("already_exists", "A project already exists at " + fn)
	
	directory_create_lib(setting_project_folder)
	directory_create_lib(dirname)
	if (!directory_exists_lib(dirname))
		return bridge_error("io_error", "Could not create the folder " + dirname)
	
	if (popup != null)
		popup_close()
	window_state = "" // Before saving, project_save resets the project on the home screen
	
	project_reset()
	action_load_render_settings(render_default_file)
	project_name = name
	project_folder = dirname
	project_file = fn
	project_save()
	
	return bridge_cmd_get_status(args)
}

/// bridge_cmd_project_open(args)
/// @arg args

function bridge_cmd_project_open(args)
{
	var fn, prevstate;
	fn = bridge_arg(args, "path", "")
	if (!is_string(fn) || fn = "" || !file_exists_lib(fn))
		return bridge_error("not_found", "No project file at " + string(fn))
	
	// Archives and legacy formats can ask questions in dialogs
	if (filename_ext(fn) != ".miproject")
		return bridge_error("bad_args", "path must be a .miproject file")
	
	if (project_changed && !bridge_arg(args, "discard", false))
		return bridge_error("unsaved_changes", "The open project has unsaved changes. Save it first or pass discard: true")
	
	if (popup != null)
		popup_close()
	prevstate = window_state
	window_state = ""
	
	if (!project_load(fn))
	{
		window_state = prevstate
		return bridge_error("load_failed", "Mine-imator could not load " + fn)
	}
	
	return bridge_cmd_get_status(args)
}

/// bridge_cmd_project_save(args)
/// @arg args

function bridge_cmd_project_save(args)
{
	if (project_file = "")
		return bridge_error("no_project", "The project has no file yet. Call project_new first")
	
	project_save()
	
	return bridge_cmd_get_status(args)
}
```

In `bridge_core.gml`, replace the body of `bridge_dispatch_command` with:

```gml
	if (cmd = "project_new")
		return bridge_cmd_project_new(args)
	if (cmd = "project_open")
		return bridge_cmd_project_open(args)
	
	// Only the commands above work from the home screen
	if (window_state = "startup")
		return bridge_error("no_project", "No project is open. Call project_new or project_open first")
	
	switch (cmd)
	{
		case "project_save": return bridge_cmd_project_save(args)
	}
	
	return bridge_error("unknown_command", "Unknown command " + cmd)
```

- [ ] **Step 4: Build and run the tests**

Run: `.\mcp\scripts\build.ps1`, then in `mcp/`: `node --test test/app/01-transport.test.mjs test/app/02-project.test.mjs`. Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add GmProject mcp/test
git commit -m "Bridge: project_new, project_open, project_save"
```

---

### Task 3: Read commands

**Files:**
- Create: `GmProject/scripts/bridge_scene/bridge_scene.gml` (+ `.yy`, yyp entry)
- Modify: `GmProject/scripts/bridge_core/bridge_core.gml` (`bridge_dispatch_command` switch)
- Test: `mcp/test/app/03-scene.test.mjs`

**Interfaces:**
- Consumes: `bridge_ok`, `bridge_error`, `bridge_arg`, `bridge_find_tl`.
- Produces: `bridge_tl_summary(tl)` → map `{id, name, type, parent, part_of, part, selected, hidden, frames: [int]}` (`parent` / `part_of` are save IDs or `""`); `bridge_values_map(tl, arr)` → map of lower-case value name → value; `bridge_value_out(vid, val)`. Commands `get_scene {}` → `{frame, objects: [summary]}`; `get_object {id}` → summary plus `values` and `keyframes: [{frame, values}]`.

- [ ] **Step 1: Write the failing test**

`mcp/test/app/03-scene.test.mjs`:

```js
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { newProject, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); await newProject(app.client); });
after(() => app?.stop());

test("get_scene lists objects of a new project as an array", async () => {
  const scene = await app.client.call("get_scene");
  assert.ok(Array.isArray(scene.objects));
  assert.equal(scene.frame, 0);
  assert.equal(scene.objects.length, (await app.client.call("get_status")).object_count);
});

test("get_object reports not_found for an unknown or missing id", async () => {
  await assert.rejects(app.client.call("get_object", { id: "no-such-id" }), (err) => err.code === "not_found");
  await assert.rejects(app.client.call("get_object", {}), (err) => err.code === "not_found");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/app/03-scene.test.mjs`. Expected: FAIL with `unknown_command`.

- [ ] **Step 3: Implement**

Run: `.\mcp\scripts\add-gml-script.ps1 bridge_scene`, then write `GmProject/scripts/bridge_scene/bridge_scene.gml`:

```gml
/// bridge_tl_summary(tl)
/// @arg tl
/// @desc Returns a map describing a timeline, without its values.

function bridge_tl_summary(tl)
{
	var m, frames;
	m = ds_map_create()
	m[?"id"] = tl.save_id
	m[?"name"] = tl.display_name
	m[?"type"] = tl_type_name_list[|tl.type]
	m[?"parent"] = ""
	if (tl.parent != null && tl.parent != app)
		m[?"parent"] = tl.parent.save_id
	m[?"part_of"] = ""
	if (tl.part_of != null)
		m[?"part_of"] = tl.part_of.save_id
	m[?"part"] = tl.model_part_name
	m[?"selected"] = tl.selected
	m[?"hidden"] = tl.hide
	
	frames = ds_list_create()
	for (var k = 0; k < ds_list_size(tl.keyframe_list); k++)
		ds_list_add(frames, tl.keyframe_list[|k].position)
	ds_map_add_list(m, "frames", frames)
	
	return m
}

/// bridge_value_out(valueid, value)
/// @arg valueid
/// @arg value

function bridge_value_out(vid, val)
{
	if (tl_value_is_color(vid))
		return "#" + color_to_hex(val)
	
	return tl_value_get_save_id(vid, val)
}

/// bridge_values_map(tl, array)
/// @arg tl
/// @arg array
/// @desc Position, rotation and scale are always included, other values only when they differ from the default.

function bridge_values_map(tl, arr)
{
	var m = ds_map_create();
	for (var v = 0; v < ds_list_size(value_name_list); v++)
	{
		if (v > e_value.SCA_Z && arr[@ v] = tl.value_default[v])
			continue
		
		m[?string_lower(value_name_list[|v])] = bridge_value_out(v, arr[@ v])
	}
	
	return m
}

/// bridge_cmd_get_scene(args)
/// @arg args

function bridge_cmd_get_scene(args)
{
	var result, objects;
	result = ds_map_create()
	objects = ds_list_create()
	
	with (obj_timeline)
	{
		ds_list_add(objects, bridge_tl_summary(id))
		ds_list_mark_as_map(objects, ds_list_size(objects) - 1)
	}
	
	result[?"frame"] = timeline_marker
	ds_map_add_list(result, "objects", objects)
	
	return bridge_ok(result)
}

/// bridge_cmd_get_object(args)
/// @arg args

function bridge_cmd_get_object(args)
{
	var tl, result, keyframes;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))
	
	result = bridge_tl_summary(tl)
	ds_map_add_map(result, "values", bridge_values_map(tl, tl.value))
	
	keyframes = ds_list_create()
	for (var k = 0; k < ds_list_size(tl.keyframe_list); k++)
	{
		var kf, m;
		kf = tl.keyframe_list[|k]
		m = ds_map_create()
		m[?"frame"] = kf.position
		ds_map_add_map(m, "values", bridge_values_map(tl, kf.value))
		ds_list_add(keyframes, m)
		ds_list_mark_as_map(keyframes, k)
	}
	ds_map_add_list(result, "keyframes", keyframes)
	
	return bridge_ok(result)
}
```

In `bridge_dispatch_command`'s switch add:

```gml
		case "get_scene": return bridge_cmd_get_scene(args)
		case "get_object": return bridge_cmd_get_object(args)
```

- [ ] **Step 4: Build and run the tests**

Run: `.\mcp\scripts\build.ps1`, then `node --test test/app/03-scene.test.mjs`. Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add GmProject mcp/test
git commit -m "Bridge: get_scene and get_object"
```

---

### Task 4: Object commands, undo and redo

**Files:**
- Create: `GmProject/scripts/bridge_objects/bridge_objects.gml` (+ `.yy`, yyp entry)
- Modify: `GmProject/scripts/bridge_core/bridge_core.gml` (switch)
- Test: `mcp/test/app/04-objects.test.mjs`

**Interfaces:**
- Consumes: `bridge_tl_summary`, `bridge_find_tl`, helpers from Task 1.
- Produces: commands `create_object {type, name?, model?, skin?}` → summary; `remove_object {id}` → `{}`; `rename_object {id, name}` → summary; `set_parent {id, parent}` (`parent: ""` for root) → summary; `select {ids: [id]}` → `{selected: n}`; `undo {}` / `redo {}` → `{done: bool}`. Supported `type`: `char` (alias `character`), `item`, `block`, `text`, `cube`, `cone`, `cylinder`, `sphere`, `surface`, `camera`, `spotlight`, `pointlight`, `folder`.

- [ ] **Step 1: Write the failing test**

`mcp/test/app/04-objects.test.mjs`:

```js
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { newProject, startApp, tmpDir } from "./harness.mjs";

let app, call;
before(async () => {
  app = await startApp();
  await newProject(app.client);
  call = (cmd, args) => app.client.call(cmd, args);
});
after(() => app?.stop());

const ids = async () => (await call("get_scene")).objects.map((o) => o.id);

test("create_object makes a cube that shows up in the scene", async () => {
  const cube = await call("create_object", { type: "cube", name: "Box" });
  assert.equal(cube.type, "cube");
  assert.equal(cube.name, "Box");
  assert.equal(cube.parent, "");
  assert.ok((await ids()).includes(cube.id));
});

test("create_object makes a character with body parts", async () => {
  const char = await call("create_object", { type: "character" });
  assert.equal(char.type, "char");
  const parts = (await call("get_scene")).objects.filter((o) => o.part_of === char.id);
  assert.ok(parts.length >= 6, `expected body parts, got ${parts.length}`);
  assert.ok(parts.every((p) => p.type === "bodypart"));
});

test("create_object makes cameras, lights and folders", async () => {
  for (const type of ["camera", "pointlight", "spotlight", "folder"])
    assert.equal((await call("create_object", { type })).type, type);
});

test("create_object rejects unsupported types and unknown models without changing the scene", async () => {
  const before = await ids();
  await assert.rejects(call("create_object", { type: "scenery" }), (err) => err.code === "bad_args");
  await assert.rejects(call("create_object", { type: "nonsense" }), (err) => err.code === "bad_args");
  await assert.rejects(call("create_object", { type: "char", model: "no_such_model" }), (err) => err.code === "not_found");
  await assert.rejects(call("create_object", { type: "char", skin: "C:/no/such/skin.png" }), (err) => err.code === "not_found");
  assert.deepEqual(await ids(), before);
});

test("rename_object and set_parent change the object", async () => {
  const folder = await call("create_object", { type: "folder", name: "Group" });
  const cube = await call("create_object", { type: "cube" });
  assert.equal((await call("rename_object", { id: cube.id, name: "Renamed" })).name, "Renamed");
  assert.equal((await call("set_parent", { id: cube.id, parent: folder.id })).parent, folder.id);
  await assert.rejects(call("set_parent", { id: folder.id, parent: cube.id }), (err) => err.code === "bad_args");
  assert.equal((await call("set_parent", { id: cube.id, parent: "" })).parent, "");
  await assert.rejects(call("set_parent", { id: cube.id, parent: "no-such-id" }), (err) => err.code === "not_found");
});

test("select marks exactly the given objects", async () => {
  const a = await call("create_object", { type: "cube" });
  const b = await call("create_object", { type: "sphere" });
  assert.deepEqual(await call("select", { ids: [a.id, b.id] }), { selected: 2 });
  const selected = (await call("get_scene")).objects.filter((o) => o.selected).map((o) => o.id).sort();
  assert.deepEqual(selected, [a.id, b.id].sort());
  await assert.rejects(call("select", { ids: [a.id, "no-such-id"] }), (err) => err.code === "not_found");
});

test("remove_object removes it, a stale id is not_found, undo brings it back", async () => {
  const cube = await call("create_object", { type: "cube" });
  assert.deepEqual(await call("remove_object", { id: cube.id }), {});
  assert.ok(!(await ids()).includes(cube.id));
  const afterRemove = await ids();
  await assert.rejects(call("remove_object", { id: cube.id }), (err) => err.code === "not_found");
  await assert.rejects(call("rename_object", { id: cube.id, name: "x" }), (err) => err.code === "not_found");
  assert.deepEqual(await ids(), afterRemove);
  assert.deepEqual(await call("undo"), { done: true });
  assert.ok((await ids()).includes(cube.id));
  assert.deepEqual(await call("redo"), { done: true });
  assert.ok(!(await ids()).includes(cube.id));
});

test("body parts cannot be removed on their own", async () => {
  const char = await call("create_object", { type: "char" });
  const part = (await call("get_scene")).objects.find((o) => o.part_of === char.id);
  await assert.rejects(call("remove_object", { id: part.id }), (err) => err.code === "bad_args");
});

test("project_new and project_open refuse to drop unsaved changes", async () => {
  assert.equal((await call("get_status")).project_changed, true);
  await assert.rejects(call("project_new", { name: "other", folder: tmpDir() }), (err) => err.code === "unsaved_changes");
  const file = (await call("get_status")).project_file;
  await assert.rejects(call("project_open", { path: file }), (err) => err.code === "unsaved_changes");
  assert.equal((await call("project_new", { name: "other", folder: tmpDir(), discard: true })).project_name, "other");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/app/04-objects.test.mjs`. Expected: FAIL with `unknown_command`.

- [ ] **Step 3: Implement**

Run: `.\mcp\scripts\add-gml-script.ps1 bridge_objects`, then write `GmProject/scripts/bridge_objects/bridge_objects.gml`:

```gml
/// bridge_bench_set_skin(filename)
/// @arg filename
/// @desc Sets the workbench character skin from an image file, reusing an already loaded skin of the same name.

function bridge_bench_set_skin(fn)
{
	var res = null;
	with (obj_resource)
		if (type = e_res_type.SKIN && filename = filename_name(fn))
			res = id
	
	// new_res asks a question when the name is already taken, so only call it for new names
	if (res = null)
	{
		res = new_res(fn, e_res_type.SKIN)
		if (bench_settings.model_file != null)
			res.player_skin = bench_settings.model_file.player_skin
		
		with (res)
			res_load()
	}
	
	with (bench_settings)
	{
		model_tex = res
		temp_update_model_shape()
	}
}

/// bridge_cmd_create_object(args)
/// @arg args

function bridge_cmd_create_object(args)
{
	var typename, tltype, model, skin, name, prevtype, prevani, placenew, obj, tl;
	typename = bridge_arg(args, "type", "")
	if (!is_string(typename))
		return bridge_error("bad_args", "type must be a string")
	if (typename = "character")
		typename = "char"
	
	tltype = ds_list_find_index(tl_type_name_list, typename)
	if (tltype != e_tl_type.CHARACTER && tltype != e_tl_type.ITEM && tltype != e_tl_type.BLOCK && tltype != e_tl_type.TEXT &&
		tltype != e_tl_type.CUBE && tltype != e_tl_type.CONE && tltype != e_tl_type.CYLINDER && tltype != e_tl_type.SPHERE && tltype != e_tl_type.SURFACE &&
		tltype != e_tl_type.CAMERA && tltype != e_tl_type.SPOT_LIGHT && tltype != e_tl_type.POINT_LIGHT && tltype != e_tl_type.FOLDER)
		return bridge_error("bad_args", "Unsupported type. Use char, item, block, text, cube, cone, cylinder, sphere, surface, camera, spotlight, pointlight or folder")
	
	model = bridge_arg(args, "model", "")
	skin = bridge_arg(args, "skin", "")
	name = bridge_arg(args, "name", "")
	if (!is_string(model) || !is_string(skin) || !is_string(name))
		return bridge_error("bad_args", "model, skin and name must be strings")
	if (model != "" && (tltype != e_tl_type.CHARACTER || ds_list_find_index(bench_settings.char_list.list, model) < 0))
		return bridge_error("not_found", "Unknown character model " + model)
	if (skin != "" && (tltype != e_tl_type.CHARACTER || !file_exists_lib(skin)))
		return bridge_error("not_found", "No skin image at " + skin)
	
	// Set up the workbench as the UI would
	prevtype = bench_settings.type
	if (type_is_timeline(tltype))
		bench_settings.type = tltype
	else
	{
		// bench_click creates the object on a repeated click, a running animation makes it only configure
		prevani = bench_show_ani_type
		bench_show_ani_type = "bridge"
		if (type_is_shape(tltype))
		{
			bench_settings.shape_type = tltype - e_tl_type.CUBE
			bench_click(e_tl_type.SHAPE)
		}
		else
			bench_click(tltype)
		bench_show_ani_type = prevani
		
		if (model != "")
			action_bench_model_name(model)
		if (skin != "")
			bridge_bench_set_skin(skin)
	}
	
	// Create without the interactive mouse placement
	placenew = setting_place_new
	setting_place_new = false
	action_bench_create()
	setting_place_new = placenew
	if (type_is_timeline(tltype))
		bench_settings.type = prevtype
	
	// The history entry holds the new timeline, or the new template it belongs to
	obj = save_id_find(history[0].spawn_save_id[0])
	tl = null
	if (obj != null && obj.object_index = obj_timeline)
		tl = obj
	else
	{
		with (obj_timeline)
			if (temp = obj && part_of = null)
				tl = id
	}
	if (tl = null)
		return bridge_error("internal_error", "The object was not created")
	
	with (tl)
		tl_select_single()
	app_update_tl_edit()
	if (name != "")
		action_tl_name(name)
	
	return bridge_ok(bridge_tl_summary(tl))
}

/// bridge_cmd_remove_object(args)
/// @arg args

function bridge_cmd_remove_object(args)
{
	var tl = bridge_find_tl(bridge_arg(args, "id", ""));
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))
	if (tl.part_of != null)
		return bridge_error("bad_args", "Body parts cannot be removed on their own, remove the object they belong to")
	
	with (tl)
		tl_select_single()
	list_item_value = null // No right-clicked list item
	action_tl_remove()
	
	return bridge_ok(ds_map_create())
}

/// bridge_cmd_rename_object(args)
/// @arg args

function bridge_cmd_rename_object(args)
{
	var tl, name;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))
	
	name = bridge_arg(args, "name", null)
	if (!is_string(name))
		return bridge_error("bad_args", "name must be a string")
	
	with (tl)
		tl_select_single()
	app_update_tl_edit()
	action_tl_name(name)
	
	return bridge_ok(bridge_tl_summary(tl))
}

/// bridge_cmd_set_parent(args)
/// @arg args

function bridge_cmd_set_parent(args)
{
	var tl, parentid, par;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))
	if (tl.part_of != null)
		return bridge_error("bad_args", "Body parts cannot be moved to another parent")
	
	parentid = bridge_arg(args, "parent", "")
	par = app
	if (parentid != "")
	{
		par = bridge_find_tl(parentid)
		if (par = null)
			return bridge_error("not_found", "No object with id " + string(parentid))
	}
	
	with (tl)
		tl_select_single()
	app_update_tl_edit()
	action_tl_parent(par, ds_list_size(par.tree_list))
	
	// The action skips moves that would put an object inside itself
	if (tl.parent != par)
		return bridge_error("bad_args", "An object cannot be parented to itself or to one of its children")
	
	return bridge_ok(bridge_tl_summary(tl))
}

/// bridge_cmd_select(args)
/// @arg args

function bridge_cmd_select(args)
{
	var ids, tls, result;
	if (!ds_map_exists(args, "ids") || !is_real(args[?"ids"]) || !ds_exists(args[?"ids"], ds_type_list))
		return bridge_error("bad_args", "ids must be a list of object ids")
	
	// Check everything before changing the selection
	ids = args[?"ids"]
	tls = array()
	for (var i = 0; i < ds_list_size(ids); i++)
	{
		tls[i] = bridge_find_tl(ids[|i])
		if (tls[i] = null)
			return bridge_error("not_found", "No object with id " + string(ids[|i]))
	}
	
	tl_deselect_all()
	for (var i = 0; i < array_length(tls); i++)
		with (tls[i])
			tl_select()
	app_update_tl_edit()
	
	result = ds_map_create()
	result[?"selected"] = array_length(tls)
	return bridge_ok(result)
}

/// bridge_cmd_undo(args)
/// @arg args

function bridge_cmd_undo(args)
{
	var result = ds_map_create();
	result[?"done"] = (history_pos < history_amount)
	action_toolbar_undo()
	
	return bridge_ok(result)
}

/// bridge_cmd_redo(args)
/// @arg args

function bridge_cmd_redo(args)
{
	var result = ds_map_create();
	result[?"done"] = (history_pos > 0)
	action_toolbar_redo()
	
	return bridge_ok(result)
}
```

In `bridge_dispatch_command`'s switch add:

```gml
		case "create_object": return bridge_cmd_create_object(args)
		case "remove_object": return bridge_cmd_remove_object(args)
		case "rename_object": return bridge_cmd_rename_object(args)
		case "set_parent": return bridge_cmd_set_parent(args)
		case "select": return bridge_cmd_select(args)
		case "undo": return bridge_cmd_undo(args)
		case "redo": return bridge_cmd_redo(args)
```

- [ ] **Step 4: Build and run the tests**

Run: `.\mcp\scripts\build.ps1`, then `node --test test/app/04-objects.test.mjs`. Expected: 9 passing. While it runs, watch the app window: no object should be stuck to the mouse cursor (interactive placement must stay off) and no dialog should appear.

- [ ] **Step 5: Commit**

```bash
git add GmProject mcp/test
git commit -m "Bridge: create, remove, rename, parent, select, undo, redo"
```

---

### Task 5: Keyframe commands

**Files:**
- Create: `GmProject/scripts/bridge_keyframes/bridge_keyframes.gml` (+ `.yy`, yyp entry)
- Modify: `GmProject/scripts/bridge_core/bridge_core.gml` (switch)
- Test: `mcp/test/app/05-keyframes.test.mjs`

**Interfaces:**
- Consumes: `bridge_find_tl`, helpers from Task 1, `get_object` from Task 3, `create_object` / `undo` from Task 4.
- Produces: commands `set_frame {frame}` → `{frame}`; `set_values {id, frame?, values: {name: value}}` → `{id, frame, values_set}` (creates or edits the keyframe at `frame`, default the current frame; one undo step); `remove_keyframes {id, frames: [int]}` → `{removed}`; `move_keyframes {id, from, to}` → `{frame}`. Easing is set through `set_values` with the value `transition`.

- [ ] **Step 1: Write the failing test**

`mcp/test/app/05-keyframes.test.mjs`:

```js
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { newProject, startApp } from "./harness.mjs";

let app, call, cube;
before(async () => {
  app = await startApp();
  await newProject(app.client);
  call = (cmd, args) => app.client.call(cmd, args);
  cube = await call("create_object", { type: "cube" });
});
after(() => app?.stop());

const object = () => call("get_object", { id: cube.id });
const keyframe = async (frame) => (await object()).keyframes.find((k) => k.frame === frame);

test("set_values creates keyframes with the given values", async () => {
  assert.deepEqual(await call("set_values", { id: cube.id, frame: 0, values: { pos_x: 16 } }), { id: cube.id, frame: 0, values_set: 1 });
  await call("set_values", { id: cube.id, frame: 24, values: { pos_x: 64, rot_z: 90, transition: "easeinoutquad" } });
  const obj = await object();
  assert.deepEqual(obj.frames, [0, 24]);
  assert.equal(obj.keyframes[0].values.pos_x, 16);
  assert.equal(obj.keyframes[1].values.pos_x, 64);
  assert.equal(obj.keyframes[1].values.rot_z, 90);
  assert.equal(obj.keyframes[1].values.transition, "easeinoutquad");
});

test("set_values on an existing keyframe edits it instead of adding one", async () => {
  await call("set_values", { id: cube.id, frame: 24, values: { pos_y: 8 } });
  const obj = await object();
  assert.deepEqual(obj.frames, [0, 24]);
  assert.equal(obj.keyframes[1].values.pos_x, 64);
  assert.equal(obj.keyframes[1].values.pos_y, 8);
});

test("set_frame moves the marker and values interpolate between keyframes", async () => {
  assert.deepEqual(await call("set_frame", { frame: 12 }), { frame: 12 });
  await new Promise((r) => setTimeout(r, 200)); // one app step to update values
  const x = (await object()).values.pos_x;
  assert.ok(x > 16 && x < 64, `pos_x ${x} should be between the keyframes`);
  await assert.rejects(call("set_frame", { frame: -1 }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_frame", {}), (err) => err.code === "bad_args");
});

test("set_values applies nothing when any name or type is wrong", async () => {
  const before = await object();
  const bad = [
    { pos_x: 1, no_such_value: 2 },
    { pos_x: "sixteen" },
    { pos_x: 1, transition: "not-an-easing" },
    { rgb_mul: 5 },
    {},
  ];
  for (const values of bad)
    await assert.rejects(call("set_values", { id: cube.id, frame: 40, values }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_values", { id: "no-such-id", frame: 0, values: { pos_x: 1 } }), (err) => err.code === "not_found");
  const after = await object();
  assert.deepEqual(after.frames, before.frames);
  assert.deepEqual(after.keyframes, before.keyframes);
});

test("colours round-trip as #RRGGBB", async () => {
  await call("set_values", { id: cube.id, frame: 0, values: { rgb_mul: "#FF8000" } });
  assert.equal((await keyframe(0)).values.rgb_mul, "#FF8000");
});

test("move_keyframes moves one keyframe and refuses an occupied or missing frame", async () => {
  assert.deepEqual(await call("move_keyframes", { id: cube.id, from: 24, to: 30 }), { frame: 30 });
  assert.deepEqual((await object()).frames, [0, 30]);
  assert.equal((await keyframe(30)).values.pos_x, 64);
  await assert.rejects(call("move_keyframes", { id: cube.id, from: 30, to: 0 }), (err) => err.code === "bad_args");
  await assert.rejects(call("move_keyframes", { id: cube.id, from: 99, to: 5 }), (err) => err.code === "not_found");
  assert.deepEqual((await object()).frames, [0, 30]);
});

test("remove_keyframes removes them and undo restores them", async () => {
  await assert.rejects(call("remove_keyframes", { id: cube.id, frames: [30, 99] }), (err) => err.code === "not_found");
  assert.deepEqual((await object()).frames, [0, 30]);
  assert.deepEqual(await call("remove_keyframes", { id: cube.id, frames: [30] }), { removed: 1 });
  assert.deepEqual((await object()).frames, [0]);
  await call("undo");
  assert.deepEqual((await object()).frames, [0, 30]);
});

test("one set_values call is one undo step", async () => {
  await call("set_values", { id: cube.id, frame: 50, values: { pos_x: 1, pos_y: 2, pos_z: 3 } });
  assert.deepEqual((await object()).frames, [0, 30, 50]);
  await call("undo");
  assert.deepEqual((await object()).frames, [0, 30]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/app/05-keyframes.test.mjs`. Expected: FAIL with `unknown_command`.

- [ ] **Step 3: Implement**

Run: `.\mcp\scripts\add-gml-script.ps1 bridge_keyframes`, then write `GmProject/scripts/bridge_keyframes/bridge_keyframes.gml`:

```gml
/// bridge_find_keyframe(tl, frame)
/// @arg tl
/// @arg frame
/// @desc Returns the keyframe of the timeline at the given position, or null.

function bridge_find_keyframe(tl, frame)
{
	for (var k = 0; k < ds_list_size(tl.keyframe_list); k++)
		if (tl.keyframe_list[|k].position = frame)
			return tl.keyframe_list[|k]
	
	return null
}

/// bridge_cmd_set_frame(args)
/// @arg args

function bridge_cmd_set_frame(args)
{
	var frame, result;
	frame = bridge_arg(args, "frame", null)
	if (!is_real(frame) || frame < 0)
		return bridge_error("bad_args", "frame must be a number of 0 or more")
	
	if (timeline_playing)
		action_tl_play()
	timeline_marker = round(frame)
	
	result = ds_map_create()
	result[?"frame"] = timeline_marker
	return bridge_ok(result)
}

/// bridge_cmd_set_values(args)
/// @arg args
/// @desc Sets values of one object at a frame, creating the keyframe if needed. One undo step.

function bridge_cmd_set_values(args)
{
	var tl, frame, valmap, vids, vals, n, key, vid, val, result;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))
	
	frame = bridge_arg(args, "frame", timeline_marker)
	if (!is_real(frame) || frame < 0)
		return bridge_error("bad_args", "frame must be a number of 0 or more")
	
	if (!ds_map_exists(args, "values") || !is_real(args[?"values"]) || !ds_exists(args[?"values"], ds_type_map))
		return bridge_error("bad_args", "values must be an object of value name to value")
	valmap = args[?"values"]
	
	// Check everything before changing anything
	vids = array()
	vals = array()
	n = 0
	key = ds_map_find_first(valmap)
	while (!is_undefined(key))
	{
		vid = ds_list_find_index(value_name_list, string_upper(key))
		val = valmap[?key]
		if (vid < 0)
			return bridge_error("bad_args", "Unknown value name " + string(key))
		
		if (tl_value_is_texture(vid) || tl_value_is_obj(vid))
			return bridge_error("bad_args", string(key) + " refers to a resource and cannot be set through the bridge")
		else if (tl_value_is_color(vid))
		{
			if (!is_string(val) || string_length(val) != 7 || string_char_at(val, 1) != "#")
				return bridge_error("bad_args", string(key) + " must be a color like #RRGGBB")
			val = hex_to_color(val)
		}
		else if (vid = e_value.TRANSITION)
		{
			if (!is_string(val) || ds_list_find_index(transition_list, val) < 0)
				return bridge_error("bad_args", "Unknown transition " + string(val))
		}
		else if (tl_value_is_string(vid))
		{
			if (!is_string(val))
				return bridge_error("bad_args", string(key) + " must be a string")
		}
		else if (tl_value_is_bool(vid))
		{
			if (!is_bool(val))
				return bridge_error("bad_args", string(key) + " must be true or false")
		}
		else if (!is_real(val))
			return bridge_error("bad_args", string(key) + " must be a number")
		
		vids[n] = vid
		vals[n] = val
		n++
		key = ds_map_find_next(valmap, key)
	}
	if (n = 0)
		return bridge_error("bad_args", "values is empty")
	
	// Select only this timeline and put the marker on the frame, as the UI does before editing
	if (timeline_playing)
		action_tl_play()
	tl_deselect_all()
	with (tl)
		tl_select()
	app_update_tl_edit()
	timeline_marker = round(frame)
	with (tl)
		tl_update_values()
	
	tl_value_set_start(tl_value_set, false)
	for (var i = 0; i < n; i++)
		tl_value_set(vids[i], vals[i], false)
	tl_value_set_done()
	tl_update_length()
	
	result = ds_map_create()
	result[?"id"] = tl.save_id
	result[?"frame"] = timeline_marker
	result[?"values_set"] = n
	return bridge_ok(result)
}

/// bridge_cmd_remove_keyframes(args)
/// @arg args

function bridge_cmd_remove_keyframes(args)
{
	var tl, frames, kfs, result;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))
	
	if (!ds_map_exists(args, "frames") || !is_real(args[?"frames"]) || !ds_exists(args[?"frames"], ds_type_list) || ds_list_size(args[?"frames"]) = 0)
		return bridge_error("bad_args", "frames must be a non-empty list of frame numbers")
	frames = args[?"frames"]
	
	// Check everything before changing anything
	kfs = array()
	for (var i = 0; i < ds_list_size(frames); i++)
	{
		kfs[i] = bridge_find_keyframe(tl, frames[|i])
		if (kfs[i] = null)
			return bridge_error("not_found", "No keyframe at frame " + string(frames[|i]))
	}
	
	tl_deselect_all()
	for (var i = 0; i < array_length(kfs); i++)
		tl_keyframe_select(kfs[i])
	app_update_tl_edit()
	action_tl_keyframes_remove()
	
	result = ds_map_create()
	result[?"removed"] = array_length(kfs)
	return bridge_ok(result)
}

/// bridge_cmd_move_keyframes(args)
/// @arg args
/// @desc Moves one keyframe to another frame through the same actions as dragging it in the timeline.

function bridge_cmd_move_keyframes(args)
{
	var tl, from, to, kf, result;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))
	
	from = bridge_arg(args, "from", null)
	to = bridge_arg(args, "to", null)
	if (!is_real(from) || !is_real(to) || from < 0 || to < 0)
		return bridge_error("bad_args", "from and to must be frame numbers of 0 or more")
	to = round(to)
	
	kf = bridge_find_keyframe(tl, from)
	if (kf = null)
		return bridge_error("not_found", "No keyframe at frame " + string(from))
	if (to != from && bridge_find_keyframe(tl, to) != null)
		return bridge_error("bad_args", "There is already a keyframe at frame " + string(to))
	
	tl_deselect_all()
	tl_keyframe_select(kf)
	app_update_tl_edit()
	
	timeline_mouse_pos = from
	action_tl_keyframes_move_start(kf)
	timeline_mouse_pos = to
	action_tl_keyframes_move()
	action_tl_keyframes_move_done()
	
	with (tl)
	{
		tl_update_values()
		update_matrix = true
	}
	tl_update_matrix()
	
	result = ds_map_create()
	result[?"frame"] = kf.position
	return bridge_ok(result)
}
```

In `bridge_dispatch_command`'s switch add:

```gml
		case "set_frame": return bridge_cmd_set_frame(args)
		case "set_values": return bridge_cmd_set_values(args)
		case "remove_keyframes": return bridge_cmd_remove_keyframes(args)
		case "move_keyframes": return bridge_cmd_move_keyframes(args)
```

- [ ] **Step 4: Build and run the tests**

Run: `.\mcp\scripts\build.ps1`, then `node --test test/app/05-keyframes.test.mjs`. Expected: 8 passing. In the app window the cube's keyframes should be visible in the timeline.

- [ ] **Step 5: Commit**

```bash
git add GmProject mcp/test
git commit -m "Bridge: set_frame, set_values, remove and move keyframes"
```

---

### Task 6: View, playback, screenshot, export, background

**Files:**
- Create: `GmProject/scripts/bridge_view/bridge_view.gml` (+ `.yy`, yyp entry)
- Modify: `GmProject/scripts/bridge_core/bridge_core.gml` (switch; delete the `bridge_pending_poll` stub)
- Test: `mcp/test/app/06-view.test.mjs`

**Interfaces:**
- Consumes: helpers from Task 1; the C++ `pending` protocol from Task 1.
- Produces: commands `set_work_camera {focus?: [x,y,z], angle_xy?, angle_z?, zoom?}` → `{focus, angle_xy, angle_z, zoom}`; `play {}` / `stop {}` → `{playing, frame}`; `screenshot {path, overwrite?}` → `{path}`; `export_image {path, overwrite?, high_quality?, include_hidden?, remove_background?}` → `{path, width, height}` (replies when the file is written); `set_background {sky_time?, ground_show?, biome?, sky_color?}` → `{sky_time, ground_show, biome, sky_color}`. `bridge_pending_poll()` → response map id, or `-1` while still running.

- [ ] **Step 1: Write the failing test**

`mcp/test/app/06-view.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { newProject, startApp, tmpDir } from "./harness.mjs";

let app, call;
const out = tmpDir();
before(async () => {
  app = await startApp();
  await newProject(app.client);
  call = (cmd, args, opts) => app.client.call(cmd, args, opts);
  await call("create_object", { type: "cube" });
});
after(() => app?.stop());

function pngSize(file) {
  const data = readFileSync(file);
  assert.equal(data.subarray(1, 4).toString("latin1"), "PNG");
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

test("set_work_camera sets and reports the viewport camera", async () => {
  const cam = await call("set_work_camera", { focus: [0, 0, 8], angle_xy: 45, angle_z: 20, zoom: 150 });
  assert.deepEqual(cam, { focus: [0, 0, 8], angle_xy: 45, angle_z: 20, zoom: 150 });
  assert.equal((await call("set_work_camera", { zoom: 80 })).angle_xy, 45);
  await assert.rejects(call("set_work_camera", { focus: [1, 2] }), (err) => err.code === "bad_args");
  await assert.rejects(call("set_work_camera", { zoom: 0 }), (err) => err.code === "bad_args");
});

test("play and stop toggle playback", async () => {
  assert.equal((await call("play")).playing, true);
  assert.equal((await call("get_status")).playing, true);
  assert.equal((await call("stop")).playing, false);
  assert.equal((await call("get_status")).playing, false);
});

test("screenshot writes a PNG of the main view", async () => {
  const path = `${out}/view.png`;
  assert.deepEqual(await call("screenshot", { path }), { path });
  assert.ok(pngSize(path).width > 0);
});

test("screenshot and export_image refuse existing files, missing folders and non-PNG paths", async () => {
  const existing = `${out}/keep.png`;
  writeFileSync(existing, "keep me");
  for (const cmd of ["screenshot", "export_image"]) {
    await assert.rejects(call(cmd, { path: existing }), (err) => err.code === "bad_args");
    await assert.rejects(call(cmd, { path: `${out}/no-such-folder/a.png` }), (err) => err.code === "bad_args");
    await assert.rejects(call(cmd, { path: `${out}/a.jpg` }), (err) => err.code === "bad_args");
    await assert.rejects(call(cmd, {}), (err) => err.code === "bad_args");
  }
  assert.equal(readFileSync(existing, "utf8"), "keep me");
  assert.equal((await call("get_status")).window_state, "");
  await call("screenshot", { path: existing, overwrite: true });
  assert.ok(pngSize(existing).width > 0);
});

test("export_image renders the project resolution and returns when the file exists", async () => {
  const path = `${out}/render.png`;
  const result = await call("export_image", { path, high_quality: false }, { timeoutMs: 120000 });
  assert.deepEqual(result, { path, width: 1280, height: 720 });
  assert.ok(existsSync(path));
  assert.deepEqual(pngSize(path), { width: 1280, height: 720 });
  assert.equal((await call("get_status")).window_state, "");
});

test("commands sent during an export are answered after it, in order", async () => {
  const path = `${out}/render2.png`;
  const [exported, status] = await Promise.all([
    call("export_image", { path, high_quality: false }, { timeoutMs: 120000 }),
    call("get_status", {}, { timeoutMs: 120000 }),
  ]);
  assert.equal(exported.path, path);
  assert.equal(status.window_state, "");
});

test("set_background changes and reports background settings", async () => {
  const bg = await call("set_background", { ground_show: false, sky_color: "#102030", sky_time: 90 });
  assert.equal(bg.ground_show, false);
  assert.equal(bg.sky_color, "#102030");
  assert.equal(bg.sky_time, 90);
  await assert.rejects(call("set_background", { biome: "no_such_biome" }), (err) => err.code === "not_found");
  await assert.rejects(call("set_background", { ground_show: "yes" }), (err) => err.code === "bad_args");
  assert.equal((await call("set_background", {})).ground_show, false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/app/06-view.test.mjs`. Expected: FAIL with `unknown_command`.

- [ ] **Step 3: Implement**

Delete the `bridge_pending_poll` stub from `bridge_core.gml`. Run: `.\mcp\scripts\add-gml-script.ps1 bridge_view`, then write `GmProject/scripts/bridge_view/bridge_view.gml`:

```gml
/// bridge_output_path_error(filename, overwrite)
/// @arg filename
/// @arg overwrite
/// @desc Returns why an image cannot be written to the path, or "" if it can.

function bridge_output_path_error(fn, overwrite)
{
	if (!is_string(fn) || string_lower(filename_ext(fn)) != ".png")
		return "path must be a file name ending in .png"
	if (!directory_exists_lib(filename_dir(fn)))
		return "The folder does not exist: " + filename_dir(fn)
	if (file_exists_lib(fn) && !overwrite)
		return "The file already exists, pass overwrite: true to replace it"
	
	return ""
}

/// bridge_cmd_set_work_camera(args)
/// @arg args

function bridge_cmd_set_work_camera(args)
{
	var focus, result, focuslist;
	focus = null
	
	// Check everything before changing anything
	if (ds_map_exists(args, "focus"))
	{
		focus = args[?"focus"]
		if (!is_real(focus) || !ds_exists(focus, ds_type_list) || ds_list_size(focus) != 3 || !is_real(focus[|0]) || !is_real(focus[|1]) || !is_real(focus[|2]))
			return bridge_error("bad_args", "focus must be a list of three numbers")
	}
	if (ds_map_exists(args, "angle_xy") && !is_real(args[?"angle_xy"]))
		return bridge_error("bad_args", "angle_xy must be a number")
	if (ds_map_exists(args, "angle_z") && !is_real(args[?"angle_z"]))
		return bridge_error("bad_args", "angle_z must be a number")
	if (ds_map_exists(args, "zoom") && (!is_real(args[?"zoom"]) || args[?"zoom"] <= 0))
		return bridge_error("bad_args", "zoom must be a number above 0")
	
	if (focus != null)
		cam_work_focus = point3D(focus[|0], focus[|1], focus[|2])
	if (ds_map_exists(args, "angle_xy"))
	{
		cam_work_angle_xy = args[?"angle_xy"]
		cam_work_angle_goal_xy = cam_work_angle_xy
	}
	if (ds_map_exists(args, "angle_z"))
	{
		cam_work_angle_z = clamp(args[?"angle_z"], -89.9, 89.9)
		cam_work_angle_goal_z = cam_work_angle_z
	}
	if (ds_map_exists(args, "zoom"))
	{
		cam_work_zoom = args[?"zoom"]
		cam_work_zoom_goal = cam_work_zoom
	}
	cam_work_angle_look_xy = cam_work_angle_xy
	cam_work_angle_look_z = -cam_work_angle_z
	camera_work_set_from()
	
	result = ds_map_create()
	focuslist = ds_list_create()
	ds_list_add(focuslist, cam_work_focus[X], cam_work_focus[Y], cam_work_focus[Z])
	ds_map_add_list(result, "focus", focuslist)
	result[?"angle_xy"] = cam_work_angle_xy
	result[?"angle_z"] = cam_work_angle_z
	result[?"zoom"] = cam_work_zoom
	return bridge_ok(result)
}

/// bridge_playback_result()

function bridge_playback_result()
{
	var result = ds_map_create();
	result[?"playing"] = timeline_playing
	result[?"frame"] = timeline_marker
	return bridge_ok(result)
}

/// bridge_cmd_play(args)
/// @arg args

function bridge_cmd_play(args)
{
	if (!timeline_playing)
		action_tl_play()
	
	return bridge_playback_result()
}

/// bridge_cmd_stop(args)
/// @arg args

function bridge_cmd_stop(args)
{
	if (timeline_playing)
		action_tl_play()
	
	return bridge_playback_result()
}

/// bridge_cmd_screenshot(args)
/// @arg args
/// @desc Saves the main 3D view as it was last drawn.

function bridge_cmd_screenshot(args)
{
	var fn, err, result;
	fn = bridge_arg(args, "path", "")
	err = bridge_output_path_error(fn, bridge_arg(args, "overwrite", false))
	if (err != "")
		return bridge_error("bad_args", err)
	
	if (!surface_exists(view_main.surface))
		return bridge_error("not_ready", "The main view has not been drawn yet")
	
	surface_save_lib(view_main.surface, fn)
	if (!file_exists_lib(fn))
		return bridge_error("io_error", "Could not write " + fn)
	
	result = ds_map_create()
	result[?"path"] = fn
	return bridge_ok(result)
}

/// bridge_cmd_export_image(args)
/// @arg args
/// @desc Starts the image export without its dialogs. The reply is sent by bridge_pending_poll once the file is written.

function bridge_cmd_export_image(args)
{
	var fn, err, res;
	fn = bridge_arg(args, "path", "")
	err = bridge_output_path_error(fn, bridge_arg(args, "overwrite", false))
	if (err != "")
		return bridge_error("bad_args", err)
	
	if (timeline_playing)
		action_tl_play()
	if (file_exists_lib(fn))
		file_delete_lib(fn)
	
	// Same as action_toolbar_exportimage_save
	export_filename = fn
	popup_exportimage.high_quality = bridge_arg(args, "high_quality", true)
	render_hidden = bridge_arg(args, "include_hidden", false)
	render_background = !bridge_arg(args, "remove_background", false)
	render_watermark = popup_exportimage.watermark
	
	window_state = "export_image"
	exportmovie_frame = 0
	export_sample = 0
	exportmovie_start = current_time
	render_samples = -1
	
	if (view_main.quality = e_view_mode.RENDER)
		view_main.quality = e_view_mode.SHADED
	
	if (view_second.quality = e_view_mode.RENDER)
		view_second.quality = e_view_mode.SHADED
	
	bridge_pending_path = fn
	res = bridge_ok(ds_map_create())
	res[?"pending"] = true
	return res
}

/// bridge_pending_poll()
/// @desc Returns the response map of a command that finishes over several steps, or -1 while it is still running.

function bridge_pending_poll()
{
	var result;
	if (window_state = "export_image")
		return -1
	
	if (!file_exists_lib(bridge_pending_path))
		return bridge_error("io_error", "The export finished but no file was written to " + bridge_pending_path)
	
	result = ds_map_create()
	result[?"path"] = bridge_pending_path
	result[?"width"] = project_video_width
	result[?"height"] = project_video_height
	return bridge_ok(result)
}

/// bridge_cmd_set_background(args)
/// @arg args

function bridge_cmd_set_background(args)
{
	var result;
	
	// Check everything before changing anything
	if (ds_map_exists(args, "sky_time") && !is_real(args[?"sky_time"]))
		return bridge_error("bad_args", "sky_time must be a number")
	if (ds_map_exists(args, "ground_show") && !is_bool(args[?"ground_show"]))
		return bridge_error("bad_args", "ground_show must be true or false")
	if (ds_map_exists(args, "sky_color") && (!is_string(args[?"sky_color"]) || string_length(args[?"sky_color"]) != 7 || string_char_at(args[?"sky_color"], 1) != "#"))
		return bridge_error("bad_args", "sky_color must be a color like #RRGGBB")
	if (ds_map_exists(args, "biome"))
	{
		if (!is_string(args[?"biome"]))
			return bridge_error("bad_args", "biome must be a string")
		if (find_biome(args[?"biome"]) = null)
			return bridge_error("not_found", "Unknown biome " + args[?"biome"])
	}
	
	if (ds_map_exists(args, "sky_time"))
		action_background_sky_time(args[?"sky_time"], false)
	if (ds_map_exists(args, "ground_show"))
		action_background_ground_show(args[?"ground_show"])
	if (ds_map_exists(args, "sky_color"))
		action_background_sky_color(hex_to_color(args[?"sky_color"]))
	if (ds_map_exists(args, "biome"))
		action_background_biome(args[?"biome"])
	
	result = ds_map_create()
	result[?"sky_time"] = background_sky_time
	result[?"ground_show"] = background_ground_show
	result[?"biome"] = background_biome
	result[?"sky_color"] = "#" + color_to_hex(background_sky_color)
	return bridge_ok(result)
}
```

In `bridge_dispatch_command`'s switch add:

```gml
		case "set_work_camera": return bridge_cmd_set_work_camera(args)
		case "play": return bridge_cmd_play(args)
		case "stop": return bridge_cmd_stop(args)
		case "screenshot": return bridge_cmd_screenshot(args)
		case "export_image": return bridge_cmd_export_image(args)
		case "set_background": return bridge_cmd_set_background(args)
```

Note for the `ground_show` readback: if `background_ground_show` is stored as a number in the app, return `(background_ground_show > 0)` so the JSON value is a boolean.

- [ ] **Step 4: Build and run the tests**

Run: `.\mcp\scripts\build.ps1`, then `node --test test/app/06-view.test.mjs`. Expected: 7 passing. Open `render.png` from the temp folder printed by a failing assertion or found under `%TEMP%\mi-bridge-*` and confirm it shows the cube on the ground under a sky.

Then run the whole suite: `npm run test:app`. Expected: all files passing.

- [ ] **Step 5: Commit**

```bash
git add GmProject mcp/test
git commit -m "Bridge: work camera, playback, screenshot, export_image, background"
```

---

### Task 7: MCP server

**Files:**
- Create: `mcp/src/tools.mjs`, `mcp/src/launcher.mjs`, `mcp/src/server.mjs`
- Test: `mcp/test/unit/tools.test.mjs`, `mcp/test/app/07-mcp.test.mjs`

**Interfaces:**
- Consumes: `BridgeClient`, `BridgeError` (Task 1); every bridge command from Tasks 1–6.
- Produces: `tools` (array of `{name, description, shape, cmd, paths?, timeoutMs?, returnsImage?}`), `normalizePath(p)`, `prepareArgs(tool, input)` → bridge args; `launchApp(bridge, {port, exe?, timeoutMs?})` → status; `describeError(err)` → string. Executable `mcp/src/server.mjs` (stdio). Env: `MINEIMATOR_BRIDGE_PORT` (default 41234), `MINEIMATOR_EXE` (default `../install/Mine-imator/Mine-imator.exe` relative to `mcp/`).

- [ ] **Step 1: Write the failing unit test**

`mcp/test/unit/tools.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { BridgeError } from "../../src/bridge-client.mjs";
import { describeError, normalizePath, prepareArgs, tools } from "../../src/tools.mjs";

const tool = (name) => tools.find((t) => t.name === name);

test("tool names and bridge commands are unique and every tool is documented", () => {
  assert.equal(new Set(tools.map((t) => t.name)).size, tools.length);
  assert.equal(new Set(tools.map((t) => t.cmd)).size, tools.length);
  for (const t of tools) assert.ok(t.description.length > 20, t.name);
});

test("every bridge command has a tool", () => {
  const commands = ["get_status", "project_new", "project_open", "project_save", "get_scene", "get_object",
    "create_object", "remove_object", "rename_object", "set_parent", "select", "undo", "redo",
    "set_frame", "set_values", "remove_keyframes", "move_keyframes",
    "set_work_camera", "play", "stop", "screenshot", "export_image", "set_background"];
  assert.deepEqual(tools.map((t) => t.cmd).sort(), commands.sort());
});

test("normalizePath turns backslashes into forward slashes", () => {
  assert.equal(normalizePath("C:\\Users\\me\\a b.png"), "C:/Users/me/a b.png");
});

test("prepareArgs normalizes path arguments and leaves the rest alone", async () => {
  assert.deepEqual(await prepareArgs(tool("project_open"), { path: "C:\\p\\a.miproject" }), { path: "C:/p/a.miproject" });
  assert.deepEqual(await prepareArgs(tool("create_object"), { type: "char", skin: "C:\\s\\me.png" }), { type: "char", skin: "C:/s/me.png" });
  assert.deepEqual(await prepareArgs(tool("set_values"), { id: "a", values: { pos_x: 1 } }), { id: "a", values: { pos_x: 1 } });
});

test("image tools get a fresh temp path when none is given", async () => {
  const args = await prepareArgs(tool("screenshot"), {});
  assert.match(args.path, /\/mineimator-mcp\/screenshot-\d+\.png$/);
  assert.ok(!args.path.includes("\\"));
  assert.ok(existsSync(path.dirname(args.path)));
});

test("input shapes reject bad input and accept good input", () => {
  assert.ok(z.object(tool("set_values").shape).safeParse({ id: "a", frame: 0, values: { pos_x: 1, transition: "linear", spawn: true } }).success);
  assert.ok(!z.object(tool("set_values").shape).safeParse({ id: "a", frame: -1, values: {} }).success);
  assert.ok(!z.object(tool("create_object").shape).safeParse({ type: "scenery" }).success);
  assert.ok(!z.object(tool("set_work_camera").shape).safeParse({ focus: [1, 2] }).success);
});

test("describeError explains bridge and connection failures", () => {
  assert.equal(describeError(new BridgeError("not_found", "No object with id x")), "not_found: No object with id x");
  assert.match(describeError(Object.assign(new Error("connect"), { code: "ECONNREFUSED" })), /launch_app/);
  assert.match(describeError(new BridgeError("busy_modal", "dialog")), /busy_modal/);
});
```

Run: `npm test`. Expected: FAIL, cannot find `../../src/tools.mjs`.

- [ ] **Step 2: Tool table**

`mcp/src/tools.mjs`:

```js
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

const id = z.string().min(1).describe("Object id, from get_scene or create_object");
const frame = z.number().int().min(0).describe("Timeline frame, 0 or more");
const overwrite = z.boolean().optional().describe("Replace the file if it already exists");

/** Mine-imator works with forward slashes in paths. */
export function normalizePath(p) {
  return p.replaceAll("\\", "/");
}

export const tools = [
  {
    name: "get_status",
    cmd: "get_status",
    description: "Report what Mine-imator is doing: version, open project, unsaved changes, current frame, playback, object count, undo steps. window_state is \"startup\" on the home screen and \"\" when a project is open.",
    shape: {},
  },
  {
    name: "project_new",
    cmd: "project_new",
    description: "Create and open a new empty project. Fails with unsaved_changes if the open project has unsaved work, unless discard is true.",
    shape: {
      name: z.string().min(1).describe("Project name"),
      folder: z.string().optional().describe("Folder to create the project in. Default: a folder named after the project in Mine-imator's Projects folder"),
      discard: z.boolean().optional().describe("Drop unsaved changes of the open project"),
    },
    paths: ["folder"],
  },
  {
    name: "project_open",
    cmd: "project_open",
    description: "Open a .miproject file. Fails with unsaved_changes if the open project has unsaved work, unless discard is true.",
    shape: {
      path: z.string().min(1).describe("Full path of the .miproject file"),
      discard: z.boolean().optional().describe("Drop unsaved changes of the open project"),
    },
    paths: ["path"],
  },
  {
    name: "project_save",
    cmd: "project_save",
    description: "Save the open project to its file.",
    shape: {},
  },
  {
    name: "get_scene",
    cmd: "get_scene",
    description: "List every object in the project with its id, name, type, parent, selection and keyframe frames. A character's limbs are separate objects of type bodypart whose part_of is the character's id; pose a limb by setting values on that object.",
    shape: {},
  },
  {
    name: "get_object",
    cmd: "get_object",
    description: "Read one object: its values at the current frame and every keyframe with its values. Position, rotation and scale are always listed, other values only when they differ from the default.",
    shape: { id },
  },
  {
    name: "create_object",
    cmd: "create_object",
    description: "Create an object at the origin and select it. Returns its id. Characters come with body part objects (see get_scene).",
    shape: {
      type: z.enum(["char", "character", "item", "block", "text", "cube", "cone", "cylinder", "sphere", "surface", "camera", "spotlight", "pointlight", "folder"]),
      name: z.string().optional().describe("Name shown in the timeline"),
      model: z.string().optional().describe("Character model name, e.g. steve, alex, zombie. Characters only"),
      skin: z.string().optional().describe("Full path of a skin PNG. Characters only"),
    },
    paths: ["skin"],
  },
  {
    name: "remove_object",
    cmd: "remove_object",
    description: "Remove an object and its children. Body parts cannot be removed on their own.",
    shape: { id },
  },
  {
    name: "rename_object",
    cmd: "rename_object",
    description: "Rename an object. An empty name restores the default name.",
    shape: { id, name: z.string() },
  },
  {
    name: "set_parent",
    cmd: "set_parent",
    description: "Move an object under another object or folder, so it follows its parent's transform. Use an empty parent to move it back to the top level.",
    shape: { id, parent: z.string().describe("Id of the new parent, or \"\" for the top level") },
  },
  {
    name: "select_objects",
    cmd: "select",
    description: "Select exactly these objects in the app, deselecting everything else.",
    shape: { ids: z.array(z.string().min(1)) },
  },
  {
    name: "undo",
    cmd: "undo",
    description: "Undo the last change, the same as Ctrl+Z in the app. done is false when there was nothing to undo.",
    shape: {},
  },
  {
    name: "redo",
    cmd: "redo",
    description: "Redo the last undone change. done is false when there was nothing to redo.",
    shape: {},
  },
  {
    name: "set_frame",
    cmd: "set_frame",
    description: "Move the timeline marker to a frame. The view shows the scene at that frame.",
    shape: { frame },
  },
  {
    name: "set_values",
    cmd: "set_values",
    description: "Set values of one object at a frame, creating a keyframe there or editing the existing one. One undo step. Value names are lower case: pos_x pos_y pos_z, rot_x rot_y rot_z, sca_x sca_y sca_z, bend_angle_x, alpha, rgb_mul, cam_fov, light_strength and so on (get_object shows the names in use). Colours are \"#RRGGBB\". Set transition (linear, instant, easeinquad, easeoutquad, easeinoutquad, easeinoutcubic, easeoutbounce, ...) to choose the easing from this keyframe to the next. Z is up; 16 units are one block.",
    shape: {
      id,
      frame: frame.optional().describe("Frame to keyframe at. Default: the current frame"),
      values: z.record(z.union([z.number(), z.string(), z.boolean()])).describe("Value name to value"),
    },
  },
  {
    name: "remove_keyframes",
    cmd: "remove_keyframes",
    description: "Remove an object's keyframes at the given frames.",
    shape: { id, frames: z.array(frame).min(1) },
  },
  {
    name: "move_keyframe",
    cmd: "move_keyframes",
    description: "Move one keyframe of an object to another frame. Fails if the target frame already has a keyframe.",
    shape: { id, from: frame, to: frame },
  },
  {
    name: "set_work_camera",
    cmd: "set_work_camera",
    description: "Point the viewport's work camera: it orbits the focus point at the given angles and distance. Only the given fields change. This is the editing view, not a camera object in the scene.",
    shape: {
      focus: z.array(z.number()).length(3).optional().describe("Point to look at, [x, y, z]"),
      angle_xy: z.number().optional().describe("Horizontal orbit angle in degrees"),
      angle_z: z.number().optional().describe("Vertical orbit angle in degrees, -89.9 to 89.9"),
      zoom: z.number().positive().optional().describe("Distance from the focus point"),
    },
  },
  {
    name: "play",
    cmd: "play",
    description: "Start timeline playback from the current frame.",
    shape: {},
  },
  {
    name: "stop",
    cmd: "stop",
    description: "Stop timeline playback.",
    shape: {},
  },
  {
    name: "screenshot",
    cmd: "screenshot",
    description: "Capture the main 3D view as it is drawn in the app right now and return the image. Fast; use it to check your work.",
    shape: {
      path: z.string().optional().describe("Where to save the PNG. Default: a temp file"),
      overwrite,
    },
    paths: ["path"],
    returnsImage: true,
  },
  {
    name: "export_image",
    cmd: "export_image",
    description: "Render the current frame at the project resolution through the scene's camera and return the image. Slower than screenshot; high quality can take a while.",
    shape: {
      path: z.string().optional().describe("Where to save the PNG. Default: a temp file"),
      overwrite,
      high_quality: z.boolean().optional().describe("Use the full renderer. Default true"),
      include_hidden: z.boolean().optional(),
      remove_background: z.boolean().optional(),
    },
    paths: ["path"],
    returnsImage: true,
    timeoutMs: 600000,
  },
  {
    name: "set_background",
    cmd: "set_background",
    description: "Change background settings and report the current ones. Only the given fields change.",
    shape: {
      sky_time: z.number().optional().describe("Time of day, the same number as the Time setting in the Background tab"),
      ground_show: z.boolean().optional().describe("Show the ground plane"),
      biome: z.string().optional().describe("Biome name, e.g. plains"),
      sky_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    },
  },
];

/** Turns validated tool input into bridge command args. */
export async function prepareArgs(tool, input) {
  const args = { ...input };
  for (const key of tool.paths ?? []) {
    if (typeof args[key] === "string") args[key] = normalizePath(args[key]);
  }
  if (tool.returnsImage && !args.path) {
    const dir = path.join(os.tmpdir(), "mineimator-mcp");
    await mkdir(dir, { recursive: true });
    args.path = normalizePath(path.join(dir, `${tool.name}-${Date.now()}.png`));
  }
  return args;
}

/** One line a model can act on. */
export function describeError(err) {
  if (err?.code === "ECONNREFUSED")
    return "Mine-imator is not running with the bridge enabled. Call launch_app, or start the custom build with --bridge.";
  if (err?.name === "BridgeError") return `${err.code}: ${err.message}`;
  return String(err?.message ?? err);
}
```

Run: `npm test`. Expected: all unit tests passing.

- [ ] **Step 3: Launcher and server**

`mcp/src/launcher.mjs`:

```js
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
```

`mcp/src/server.mjs`:

```js
#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BridgeClient } from "./bridge-client.mjs";
import { launchApp } from "./launcher.mjs";
import { describeError, prepareArgs, tools } from "./tools.mjs";

const port = Number(process.env.MINEIMATOR_BRIDGE_PORT ?? 41234);
const bridge = new BridgeClient({ port });
const server = new McpServer({ name: "mineimator", version: "0.1.0" });

const text = (value) => ({ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) });
const failure = (err) => ({ isError: true, content: [text(describeError(err))] });

for (const tool of tools) {
  server.tool(tool.name, tool.description, tool.shape, async (input) => {
    try {
      const args = await prepareArgs(tool, input);
      const result = await bridge.call(tool.cmd, args, { timeoutMs: tool.timeoutMs });
      const content = [text(result)];
      if (tool.returnsImage)
        content.push({ type: "image", data: (await readFile(result.path)).toString("base64"), mimeType: "image/png" });
      return { content };
    } catch (err) {
      return failure(err);
    }
  });
}

server.tool(
  "launch_app",
  "Start the Mine-imator custom build with the bridge enabled and wait until it is ready. Does nothing if it is already running. Call this first when other tools report that Mine-imator is not running.",
  {},
  async () => {
    try {
      return { content: [text(await launchApp(bridge, { port }))] };
    } catch (err) {
      return failure(err);
    }
  },
);

await server.connect(new StdioServerTransport());
```

- [ ] **Step 4: MCP integration test**

`mcp/test/app/07-mcp.test.mjs`:

```js
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startApp, TEST_PORT, tmpDir } from "./harness.mjs";

let app, mcp;
const json = (result) => JSON.parse(result.content[0].text);

before(async () => {
  app = await startApp();
  mcp = new Client({ name: "test", version: "0.0.0" });
  await mcp.connect(new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../../src/server.mjs", import.meta.url))],
    env: { ...process.env, MINEIMATOR_BRIDGE_PORT: String(TEST_PORT) },
  }));
});
after(async () => { await mcp?.close(); app?.stop(); });

test("lists every tool", async () => {
  const names = (await mcp.listTools()).tools.map((t) => t.name);
  for (const name of ["launch_app", "get_status", "create_object", "set_values", "screenshot", "export_image"])
    assert.ok(names.includes(name), name);
  assert.equal(names.length, 24);
});

test("launch_app reports the running app without starting another", async () => {
  assert.equal(json(await mcp.callTool({ name: "launch_app", arguments: {} })).launched, false);
});

test("drives the app: project, object, keyframes, screenshot with image content", async () => {
  const folder = tmpDir().replaceAll("/", "\\"); // Windows-style input must be accepted
  assert.equal(json(await mcp.callTool({ name: "project_new", arguments: { name: "mcp", folder } })).project_name, "mcp");
  const cube = json(await mcp.callTool({ name: "create_object", arguments: { type: "cube" } }));
  await mcp.callTool({ name: "set_values", arguments: { id: cube.id, frame: 0, values: { pos_z: 0 } } });
  await mcp.callTool({ name: "set_values", arguments: { id: cube.id, frame: 24, values: { pos_z: 32, transition: "easeoutbounce" } } });
  assert.deepEqual(json(await mcp.callTool({ name: "get_object", arguments: { id: cube.id } })).frames, [0, 24]);
  const shot = await mcp.callTool({ name: "screenshot", arguments: {} });
  assert.equal(shot.content[1].type, "image");
  assert.equal(shot.content[1].mimeType, "image/png");
  assert.ok(shot.content[1].data.length > 1000);
});

test("bridge errors come back as tool errors with the code", async () => {
  const result = await mcp.callTool({ name: "get_object", arguments: { id: "no-such-id" } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^not_found: /);
});
```

Run: `node --test test/app/07-mcp.test.mjs`. Expected: 4 passing. If the installed SDK version does not export `server.tool`, use `server.registerTool(name, { description, inputSchema: shape }, handler)` with the same arguments.

- [ ] **Step 5: Commit**

```bash
git add mcp
git commit -m "Add MCP server for the Mine-imator bridge"
```

---

### Task 8: Registration, docs and acceptance

**Files:**
- Create: `.mcp.json`, `mcp/README.md`
- Test: `mcp/test/app/08-acceptance.test.mjs`

**Interfaces:**
- Consumes: the MCP server from Task 7.
- Produces: project-scoped MCP registration; the spec's acceptance scenario as a runnable test.

- [ ] **Step 1: Acceptance test**

`mcp/test/app/08-acceptance.test.mjs` — the success scenario from the spec, through MCP only:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startApp, TEST_PORT, tmpDir } from "./harness.mjs";

let app, mcp;
const folder = tmpDir();
const call = async (name, args = {}) => {
  const result = await mcp.callTool({ name, arguments: args });
  assert.ok(!result.isError, `${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
};

before(async () => {
  app = await startApp();
  mcp = new Client({ name: "acceptance", version: "0.0.0" });
  await mcp.connect(new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../../src/server.mjs", import.meta.url))],
    env: { ...process.env, MINEIMATOR_BRIDGE_PORT: String(TEST_PORT) },
  }));
});
after(async () => { await mcp?.close(); app?.stop(); });

test("character walks, camera moves, project saves, frame exports", async () => {
  await call("project_new", { name: "acceptance", folder });

  const char = await call("create_object", { type: "character", name: "Hero" });
  await call("set_values", { id: char.id, frame: 0, values: { pos_x: -48, pos_y: 0 } });
  await call("set_values", { id: char.id, frame: 48, values: { pos_x: 48, pos_y: 0, transition: "easeinoutquad" } });

  const camera = await call("create_object", { type: "camera", name: "Shot" });
  await call("set_values", { id: camera.id, frame: 0, values: { pos_x: 0, pos_y: -120, pos_z: 32 } });
  await call("set_values", { id: camera.id, frame: 48, values: { pos_x: 40, pos_y: -100, pos_z: 40 } });

  const hero = await call("get_object", { id: char.id });
  assert.deepEqual(hero.frames, [0, 48]);
  assert.equal(hero.name, "Hero");

  await call("set_frame", { frame: 24 });
  const saved = await call("project_save");
  assert.equal(saved.project_changed, false);
  const project = JSON.parse(readFileSync(saved.project_file, "utf8"));
  assert.ok(project.timelines.some((t) => t.id === char.id));

  const path = `${folder}/frame24.png`;
  const exported = await mcp.callTool({ name: "export_image", arguments: { path, high_quality: false } });
  assert.ok(!exported.isError, exported.content[0].text);
  assert.ok(existsSync(path));
  assert.equal(exported.content[1].type, "image");
  console.log(`Exported frame: ${path}`);
});
```

Run: `node --test test/app/08-acceptance.test.mjs`. Expected: 1 passing, and the path of the exported frame printed. Open that PNG and confirm it shows the character on the ground, seen from the scene camera.

- [ ] **Step 2: Compatibility check with the official build**

Copy the saved `acceptance` project folder to `C:\Users\raphr\Mine-imator\Projects\` and ask the user to open it in official Mine-imator 2.0.2. Expected: it opens with the character and camera and their keyframes. Record the outcome in the spec's "Open risks" section.

- [ ] **Step 3: Registration and README**

`.mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "mineimator": {
      "command": "node",
      "args": ["mcp/src/server.mjs"]
    }
  }
}
```

`mcp/README.md`:

```markdown
# Mine-imator MCP

Controls a running Mine-imator through a local socket built into this fork.

## Run

1. Build once: `mcp/scripts/build.ps1` (needs the toolchain from `BUILD.md`). The app lands in `install/Mine-imator/`.
2. `cd mcp && npm install`
3. Start an MCP client in this repo; `.mcp.json` registers the `mineimator` server. Call `launch_app` first, or start `install/Mine-imator/Mine-imator.exe --bridge` yourself.

The socket listens on `127.0.0.1:41234` and only when the app is started with `--bridge` (or `MINEIMATOR_BRIDGE_PORT` is set). A normal launch opens nothing. In bridge mode the app uses its own temp folder, so it can run next to an official install.

## Tools

`launch_app`, `get_status`, `project_new`, `project_open`, `project_save`, `get_scene`, `get_object`, `create_object`, `remove_object`, `rename_object`, `set_parent`, `select_objects`, `undo`, `redo`, `set_frame`, `set_values`, `remove_keyframes`, `move_keyframe`, `set_work_camera`, `play`, `stop`, `screenshot`, `export_image`, `set_background`.

Every change goes through the app's own actions, so it shows up live and Ctrl+Z undoes it.

## Environment

- `MINEIMATOR_BRIDGE_PORT`: port for both the app and the server. Default 41234.
- `MINEIMATOR_EXE`: path of the custom build. Default `install/Mine-imator/Mine-imator.exe`.

## Tests

- `npm test`: unit tests, no app needed.
- `npm run test:app`: integration tests. They start the custom build on port 41235 and open its window.

## Protocol

One JSON object per line: `{"id": 1, "cmd": "get_status", "args": {}}` → `{"id": 1, "ok": true, "result": {...}}` or `{"id": 1, "ok": false, "error": {"code": "...", "message": "..."}}`. Paths use forward slashes. Design notes: `docs/superpowers/specs/2026-10-02-mcp-bridge-design.md`.
```

- [ ] **Step 4: Full verification**

Run in `mcp/`: `npm test` then `npm run test:app`. Expected: every file passing.

- [ ] **Step 5: Commit**

```bash
git add .mcp.json mcp docs
git commit -m "Register the Mine-imator MCP server and add acceptance test"
```

Then tell the user: restart the Claude Code session in `C:\Dev\Mine-imator` and approve the `mineimator` server to get the tools.
