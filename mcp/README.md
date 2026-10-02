# Mine-imator MCP

Controls a running Mine-imator through a local socket built into this fork.

## Run

1. Build once: `mcp/scripts/build.ps1` (needs the toolchain from `BUILD.md`). The app lands in `install/Mine-imator/`.
2. `cd mcp && npm install`
3. Optional: put the build into an existing Mine-imator install with `mcp/scripts/deploy.ps1 -Target <install folder>` (or set `MINEIMATOR_HOME`). It copies only the program files that changed and leaves projects, skins, settings, the upgrade key and the recent list alone. Then set `MINEIMATOR_EXE` to that install's `Mine-imator.exe` so `launch_app` starts it.
4. Start an MCP client in this repo; `.mcp.json` registers the `mineimator` server. Call `launch_app` first, or start `install/Mine-imator/Mine-imator.exe --bridge` yourself.

The bridge listens on `127.0.0.1:41234` and is closed until you ask for it, in one of three ways:

- the **MCP** menu in the app's toolbar (next to Help): it shows whether the bridge is running, the port and how many clients are connected, and has Start / Stop;
- the **Start automatically with Mine-imator** tick box in that menu;
- the `--bridge` launch flag, which is what `launch_app` uses.

A small dot on the MCP button shows that it is running. Toasts announce when it starts, stops, or cannot open its port. This build always uses its own temp folder (`%APPDATA%/Mine-imator/Bridge`), so it can run next to an official install.

## Tools

`launch_app`, `get_status`, `project_new`, `project_open`, `project_save`, `get_scene`, `get_object`, `create_object`, `remove_object`, `rename_object`, `set_parent`, `select_objects`, `set_object_settings`, `list_names`, `undo`, `redo`, `set_frame`, `set_values`, `set_keyframes`, `remove_keyframes`, `move_keyframe`, `set_work_camera`, `play`, `stop`, `screenshot`, `export_image`, `export_movie`, `set_background`, `get_project_settings`, `set_project_settings`, `duplicate_object`, `copy_keyframes`, `set_view_camera`, `set_marker`, `remove_marker`, `set_loop`, `set_skin`, `import_model`, `import_scenery`, `import_image`, `list_resources`, `remove_resource`, `import_sound`.

Every change goes through the app's own actions, so it shows up live and Ctrl+Z undoes it.

Conventions worth knowing: Z is up and 16 units are one block. A new character faces +Y. For camera objects, `rot_z` is the heading (0 looks along +Y, 90 along +X; a camera looking along +X has +Y on its right) and positive `rot_x` pitches down. On a character, body or folder, positive `rot_x` tips the top forward; on a leg or arm, negative `rot_x` lifts it forward and positive `bend_angle_x` bends the knee. Rotation pivots at the object's origin (a character's feet) unless `set_object_settings` gives it another pivot: to spin a character around its middle, use pivot `[0, 0, 16]` and `pos_z` 16.

## Environment

- `MINEIMATOR_BRIDGE_PORT`: port for both the app and the server. Default 41234. Setting it does not start the bridge.
- `MINEIMATOR_EXE`: path of the custom build. Default `install/Mine-imator/Mine-imator.exe`.

## Tests

- `npm test`: unit tests, no app needed.
- `npm run test:app`: integration tests against the real app, on port 41235. The app is started with `--background`, which keeps its window off screen and never takes the focus, so a run does not disturb whoever is using the computer. One instance is started and shared by every file in `test/app`; the files in `test/app/isolated` then start their own, because they test launch conditions. A full run opens the app three times. Test projects are created under `%TEMP%/mi-bridge-tests` and deleted when the run ends, and the app's recent-project list and settings are put back as they were. If a run is killed before it can clean up, the next run does it first. A single file can also be run on its own (`node --test test/app/04-objects.test.mjs`) and then starts its own instance.

## Protocol

One JSON object per line: `{"id": 1, "cmd": "get_status", "args": {}}` returns `{"id": 1, "ok": true, "result": {...}}` or `{"id": 1, "ok": false, "error": {"code": "...", "message": "..."}}`. Replies carry the id of their request and may arrive out of order (`get_status` is answered while another command waits), so match on id; a line that is not valid JSON gets a reply with a null id. Paths use forward slashes. Design notes: `docs/superpowers/specs/2026-10-02-mcp-bridge-design.md`.

## Known limits

- Exported images carry the "Created with Mine-imator" watermark (no tool option yet).
- `screenshot` includes the selection gizmos of the selected object; `export_image` does not.
- Camera values and `sky_time` are rounded to 3 decimals.
- The bridge never lets the app open a message box while a command runs: errors come back in the reply (or as a `warning` when the command still succeeded) and questions are answered no. So `project_open` also opens a project whose model files are missing, without a dialog.
- `screenshot` and `export_image` attach the picture to the tool result only up to 3 MB; a bigger one stays at its path and the result says so.
- Importing a box from a Minecraft world is not available.
- Commands run even while the person is dragging something with the mouse in the app.
- While an export is running only `get_status` is answered; other commands wait for it. An export that takes longer than 10 minutes (`MINEIMATOR_BRIDGE_PENDING_TIMEOUT_MS` overrides) is answered with `timeout` and keeps running.

## Developing the bridge

- New command: add `bridge_cmd_<name>` in a `GmProject/scripts/bridge_*` script (create one with `mcp/scripts/add-gml-script.ps1 <name>`), add a `case` in `bridge_dispatch_command` (`bridge_core.gml`), then a tool in `mcp/src/tools.mjs`. Rebuild with `mcp/scripts/build.ps1` (about a minute); the C++ is regenerated from the GML.
- CppGen infers C++ types from every assignment and call site. A value that came from the request (`bridge_arg(...)` is a variant) must be converted before it reaches an app variable or app function: `string(x)` for text, `bridge_real(x)` or `round(x)` for numbers, `(x > 0)` for booleans. Otherwise the app's typed variable widens to a variant and unrelated stock files stop compiling (for example `C2666` in `AudioFunc.cpp`).
- Booleans are plain numbers inside the app; reply with `(x > 0)` so JSON gets `true`/`false`.
- Validate everything before changing anything. `error()` and `question()` are silenced while a command runs, but other stock scripts that open a dialog (`show_message*`, `file_dialog_*`) must still not be called, and a file that the app would load as an empty thing instead of failing (a PNG that is not a PNG) must be checked first. Anything that loads over several frames returns `pending: true` and finishes in `bridge_pending_poll`.
