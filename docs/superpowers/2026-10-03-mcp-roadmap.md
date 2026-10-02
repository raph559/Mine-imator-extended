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

Since then: phase 1 (object settings, name lists), phase 2 (project settings
and the full background) and phase 3 (duplicate, copy keyframes and poses,
view camera, markers, loop region) and phase 4 (skins from files and by
player name, custom models, scenery files, images as shape textures, resource
listing and removal) and phase 5 (sounds, audio objects, sound in exported
movies, particle spawners from presets with their spawn settings, resource
values such as sound_obj in keyframes) are done. 43 tools. Bridge commands no longer let the app
open message boxes: errors come back in the reply, questions are answered no.

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
| 6. Hardening | Deferred review items, remaining dialog paths, image size cap, refreshed design spec | Done |

## Left over

Phase 6 fixed the review items: empty undo steps for a no-op `set_parent` and
`move_keyframes`, skins reused only when it is the very same file, an image size
cap for tool results, the app's message boxes (including the missing-model
dialog on open), a stuck "quiet" state after an app error, marker name length,
the sky image, and the design spec. Out-of-order replies are by design and are
now documented.

What is not done, in rough order of value:

- Importing a box of blocks from a Minecraft world. No world exists on the
  development machine to test with. The call sequence is known:
  `action_res_import_world` then `action_res_scenery_animate`, set
  `setting_world_import_filter_mode` too, and wait for `res.ready` as
  `import_scenery` does.
- Particle types, the per-type options of the app's particle editor. Spawners
  come from presets, and custom presets made in the app can be used by path.
- A drag in progress in the app is not detected; commands run regardless.
- Opening a project saved by the custom build in the official app, and the
  custom build's upgrade-key state, have not been checked.
- The loop region and repeat mode are not undoable, as in the app.
