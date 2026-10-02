# Mine-imator MCP

Controls a running Mine-imator through a local socket built into this fork.

## Run

1. Build once: `mcp/scripts/build.ps1` (needs the toolchain from `BUILD.md`). The app lands in `install/Mine-imator/`.
2. `cd mcp && npm install`
3. Start an MCP client in this repo; `.mcp.json` registers the `mineimator` server. Call `launch_app` first, or start `install/Mine-imator/Mine-imator.exe --bridge` yourself.

The socket listens on `127.0.0.1:41234` and only when the app is started with `--bridge` (or `MINEIMATOR_BRIDGE_PORT` is set). A normal launch opens nothing. In bridge mode the app uses its own temp folder (`%APPDATA%/Mine-imator/Bridge`), so it can run next to an official install.

## Tools

`launch_app`, `get_status`, `project_new`, `project_open`, `project_save`, `get_scene`, `get_object`, `create_object`, `remove_object`, `rename_object`, `set_parent`, `select_objects`, `undo`, `redo`, `set_frame`, `set_values`, `remove_keyframes`, `move_keyframe`, `set_work_camera`, `play`, `stop`, `screenshot`, `export_image`, `set_background`.

Every change goes through the app's own actions, so it shows up live and Ctrl+Z undoes it.

Conventions worth knowing: Z is up and 16 units are one block. A new character faces -Y. For camera objects, `rot_z` is the heading (0 looks along +Y, 90 along +X, clockwise seen from above) and positive `rot_x` pitches down.

## Environment

- `MINEIMATOR_BRIDGE_PORT`: port for both the app and the server. Default 41234.
- `MINEIMATOR_EXE`: path of the custom build. Default `install/Mine-imator/Mine-imator.exe`.

## Tests

- `npm test`: unit tests, no app needed.
- `npm run test:app`: integration tests. They start the custom build on port 41235 and open its window. Files run one at a time; run them with `npm run test:app`, not with several files passed to `node --test`.

## Protocol

One JSON object per line: `{"id": 1, "cmd": "get_status", "args": {}}` returns `{"id": 1, "ok": true, "result": {...}}` or `{"id": 1, "ok": false, "error": {"code": "...", "message": "..."}}`. Paths use forward slashes. Design notes: `docs/superpowers/specs/2026-10-02-mcp-bridge-design.md`.

## Known limits

- Exported images carry the "Created with Mine-imator" watermark (no tool option yet).
- `screenshot` includes the selection gizmos of the selected object; `export_image` does not.
- Camera values and `sky_time` are rounded to 3 decimals.
