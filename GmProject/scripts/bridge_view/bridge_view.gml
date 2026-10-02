/// bridge_output_path_error(filename, overwrite)
/// @arg filename
/// @arg overwrite
/// @desc Returns why an image cannot be written to the path, or "" if it can.

function bridge_output_path_error(fn, overwrite)
{
	if (string_lower(filename_ext(fn)) != ".png")
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

	if (ds_map_exists(args, "focus"))
	{
		focus = args[?"focus"]
		cam_work_focus = point3D(bridge_real(focus[|0]), bridge_real(focus[|1]), bridge_real(focus[|2]))
	}
	if (ds_map_exists(args, "angle_xy"))
	{
		cam_work_angle_xy = bridge_real(args[?"angle_xy"])
		cam_work_angle_goal_xy = cam_work_angle_xy
	}
	if (ds_map_exists(args, "angle_z"))
	{
		cam_work_angle_z = clamp(bridge_real(args[?"angle_z"]), -89.9, 89.9)
		cam_work_angle_goal_z = cam_work_angle_z
	}
	if (ds_map_exists(args, "zoom"))
	{
		cam_work_zoom = bridge_real(args[?"zoom"])
		cam_work_zoom_goal = cam_work_zoom
	}
	cam_work_angle_look_xy = cam_work_angle_xy
	cam_work_angle_look_z = -cam_work_angle_z
	camera_work_set_from()

	result = ds_map_create()
	focuslist = ds_list_create()
	ds_list_add(focuslist, bridge_real(cam_work_focus[X]), bridge_real(cam_work_focus[Y]), bridge_real(cam_work_focus[Z]))
	ds_map_add_list(result, "focus", focuslist)
	// The app re-derives these from the camera position every step, which leaves float noise
	result[?"angle_xy"] = bridge_real(cam_work_angle_xy)
	result[?"angle_z"] = bridge_real(cam_work_angle_z)
	result[?"zoom"] = bridge_real(cam_work_zoom)
	return bridge_ok(result)
}

/// bridge_playback_result()

function bridge_playback_result()
{
	var result = ds_map_create();
	result[?"playing"] = (timeline_playing > 0)
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
	if (!is_string(bridge_arg(args, "path", "")))
		return bridge_error("bad_args", "path must be a string")

	fn = string(bridge_arg(args, "path", ""))
	err = bridge_output_path_error(fn, (bridge_arg(args, "overwrite", false) > 0))
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
	if (!is_string(bridge_arg(args, "path", "")))
		return bridge_error("bad_args", "path must be a string")

	fn = string(bridge_arg(args, "path", ""))
	err = bridge_output_path_error(fn, (bridge_arg(args, "overwrite", false) > 0))
	if (err != "")
		return bridge_error("bad_args", err)

	if (timeline_playing)
		action_tl_play()
	if (file_exists_lib(fn))
		file_delete_lib(fn)

	// Same as action_toolbar_exportimage_save
	export_filename = fn
	popup_exportimage.high_quality = (bridge_arg(args, "high_quality", true) > 0)
	render_hidden = (bridge_arg(args, "include_hidden", false) > 0)
	render_background = !(bridge_arg(args, "remove_background", false) > 0)
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
	if (ds_map_exists(args, "sky_color") && !bridge_is_hex_color(args[?"sky_color"]))
		return bridge_error("bad_args", "sky_color must be a color like #RRGGBB")
	if (ds_map_exists(args, "biome"))
	{
		if (!is_string(args[?"biome"]))
			return bridge_error("bad_args", "biome must be a string")
		if (find_biome(string(args[?"biome"])) = null)
			return bridge_error("not_found", "Unknown biome " + string(args[?"biome"]))
	}

	if (ds_map_exists(args, "sky_time"))
		action_background_sky_time(bridge_real(args[?"sky_time"]), false)
	if (ds_map_exists(args, "ground_show"))
		action_background_ground_show((args[?"ground_show"] > 0))
	if (ds_map_exists(args, "sky_color"))
		action_background_sky_color(hex_to_color(string(args[?"sky_color"])))
	if (ds_map_exists(args, "biome"))
		action_background_biome(string(args[?"biome"]))

	result = ds_map_create()
	result[?"sky_time"] = background_sky_time
	result[?"ground_show"] = (background_ground_show > 0)
	result[?"biome"] = background_biome
	result[?"sky_color"] = "#" + color_to_hex(background_sky_color)
	return bridge_ok(result)
}
