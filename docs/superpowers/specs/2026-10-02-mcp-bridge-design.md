# Mine-imator MCP bridge — design

Date: 2026-10-02
Branch: `mcp-bridge` (forked from upstream `master` at `eda12dd0`)

## Goal

Let an MCP client control a running Mine-imator live: create objects, pose and
keyframe them, move the camera, scrub and play the timeline, read scene state,
capture the view, and export. Changes appear in the open app as they are made
and are undoable with Ctrl+Z, exactly like changes made by hand.

Success: from an MCP client, with the custom build open on an empty project,
create a character, keyframe a short move with a camera move, save the project,
and export a frame as PNG, without touching the mouse or keyboard.

## Constraints and facts this design rests on

- Mine-imator has no automation interface. Its UI is immediate-mode and drawn
  by the app, so there is nothing external to hook.
- The source is MIT. Logic is GML in `GmProject/scripts`, transpiled to C++ by
  CppGen at build time. GML built-ins are declared in `CppGen/gml.json` and
  implemented in `CppProject/Gml/`.
- The UI mutates state through `action_*` scripts (783 of them). They are plain
  functions, they register undo history themselves, and most act on the current
  selection and `timeline_marker`.
- The app loop is `AppHandler::timerEvent` → `app_event_step` → `app_event_draw`
  on the Qt main thread. Qt Network is already linked (used for `http_get`).
- Objects carry a stable `save_id`, which the project file also uses.
- Modal dialogs (`show_message_ext`, file dialogs) run a nested event loop and
  stall the step loop.

## Architecture

Three units, each replaceable without touching the others.

```
MCP client ──stdio──> mcp-server (Node) ──TCP 127.0.0.1──> Bridge (C++/Qt) ──queue──> bridge_* (GML)
```

### 1. Transport — `CppProject/Bridge/Bridge.{hpp,cpp}`

A `QTcpServer` owned by `AppHandler`, listening on `127.0.0.1` only. Port from
env `MINEIMATOR_BRIDGE_PORT`, default `41234`. The server only starts when the
app is launched with `--bridge` or that env var is set, so a normal launch
opens no socket.

Protocol: newline-delimited JSON, one request per line, one response per line.

```
-> {"id": 7, "cmd": "tl_set_values", "args": {...}}
<- {"id": 7, "ok": true, "result": {...}}
<- {"id": 7, "ok": false, "error": {"code": "not_found", "message": "..."}}
```

The transport does not interpret commands. It parses the envelope, queues
requests, and once per step (from `AppHandler::timerEvent`, main window, before
`app_event_step`) calls the generated GML function `bridge_dispatch(cmd,
argsjson)`. That returns a ds_map, which the transport serialises to JSON.
CppGen has no `json_encode` and no `try`/`catch`, so encoding and catching a
GML runtime error both live on the C++ side. A time budget per step keeps the
UI responsive. No `gml.json` changes are needed.

If the app is blocked in a modal dialog, the transport answers directly with
error `busy_modal` instead of queueing, so the client never hangs.

A command that finishes over several steps (image export) returns a map with
`pending: true`; the transport holds that request and polls
`bridge_pending_poll()` each step until it returns the final response.

### 2. Command layer — GML, `GmProject/scripts/bridge_*`

`bridge_dispatch` decodes the args, refuses everything but `get_status` while
the app is loading or exporting, and dispatches on `cmd` with a `switch`.

Each command is one function `bridge_cmd_<name>(args)` that returns a response
map built with `bridge_ok(result)` or `bridge_error(code, message)`. Commands call the existing `action_*`
and `tl_*` scripts rather than poking state, so undo history, list refresh and
matrix updates behave as they do in the UI. Commands never call anything that
opens a dialog; where the UI action would (open, save-as, export), the command
calls the underlying function with an explicit path instead.

Objects are addressed by `save_id`. Values are addressed by lower-case
`e_value` names (`pos_x`, `rot_z`, `cam_fov`, ...), mapped through a table
built once at startup.

Asset scripts cannot be added outside the GameMaker IDE in the normal
workflow; new scripts are added by creating the `.gml` + `.yy` pair and
registering them in `Mine-imator.yyp` by hand, following an existing script as
the template. This is verified in the first implementation step before any
command is written.

### 3. MCP server — `mcp/` (Node 22, plain ESM JavaScript, `@modelcontextprotocol/sdk`)

A stdio MCP server that holds one TCP connection to the bridge and maps each
tool to one or a few bridge commands. It owns argument validation (zod
schemas), friendly errors (`app not running`, `busy_modal`), and launching the
custom build on request. It contains no Mine-imator logic.

## Command set (v1)

Kept to what the success criterion needs plus state readback. YAGNI on the rest.

| Tool | What it does |
|---|---|
| `get_status` | version, project name/path, unsaved flag, window state, tempo, marker frame |
| `project_new` / `project_open` / `project_save` | explicit path, no dialogs; `open` refuses when there are unsaved changes unless `discard: true` |
| `get_scene` | all timelines: `save_id`, name, type, parent, selected, keyframe positions |
| `get_object` | one timeline: current values and full keyframe list with values |
| `create_object` | type (`character`, `camera`, `cube`, `item`, `block`, `text`, light types, `folder`), plus model name / skin path where relevant; returns `save_id` |
| `remove_object`, `rename_object`, `set_parent`, `select` | by `save_id` |
| `set_frame` | move `timeline_marker` |
| `set_values` | on object(s) at a frame: map of value name → number/color/bool; creates or edits the keyframe; one undo step |
| (easing) | set through `set_values` with the value `transition` |
| `remove_keyframes`, `move_keyframes` | by object + frame |
| `set_work_camera` | viewport orbit camera: focus, angles, zoom |
| `play` / `stop` | timeline playback |
| `screenshot` | save the main view surface to a PNG path and return it |
| `export_image` | full-quality render of the current frame to a PNG path; returns when written |
| `undo` / `redo` | app history |
| `set_background` | subset: sky time, ground show, biome, sky color |

Character body parts are separate child timelines in Mine-imator, so posing an
arm is `set_values` on that part's `save_id`; `get_scene` exposes the tree.

Out of scope for v1: movie export, particles, scenery import, resource
management beyond a skin path, render-settings tuning, multi-window.

## Error handling

- Unknown command, bad args, unknown `save_id` or value name → `ok: false`
  with a code and message; the app state is untouched.
- A GML runtime error inside a command is caught at the dispatcher, returned
  as `internal_error`, and logged to `log.txt`.
- `export_image` and `screenshot` are asynchronous inside the app (render takes
  several frames); the dispatcher keeps the request open and replies when the
  file exists or a timeout passes.
- The MCP server reconnects on demand and reports clearly when the app is not
  running or was started without `--bridge`.

## Safety

- Loopback only, opt-in at launch, no arbitrary GML or file execution
  commands. File-writing commands take explicit paths and never overwrite
  silently except the current project's own save.
- The custom build installs to `install/Mine-imator` in this repo, separate
  from the official 2.0.2 install. It keeps its own `Data` and `Projects`
  folders next to its exe, so official settings and projects are untouched.
- A normal launch of either build uses the temporary folder
  `%APPDATA%\Mine-imator`. In bridge mode the custom build uses
  `%APPDATA%\Mine-imator\Bridge` instead, so it can run next to the official
  build.

## Testing

- Transport: a Node script that connects, sends malformed and valid lines, and
  checks framing and `busy_modal`.
- Commands: an integration script per command group that drives the real app
  through the bridge and asserts via `get_scene` / `get_object` readback, then
  `undo` and asserts the prior state.
- MCP server: unit tests for schema validation and the connection state
  machine against a fake bridge.
- Acceptance: the success scenario above, run end to end from an MCP client,
  with the exported PNG opened and inspected.

## Milestones

0. Stock upstream source builds and runs on this machine. Done 2026-10-02:
   `Setup.ps1` then `Setup.ps1 Release` with Build Tools 17.14; the built exe
   loads assets and reaches the welcome screen.
1. Transport + `get_status` round trip from a Node script.
2. Read commands (`get_scene`, `get_object`).
3. Write commands (create, select, set_values, keyframes, undo).
4. Camera, playback, screenshot, export.
5. MCP server, registered in Claude Code, acceptance run.

## Open risks

- Master still reports version 2.0.2 and writes project format 34, the same
  as the official release, so projects should open in both. Projects saved by the
  custom build carry the same header (format 34, created_in 2.0.2); opening
  one in the official app has not been tried yet.
- Some `action_*` scripts assume mouse/UI context (e.g. `action_bench_create`
  starts interactive placement). Each command must be checked for this and
  call the lower-level function where needed.
