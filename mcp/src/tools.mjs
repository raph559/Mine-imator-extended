import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

const id = z.string().min(1).describe("Object id, from get_scene or create_object");
const frame = z.number().int().min(0).describe("Timeline frame, 0 or more");
const overwrite = z.boolean().optional().describe("Replace the file if it already exists");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Mine-imator works with forward slashes in paths. */
export function normalizePath(p) {
  return p.replaceAll("\\", "/");
}

export const tools = [
  {
    name: "get_status",
    cmd: "get_status",
    description: "Report what Mine-imator is doing: version, open project, unsaved changes, current frame, playback, object count, undo steps, how many clients are connected to the bridge, and user_dragging (the person is dragging something with the mouse in the app: other commands wait for a moment, up to a minute, then answer busy). window_state is \"startup\" on the home screen and \"\" when a project is open.",
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
    description: "List every object in the project with its id, name, type, parent, selection and keyframe frames, and the timeline markers. A character's limbs are separate objects of type bodypart whose part_of is the character's id; pose a limb by setting values on that object.",
    shape: {},
  },
  {
    name: "get_object",
    cmd: "get_object",
    description: "Read one object: its settings, its values at the current frame and every keyframe with its values. Position, rotation and scale are always listed, other values only when they differ from the default.",
    shape: { id },
  },
  {
    name: "create_object",
    cmd: "create_object",
    description: "Create an object at the origin and select it. Returns its id. Characters come with body part objects (see get_scene). An audio object plays sounds: set sound_obj (a sound from import_sound) and sound_volume on its keyframes. A particles object is a spawner made from a preset such as Rain, Smoke or high_fire; its spawn settings are in set_object_settings and spawning is keyframed with the spawn value.",
    shape: {
      type: z.enum(["char", "character", "item", "block", "text", "cube", "cone", "cylinder", "sphere", "surface", "camera", "spotlight", "pointlight", "folder", "audio", "particles"]),
      name: z.string().optional().describe("Name shown in the timeline"),
      model: z.string().optional().describe("Character model name, e.g. human, zombie, skeleton, creeper (list_names kind character). Default human. Characters only"),
      skin: z.string().optional().describe("Full path of a skin PNG. Characters only"),
      preset: z.string().optional().describe("Particles only: a preset name (list_names kind particles), or the full path of a .miparticles file"),
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
    name: "set_object_settings",
    cmd: "set_object_settings",
    description: "Change settings of one object that are not keyframed: visibility, lock, rotation pivot, text, which item or block it shows, a shape's texture, render options and what it inherits from its parent. Only the given settings change, and nothing is applied if one is wrong. Each changed setting is an undo step (a pivot can be up to four, a particle limit two); the result gives undo_steps and the settings afterwards. pivot is in the object's own units and is the point of the model that sits at the object's position and that it rotates and scales around: setting it shifts the model, so add the same amount to its position to keep it in place (to spin a standing character around his middle: pivot [0, 0, 16] and pos_z 16).",
    shape: {
      id,
      settings: z
        .object({
          hidden: z.boolean(),
          locked: z.boolean(),
          ghost: z.boolean(),
          pivot: z.array(z.number()).length(3).nullable().describe("[x, y, z], or null for the default"),
          text: z.string().describe("Text objects only"),
          item: z.string().describe("Item objects only. A name from list_names kind item"),
          block: z.string().describe("Block objects only. A name from list_names kind block"),
          texture: z.string().nullable().describe("Shapes only. Id of an image from import_image, or null for none"),
          spawn_continuous: z.boolean().describe("Particles only: spawn all the time (true) or in bursts when spawn is keyframed on (false)"),
          spawn_amount: z.number().positive().describe("Particles only: particles per second when continuous, per burst otherwise"),
          spawn_region: z.enum(["none", "sphere", "cube", "box"]).describe("Particles only: where particles appear around the spawner"),
          spawn_sphere_radius: z.number().positive().describe("Particles only"),
          spawn_cube_size: z.number().positive().describe("Particles only"),
          spawn_box_size: z.array(z.number().positive()).length(3).describe("Particles only: [x, y, z]"),
          lifetime: z.number().positive().nullable().describe("Particles only: seconds before a particle disappears, or null for no limit"),
          max_particles: z.number().int().positive().nullable().describe("Particles only: oldest particles disappear above this many, or null for no limit"),
          remove_at_animation_end: z.boolean().describe("Particles only: remove particles whose sprite animation has ended"),
          shadows: z.boolean(),
          glow: z.boolean(),
          backfaces: z.boolean(),
          fog: z.boolean(),
          ssao: z.boolean(),
          texture_filtering: z.boolean(),
          texture_blur: z.boolean(),
          inherit_position: z.boolean(),
          inherit_rotation: z.boolean(),
          inherit_scale: z.boolean(),
          inherit_alpha: z.boolean(),
          inherit_color: z.boolean(),
          inherit_visibility: z.boolean(),
          inherit_bend: z.boolean(),
          inherit_texture: z.boolean(),
        })
        .partial()
        .strict()
        .describe("Setting name to value"),
    },
  },
  {
    name: "list_names",
    cmd: "list_names",
    description: "List the names Mine-imator accepts for items, blocks, character models or particle presets, for create_object and set_object_settings.",
    shape: { kind: z.enum(["item", "block", "character", "particles"]) },
  },
  {
    name: "undo",
    cmd: "undo",
    description: "Undo the last change, the same as Ctrl+Z in the app, or several at once with steps. Returns how many were undone; done is false when there was nothing to undo. Creating an object is one step, plus one if it was given a name.",
    shape: { steps: z.number().int().min(1).optional().describe("How many changes to undo. Default 1") },
  },
  {
    name: "redo",
    cmd: "redo",
    description: "Redo the last undone change, or several with steps. Returns how many were redone; done is false when there was nothing to redo.",
    shape: { steps: z.number().int().min(1).optional().describe("How many changes to redo. Default 1") },
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
    description: "Set values of one object at a frame, creating a keyframe there or editing the existing one. One undo step. Value names are lower case: pos_x pos_y pos_z, rot_x rot_y rot_z, sca_x sca_y sca_z, bend_angle_x, alpha, rgb_mul, cam_fov, light_strength, spawn (particles), sound_volume and so on (get_object shows the names in use). Colours are \"#RRGGBB\". Values that refer to a resource or object take its id, or null for none: sound_obj (a sound from import_sound), texture_obj (an image from import_image, or a camera for a live view), path_obj. Set transition (linear, instant, easeinquad, easeoutquad, easeinoutquad, easeinoutcubic, easeoutbounce, ...) to choose the easing from this keyframe to the next. Z is up; 16 units are one block. Rotation is in degrees. For cameras, rot_z is the heading: 0 looks along +Y, 90 along +X, 180 along -Y, and positive rot_x pitches down; a camera looking along +X has +Y on its right. Angles are interpolated numerically, so use -22 rather than 338 to turn the short way. A new character faces +Y. On a character, body or folder, positive rot_x tips the top forward (a front flip is rot_x 0 to 360); on a leg or arm, negative rot_x lifts it forward and positive bend_angle_x bends the knee. Rotation pivots at the object's origin (a character's feet) unless set_object_settings gives it another pivot.",
    shape: {
      id,
      frame: frame.optional().describe("Frame to keyframe at. Default: the current frame"),
      values: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])).describe("Value name to value"),
    },
  },
  {
    name: "set_keyframes",
    cmd: "set_keyframes",
    description: "Set many keyframes in one call: a list of {id, frame, values}, across any objects and frames. Prefer this over repeated set_values when animating. Values follow the same rules as set_values. Every entry is checked first and nothing is applied if one is wrong. Each keyframe is its own undo step; the result's undo_steps is the number to pass to undo to take the whole batch back. The timeline marker is left where it was.",
    shape: {
      keyframes: z
        .array(z.object({ id, frame, values: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])) }))
        .min(1)
        .describe("Keyframes to set, applied in order"),
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
    description: "Capture the main 3D view as it is drawn in the app right now and return the image. Fast; use it to check your work. Selection gizmos of the selected object are included.",
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
    name: "export_movie",
    cmd: "export_movie",
    description: "Render the timeline to a video file through the scene's camera, using the app's own movie export. The format follows the file extension: .mp4, .mov or .wmv. Answers when the file is written, which can take minutes; get_status shows export_frame of export_frames meanwhile, and other commands wait until it is done.",
    shape: {
      path: z.string().min(1).describe("Where to save the video, ending in .mp4, .mov or .wmv"),
      overwrite,
      start_frame: frame.optional().describe("First frame. Default 0"),
      end_frame: frame.optional().describe("Last frame. Default: the end of the timeline"),
      frame_rate: z.number().int().min(1).max(120).optional().describe("Frames per second of the video. Default: the project's tempo, so one timeline frame is one video frame"),
      bit_rate: z.number().int().positive().optional().describe("Video bit rate. Default: the app's current export setting"),
      high_quality: z.boolean().optional().describe("Use the full renderer (shadows, effects). Default true"),
      include_audio: z.boolean().optional().describe("Include the project's audio tracks. Default true"),
      include_hidden: z.boolean().optional().describe("Also render hidden objects. Default false"),
    },
    paths: ["path"],
    timeoutMs: 3660000,
  },
  {
    name: "set_background",
    cmd: "set_background",
    description: "Change the scene's background: sky, sun and moon, clouds, a sky image, fog, wind, ground and tint colours. Only the given settings change, and nothing is applied if one is wrong. Returns every background setting afterwards, plus undo_steps (one per setting that changed). Call it with no settings to just read them.",
    shape: {
      sky_time: z.number().optional().describe("Time of day, the same number as the Time setting in the Background tab (default -45)"),
      sky_rotation: z.number().optional(),
      sunlight_strength: z.number().optional().describe("1 is normal strength"),
      sunlight_angle: z.number().optional(),
      sky_sun_angle: z.number().optional(),
      sky_sun_scale: z.number().optional().describe("1 is normal size"),
      sky_moon_angle: z.number().optional(),
      sky_moon_scale: z.number().optional().describe("1 is normal size"),
      sky_clouds_speed: z.number().optional(),
      sky_clouds_height: z.number().optional(),
      sky_clouds_size: z.number().optional(),
      sky_clouds_thickness: z.number().optional(),
      sky_clouds_offset: z.number().optional(),
      fog_distance: z.number().optional(),
      fog_size: z.number().optional(),
      fog_height: z.number().optional(),
      wind_speed: z.number().optional(),
      wind_strength: z.number().optional(),
      wind_direction: z.number().optional(),
      sky_clouds_show: z.boolean().optional(),
      fog_show: z.boolean().optional(),
      fog_sky: z.boolean().optional(),
      fog_color_custom: z.boolean().optional().describe("Use fog_color instead of the sky colour for fog"),
      twilight: z.boolean().optional(),
      wind: z.boolean().optional(),
      ground_show: z.boolean().optional().describe("Show the ground plane"),
      sky_color: hexColor.optional(),
      sky_clouds_color: hexColor.optional(),
      sunlight_color: hexColor.optional(),
      ambient_color: hexColor.optional(),
      night_color: hexColor.optional(),
      grass_color: hexColor.optional(),
      foliage_color: hexColor.optional(),
      water_color: hexColor.optional(),
      fog_color: hexColor.optional(),
      sky_moon_phase: z.number().int().min(0).max(7).optional(),
      biome: z.string().optional().describe("Biome name, e.g. plains, desert"),
      image: z.string().nullable().optional().describe("Sky image: id of an image from import_image, or null for none. Also set image_show"),
      image_type: z.enum(["image", "sphere"]).optional().describe("A flat picture behind the scene, or wrapped around it as a sphere"),
      image_stretch: z.boolean().optional().describe("Stretch a flat image to the whole view"),
      image_show: z.boolean().optional().describe("Show the sky image"),
      image_rotation: z.number().optional().describe("Rotation of the sky image in degrees"),
    },
  },
  {
    name: "get_project_settings",
    cmd: "get_project_settings",
    description: "Read the project's settings: name, tempo (timeline frames per second), video resolution, render options, every background setting, and the play region and repeat mode (loop).",
    shape: {},
  },
  {
    name: "set_project_settings",
    cmd: "set_project_settings",
    description: "Change the project's tempo, video resolution and render options. Only the given settings change, and nothing is applied if one is wrong. Returns the settings afterwards, plus undo_steps. Exports use this resolution. Setting only the width or only the height keeps the aspect ratio if the project has that lock on; setting both applies them exactly. render_preset replaces the individual render options, so it is applied first.",
    shape: {
      settings: z
        .object({
          tempo: z.number().min(1).max(100).describe("Timeline frames per second"),
          video_width: z.number().int().min(1).max(8192),
          video_height: z.number().int().min(1).max(8192),
          render_preset: z.string().describe("performance, balanced or extreme"),
          render_samples: z.number().int().min(1).max(256).describe("Samples for high quality renders; more is smoother and slower"),
          render_shadows: z.boolean(),
          render_ssao: z.boolean().describe("Ambient occlusion"),
          render_glow: z.boolean(),
          render_aa: z.boolean().describe("Anti-aliasing"),
          render_indirect: z.boolean().describe("Indirect lighting"),
          render_reflections: z.boolean(),
        })
        .partial()
        .strict()
        .describe("Setting name to value"),
    },
  },
  {
    name: "duplicate_object",
    cmd: "duplicate_object",
    description: "Duplicate an object with its children, body parts and keyframes, like Duplicate in the timeline. The copy is placed next to the original under the same parent and selected. Returns the copy (its id, name, type and keyframe frames). One undo step. Body parts cannot be duplicated on their own.",
    shape: { id },
  },
  {
    name: "copy_keyframes",
    cmd: "copy_keyframes",
    description: "Copy keyframes to another frame, through the app's copy and paste: the keyframes of an object between frame and end_frame (default: just frame), together with its body parts' keyframes when it is a character, so a whole pose is copied at once. They land at to_frame plus their distance from frame, on the same object or on to_id. A character's pose goes to the body parts of the same name on the target character; a single body part goes to the matching part of to_id. Keyframes already at the target frames are replaced. Nothing is changed if the copy cannot be done. Returns copied, replaced and undo_steps (1, or 2 when keyframes were replaced). Use it to repeat a pose, hold a pose or loop a cycle.",
    shape: {
      id,
      frame: frame.describe("First frame to copy from"),
      end_frame: frame.optional().describe("Last frame to copy from. Default: frame"),
      to_frame: frame.describe("Frame where the keyframe at frame lands"),
      to_id: z.string().min(1).optional().describe("Object to copy to. Default: the same object"),
    },
  },
  {
    name: "set_view_camera",
    cmd: "set_view_camera",
    description: "Choose what the main view looks through: \"work\" (the free editing camera, see set_work_camera), \"active\" (the scene's active camera) or the id of a camera object, to see the shot as it will render. screenshot captures the view as chosen. get_status reports it as view_camera.",
    shape: { camera: z.string().min(1).describe("work, active, or a camera object's id") },
  },
  {
    name: "set_marker",
    cmd: "set_marker",
    description: "Add a timeline marker at a frame, or change the marker already there: its name, colour, or frame (to_frame moves it). Markers label moments such as a jump or a hit; get_scene lists them. Only the given fields change. Returns the marker and undo_steps.",
    shape: {
      frame,
      name: z.string().optional(),
      color: z.enum(["red", "orange", "yellow", "green", "forest_green", "teal", "blue", "purple", "pink"]).optional().describe("Default red"),
      to_frame: frame.optional().describe("Move the existing marker to this frame"),
    },
  },
  {
    name: "remove_marker",
    cmd: "remove_marker",
    description: "Remove the timeline marker at a frame.",
    shape: { frame },
  },
  {
    name: "set_loop",
    cmd: "set_loop",
    description: "Set the timeline's play region (start and end frames), clear it, and choose whether playback repeats: off, repeat, or seamless (for loops whose last frame matches the first). With repeat on, playback loops inside the region, or over the whole animation when there is none. Movie exports use the region when one is set. get_project_settings reports it as loop. Not undone by undo, as in the app.",
    shape: {
      start: frame.optional().describe("First frame of the region; give end too"),
      end: frame.optional().describe("Last frame of the region, after start"),
      clear: z.boolean().optional().describe("Remove the region"),
      repeat: z.enum(["off", "repeat", "seamless"]).optional(),
    },
  },
  {
    name: "set_skin",
    cmd: "set_skin",
    description: "Give a character (or a special block or custom model) a skin: either a PNG file, or a Minecraft player's skin downloaded by player name (kept in Mine-imator's Skins folder, like the app's Download skin). A body part's id stands for its character. Duplicated objects share their skin. Returns the object id, the skin's resource id and undo_steps (1). get_object shows the skin in settings.skin, null for the model's default.",
    shape: {
      id,
      path: z.string().min(1).describe("Full path of a skin PNG (64x64 or 64x32 for players)").optional(),
      player: z.string().regex(/^[A-Za-z0-9_]{1,16}$/).optional().describe("Minecraft player name, to download that player's skin"),
    },
    paths: ["path"],
    timeoutMs: 60000,
  },
  {
    name: "import_model",
    cmd: "import_model",
    description: "Add a custom .mimodel model (for example made in Blockbench) to the scene as an object, with its texture from the same folder. Its parts become separate objects (part_of is the model's id, part is the part name) that can be posed and animated like a character's limbs. A broken file is refused and nothing is added. Returns the new object.",
    shape: {
      path: z.string().min(1).describe("Full path of the .mimodel file"),
      name: z.string().optional().describe("Name shown in the timeline"),
    },
    paths: ["path"],
  },
  {
    name: "import_scenery",
    cmd: "import_scenery",
    description: "Add a building or terrain saved as a .schematic, .nbt (structure block) or .blocks file to the scene as a scenery object, and wait until the app has built it. Mine-imator ships some under its Schematics folder. Returns the new object and its size in blocks [x, y, z]. A broken file is refused and nothing is added.",
    shape: {
      path: z.string().min(1).describe("Full path of the .schematic, .nbt or .blocks file"),
      name: z.string().optional().describe("Name shown in the timeline"),
      block_objects: z.boolean().optional().describe("Also add animatable objects for special blocks such as doors and chests. Default false"),
    },
    paths: ["path"],
    timeoutMs: 600000,
  },
  {
    name: "import_world",
    cmd: "import_world",
    description: "Add a box of blocks from a Minecraft world (a save folder from .minecraft/saves) to the scene as a scenery object, and wait until the app has built it. from and to are Minecraft block coordinates [x, y, z] with y up, as the F3 screen shows them: from is included, to is not, and each side can be at most 1024 blocks. only_blocks keeps just those blocks, exclude_blocks leaves them out (names from list_names kind block). Returns the new object and its size. Refuses worlds without region files and boxes without blocks, and then adds nothing. Two undo steps.",
    shape: {
      world_folder: z.string().min(1).describe("Full path of the world folder (the one with level.dat), or of a region folder"),
      dimension: z.enum(["overworld", "nether", "end"]).optional().describe("Default overworld"),
      from: z.array(z.number().int()).length(3).describe("One corner of the box, included"),
      to: z.array(z.number().int()).length(3).describe("The opposite corner, not included. Above from on every axis"),
      name: z.string().optional().describe("Name shown in the timeline"),
      only_blocks: z.array(z.string()).optional().describe("Keep only these blocks"),
      exclude_blocks: z.array(z.string()).optional().describe("Leave these blocks out"),
    },
    paths: ["world_folder"],
    timeoutMs: 600000,
  },
  {
    name: "import_image",
    cmd: "import_image",
    description: "Add a PNG or JPEG image to the project as a texture resource. Returns the resource (id, type, name, file, used). Put it on a shape with set_object_settings texture.",
    shape: { path: z.string().min(1).describe("Full path of the image") },
    paths: ["path"],
  },
  {
    name: "import_sound",
    cmd: "import_sound",
    description: "Add a WAV, OGG or MP3 file to the project as a sound, and wait until the app has decoded it. Returns the resource. Play it with an audio object (create_object type audio) by setting sound_obj on a keyframe; sound_volume, sound_pitch, sound_start and sound_end tune it. Exported movies include it unless include_audio is false.",
    shape: { path: z.string().min(1).describe("Full path of the sound file") },
    paths: ["path"],
    timeoutMs: 600000,
  },
  {
    name: "list_resources",
    cmd: "list_resources",
    description: "List the files the project uses: skins, downloaded skins, models, scenery, textures, packs, sounds and so on, each with its id, type, name, file and whether anything uses it. The built-in Minecraft pack is listed as id default.",
    shape: {},
  },
  {
    name: "remove_resource",
    cmd: "remove_resource",
    description: "Remove a resource from the project, like deleting it in the Resources tab. Objects that used it go back to their default. One undo step.",
    shape: { id: z.string().min(1).describe("Resource id, from list_resources") },
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
