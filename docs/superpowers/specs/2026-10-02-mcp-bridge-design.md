# Mine-imator MCP bridge — design

Date: 2026-10-02, brought up to date 2026-10-03 (all roadmap phases built)
Branch history: `mcp-bridge`, then one branch per phase, merged into local `master`
(forked from upstream `master` at `eda12dd0`; nothing is pushed to upstream)

## Goal

Let an MCP client control a running Mine-imator live: create and arrange
objects, pose and keyframe them, move the camera, scrub and play the timeline,
read scene state, bring in assets, capture the view, and export. Changes appear
in the open app as they are made and are undoable with Ctrl+Z, exactly like
changes made by hand.

Success, met: from an MCP client, with the custom build open on an empty
project, create a character, keyframe a short move with a camera move, save the
project, and export a frame or a movie, without touching the mouse or keyboard.

## Facts this design rests on

- Mine-imator has no automation interface. Its UI is immediate-mode and drawn
  by the app, so there is nothing external to hook.
- The source is MIT. Logic is GML in `GmProject/scripts`, transpiled to C++ by
  CppGen at build time. GML built-ins are declared in `CppGen/gml.json` and
  implemented in `CppProject/Gml/`.
- The UI mutates state through `action_*` scripts (about 780). They are plain
  functions, they register undo history themselves, and most act on the current
  selection and `timeline_marker`.
- The app loop is `AppHandler::timerEvent` → `app_event_step` → `app_event_draw`
  on the Qt main thread. Qt Network was already linked.
- Objects and resources carry a stable `save_id`, which the project file uses.
- Modal dialogs (`show_message`, file dialogs) run a nested event loop and
  stall the step loop. Many load paths raise them on bad input.

## Architecture

Three units, each replaceable without touching the others.

```
MCP client ──stdio──> mcp-server (Node) ──TCP 127.0.0.1──> Bridge (C++/Qt) ──queue──> bridge_* (GML)
```

### 1. Transport — `CppProject/Bridge/Bridge.{hpp,cpp}`

A `QTcpServer` owned by `Bridge`, itself created by `AppHandler`. It listens on
`127.0.0.1` only, port from env `MINEIMATOR_BRIDGE_PORT` (default `41234`). It
is closed until started: from the **MCP** menu in the toolbar (Start / Stop), by
the "Start automatically" setting, or by the `--bridge` flag. A normal launch
opens no socket. The menu shows state, port and client count; toasts announce
start, stop and port failures.

Protocol: newline-delimited JSON, one request per line, one response per line.

```
-> {"id": 7, "cmd": "set_values", "args": {...}}
<- {"id": 7, "ok": true, "result": {...}}
<- {"id": 7, "ok": false, "error": {"code": "not_found", "message": "..."}}
```

Replies carry the id of their request and are not guaranteed to arrive in
request order (for example `get_status` is answered while another command
waits), so clients match on id. A line that is not valid JSON gets a reply with
a null id.

The transport does not interpret commands. Once per step (from
`AppHandler::timerEvent`, before `app_event_step`) it calls the generated GML
`bridge_dispatch(cmd, argsjson)`, which returns a ds_map that the transport
encodes to JSON. CppGen has no `json_encode` and no `try`/`catch`, so encoding
and catching a runtime error live on the C++ side: an app error inside a
command becomes an `internal_error` reply and `bridge_reset` puts the GML side
back to idle. A time budget per step keeps the UI responsive.

Commands that finish over several frames (image and movie export, scenery and
sound decoding, player skin download) return `pending: true`. The transport
holds the request and polls `bridge_pending_poll()` each step. While one is
pending only `get_status` is answered; the rest wait in order. A timeout
(10 minutes, or what the command asks for) answers `timeout` and leaves the
work running.

If the app is blocked in a modal dialog, the transport answers `busy_modal`
instead of queueing, so the client never hangs.

### 2. Command layer — GML, `GmProject/scripts/bridge_*`

`bridge_dispatch` decodes the args, refuses everything but `get_status` while
the app is loading or exporting, and dispatches on `cmd`. Each command is
`bridge_cmd_<name>(args)` and returns `bridge_ok(result)` or
`bridge_error(code, message)`.

Rules every command follows:

- **Go through the app's actions** (`action_*`, `tl_*`), so undo history, list
  refresh and matrix updates behave as in the UI. Where the action would open a
  dialog or start mouse placement, the command sets up the state the UI would
  have and calls it directly, or calls the underlying function.
- **Validate everything before changing anything.** A bad request leaves the
  project untouched and adds no undo step.
- **Never let the app open a message box.** While a command runs (and while a
  load it started is pending, with a deadline) `error()` and `question()` are
  silenced: the error text is kept and returned in the reply, questions are
  answered "no" (which makes a unique copy instead of replacing a resource).
  The few commands that load files also check the file first, since the app
  loads some bad files as empty things without any error.
- **Convert request values to plain types** (`string`, `round`, `bridge_real`,
  `(x > 0)`) before they reach app variables. CppGen infers C++ types from every
  assignment, and a variant leaking into a typed app variable breaks stock files.

Objects are addressed by `save_id`; values by lower-case `e_value` names
(`pos_x`, `rot_z`, `cam_fov`, ...). Conventions: Z is up, 16 units are one
block, a new character faces +Y, colours are `#RRGGBB`.

New scripts are added by creating the `.gml` + `.yy` pair and registering them
in `Mine-imator.yyp` (`mcp/scripts/add-gml-script.ps1` does it).

### 3. MCP server — `mcp/` (Node 22, plain ESM, `@modelcontextprotocol/sdk`)

A stdio MCP server holding one TCP connection to the bridge, mapping each tool
to one bridge command. It owns argument validation (zod), friendly errors (app
not running, busy), launching the custom build (`launch_app`, optionally
invisible), path normalisation, and returning images (inline up to 3 MB,
otherwise just the path). It contains no Mine-imator logic.

## Command set

| Area | Tools |
|---|---|
| App and project | `launch_app`, `get_status`, `project_new`, `project_open`, `project_save`, `get_project_settings`, `set_project_settings` (tempo, resolution, render options), `set_background` (sky, sun, moon, clouds, sky image, fog, wind, ground, colours, biome) |
| Reading | `get_scene` (objects and markers), `get_object` (values, settings, keyframes), `list_names`, `list_resources` |
| Objects | `create_object` (character, item, block, text, shapes, camera, lights, folder, audio, particles), `remove_object`, `rename_object`, `set_parent`, `select_objects`, `duplicate_object`, `set_object_settings` (visibility, lock, pivot, text, item, block, texture, spawner options, render and inherit flags) |
| Animation | `set_frame`, `set_values`, `set_keyframes` (batch), `remove_keyframes`, `move_keyframe`, `copy_keyframes` (a frame, a range, or a whole pose, between frames or objects), `set_marker`, `remove_marker`, `set_loop`, `play`, `stop` |
| Camera and output | `set_work_camera`, `set_view_camera`, `screenshot`, `export_image`, `export_movie` |
| Assets | `set_skin` (file or player name), `import_model`, `import_scenery`, `import_image`, `import_sound`, `remove_resource` |
| History | `undo`, `redo` |

Character body parts are separate child timelines, so posing an arm is
`set_values` on that part's id; `get_scene` exposes the tree. Keyframe values
that refer to a resource or object (`sound_obj`, `texture_obj`) take its id.

Not exposed: importing a box from a Minecraft world, particle type editing
(spawners come from presets), shaders and render passes beyond the presets,
multi-window.

## Error handling

- Unknown command, bad args, unknown id or name: `ok: false` with a code
  (`bad_args`, `not_found`, `busy`, `busy_modal`, `timeout`, `internal_error`,
  `io_error`, `no_project`, `already_exists`, `network_error`) and a message.
  State is untouched.
- An error the app raises while a command still succeeds comes back as a
  `warning` in the result.
- The MCP server reconnects on demand and says clearly when the app is not
  running or has the bridge closed.

## Background mode

`--background` keeps every window off screen (at -30000,-30000, never given the
focus, never maximised) while the app still renders, so tests and an agent can
work while the person uses the computer. In this mode a fatal error is written
to the log and the app exits instead of opening its crash dialog. `launch_app`
takes `background: true`.

## Safety

- Loopback only, opt-in, no arbitrary GML or file-execution commands.
  File-writing commands take explicit paths and refuse to overwrite unless asked.
- The custom build is deployed over the official install with
  `mcp/scripts/deploy.ps1`, which replaces program files only and leaves
  projects, skins, settings, the upgrade key and the recent list alone. The
  official files were backed up before the first deploy. The build always uses
  `%APPDATA%\Mine-imator\Bridge` as its temp folder.
- While a mouse drag is in progress in the app, commands still run. The app is a
  single-person desktop tool and the person can see and undo every change.

## Testing

- Unit tests (`npm test`): the transport client against a fake socket, tool
  tables and schemas, image attaching.
- Integration tests (`npm run test:app`): one shared app instance, in
  background mode, driven over the real socket by every file in `test/app`,
  then files in `test/app/isolated` that need their own launch. They assert by
  reading state back and by undoing. Test projects, downloaded test skins and
  the app's recent list and settings are cleaned up afterwards, and a killed run
  is healed by the next one. Player skins are served by a local stand-in for the
  skin service.
- Acceptance: character, camera and movie scenes exported through the bridge
  and inspected.

## Open risks

- Master reports version 2.0.2 and writes project format 34, like the official
  release. Opening a project saved by the custom build in the official app has
  not been tried.
- The upgrade-key state of the custom build has not been checked.
- Some stock paths still rely on `window_busy` states the bridge does not look
  at, so a command can land in the middle of a mouse drag.
