# Mine-imator MCP roadmap

Date: 2026-10-03

## What "finished" means

Anything a person would do by hand for a typical animation can be done through
the MCP. Not every button in the app: Mine-imator has about 780 internal
actions and most are variations of the same few kinds.

## Where it stands

Done: opt-in bridge with an MCP menu in the app, project new/open/save, reading
the scene, creating and arranging objects, keyframing (single and batch),
undo/redo, work camera, playback, screenshot, image export, movie export,
background basics. 26 tools.

## Phases

Each phase ends with tests, a rebuild, and a deploy to the installed app. The
detailed design for a phase is written when that phase starts, not before:
code written against this app without compiling it needs adjusting, and real
use reorders priorities.

| Phase | Adds | Size and risk |
|---|---|---|
| 1. Object settings | Rotation pivot, text content, item and block choice, visibility and lock, other per-object options that are not keyframes | About one session. Low risk: plain setters with existing actions |
| 2. Project settings | Tempo, resolution, render quality, the rest of the background options | About one session. Low risk |
| 3. Editing helpers | Duplicate objects, copy a pose between frames, look through the scene camera, markers and loop region | About one session. Low risk |
| 4. Assets | Skins by player name, custom models, scenery and world import, listing resources | Larger. These paths use dialogs and load in the background; investigate before designing |
| 5. Particles and audio | Particle spawners, sound tracks | Larger. Audio also closes the untested gap in movie export |
| 6. Hardening | Deferred review items, remaining dialog paths, image size cap, refreshed design spec | Small; can be spread across the other phases |

## Known loose ends (phase 6)

- `set_parent` to itself or a descendant, and `move_keyframes` with from equal
  to to, leave an empty undo step.
- Error replies can overtake earlier queued replies; a request without an id
  gets a reply without one.
- A skin with the same file name as a loaded one is reused even if it is a
  different file.
- The dispatcher ignores `window_busy`, so state can change under a user who is
  mid-drag.
- Exported and screenshot images are returned in full, with no size cap.
- A project with missing model files can still raise a dialog on open.
- Audio in exported movies is untested.
- The design spec in `specs/` still describes the bridge as launch-flag only.
