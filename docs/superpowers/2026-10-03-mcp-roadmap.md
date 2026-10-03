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

## Left over (planned 2026-10-03)

Phase 6 fixed the review items: empty undo steps for a no-op `set_parent` and
`move_keyframes`, skins reused only when it is the very same file, an image size
cap for tool results, the app's message boxes (including the missing-model
dialog on open), a stuck "quiet" state after an app error, marker name length,
the sky image, and the design spec. Out-of-order replies are by design and are
now documented.

The upgrade key needs no work: the installed custom build finds the key file at
startup (its log says "Found key_file") and the key passes the app's own offline
check, so it behaves as the upgraded version.

Remaining, in order. Each item gets its own branch, tests in background mode,
and a question before commit and merge.

1. **Wait while the user drags (done).** A command that arrives while the person is
   dragging something with the mouse in the app (a gizmo, keyframes, a panel)
   waits until the button is released, instead of changing state under the
   cursor. Menus and popups do not count. After a minute it answers `busy`.
   Tested through a test-only command, enabled by an environment variable, that
   sets the drag state.
2. **`import_world` (done).** A box of blocks from a Minecraft world folder
   (`world_folder`, `dimension`, `from`, `to`, optional block filter), built
   like `import_scenery`. No world exists on this machine, so the test writes a
   tiny region file in the 1.18+ format. Risk: the importer may be stricter than
   the fixture; trying a real world later is still worthwhile.
   Call sequence: `action_res_import_world`, then `action_res_scenery_animate`,
   set `setting_world_import_filter_mode` as well, wait for `res.ready`.
3. **Particle types (done, with the exceptions below).** Table-driven (like the background settings): list a
   spawner's types and their settings in `get_object`, `set_particle_type`
   for any option with all-or-nothing validation and undo, and add, remove and
   duplicate types. Common options first (sprite or template, amount, speed,
   direction, gravity, colour, size, lifetime), then the random-range variants.
   About 114 actions and 140 options in total.
4. **Official app compatibility (offline part done).** Open a project saved by the custom build in
   the official app. The official app has no hidden mode, so this needs the
   person (or a quiet moment). Offline part first: compare a saved project's
   header and structure with one saved by the official app.

Dropped: undoing the loop region and repeat mode, which the app does not undo
either. Optional: an `upgraded` field in `get_status`.

Particle types are done for everything except what a type is made of: a sprite
sheet image (needs a way to import a particle sheet resource), a library object
or text as the particle. The built-in sprites work.

Upstream bugs found in Mine-imator itself while doing this. Two are fixed in the
fork (the sprite angle actions recorded the scale actions for undo, so undoing a
sprite angle edit changed the scale). Four are not touched, because the bridge
does not reach them: `action_lib_item_tex_material` and `action_lib_item_tex_normal`
record `action_lib_item_tex`, `action_lib_pc_spawn_region_path` records
`action_lib_pc_type_temp`, and `action_project_render_bend_style` records
`action_project_bend_style`. Undoing those would run the wrong action.

Item 4, what is known: a project saved by the custom build (Front flip) has the
same format number (34), the same created_in (2.0.2) and the same top-level and
nested section keys (project, render, background) as one saved by the official
app. The project save and load scripts are unchanged from upstream, so both
builds write the same format. The official project available for comparison was
empty, so timeline and template entries could not be compared field by field.
Not yet done: opening a custom-build project in the official app, which needs a
visible window (the official app has no hidden mode).
