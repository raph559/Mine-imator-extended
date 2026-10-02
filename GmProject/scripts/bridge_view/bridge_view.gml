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

	// Same as action_toolbar_exportimage_save. The dialog's own setting is put back by bridge_pending_poll
	bridge_saved_image_hq = popup_exportimage.high_quality
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

	bridge_pending_kind = "image"
	bridge_pending_path = fn
	res = bridge_ok(ds_map_create())
	res[?"pending"] = true
	return res
}

/// bridge_cmd_export_movie(args)
/// @arg args
/// @desc Starts the movie export without its dialogs. The reply is sent by bridge_pending_poll once the file is written.

function bridge_cmd_export_movie(args)
{
	var fn, fmt, startframe, endframe, fps, bitrate, res;
	if (!is_string(bridge_arg(args, "path", "")))
		return bridge_error("bad_args", "path must be a string")

	fn = string(bridge_arg(args, "path", ""))
	fmt = string_delete(string_lower(filename_ext(fn)), 1, 1)
	if (fmt != "mp4" && fmt != "mov" && fmt != "wmv")
		return bridge_error("bad_args", "path must be a file name ending in .mp4, .mov or .wmv")
	if (!directory_exists_lib(filename_dir(fn)))
		return bridge_error("bad_args", "The folder does not exist: " + filename_dir(fn))
	if (file_exists_lib(fn) && !(bridge_arg(args, "overwrite", false) > 0))
		return bridge_error("bad_args", "The file already exists, pass overwrite: true to replace it")

	if (!is_real(bridge_arg(args, "start_frame", 0)) || bridge_arg(args, "start_frame", 0) < 0 || !is_real(bridge_arg(args, "end_frame", 0)))
		return bridge_error("bad_args", "start_frame and end_frame must be frame numbers of 0 or more")
	startframe = round(bridge_arg(args, "start_frame", 0))
	endframe = round(bridge_arg(args, "end_frame", timeline_length))
	if (endframe <= startframe)
		return bridge_error("bad_args", "There is nothing to export: end_frame must be after start_frame")

	if (!is_real(bridge_arg(args, "frame_rate", 1)) || bridge_arg(args, "frame_rate", 1) < 1 || bridge_arg(args, "frame_rate", 1) > 120)
		return bridge_error("bad_args", "frame_rate must be a number from 1 to 120")
	fps = round(bridge_arg(args, "frame_rate", project_tempo))

	if (!is_real(bridge_arg(args, "bit_rate", 1)) || bridge_arg(args, "bit_rate", 1) < 1)
		return bridge_error("bad_args", "bit_rate must be a number above 0")
	bitrate = round(bridge_arg(args, "bit_rate", popup_exportmovie.bit_rate))

	if (timeline_playing)
		action_tl_play()
	if (file_exists_lib(fn))
		file_delete_lib(fn)

	// The export reads its settings from the export movie popup. Use ours, bridge_pending_poll puts the user's back
	bridge_saved_movie_format = popup_exportmovie.format
	bridge_saved_movie_fps = popup_exportmovie.framespersecond
	bridge_saved_movie_bit_rate = popup_exportmovie.bit_rate
	bridge_saved_movie_audio = popup_exportmovie.include_audio
	bridge_saved_movie_hq = popup_exportmovie.high_quality
	bridge_saved_movie_hidden = popup_exportmovie.include_hidden
	popup_exportmovie.format = fmt
	popup_exportmovie.framespersecond = fps
	popup_exportmovie.bit_rate = bitrate
	popup_exportmovie.include_audio = (bridge_arg(args, "include_audio", true) > 0)
	popup_exportmovie.high_quality = (bridge_arg(args, "high_quality", true) > 0)
	popup_exportmovie.include_hidden = (bridge_arg(args, "include_hidden", false) > 0)

	bridge_pending_kind = "movie"
	bridge_pending_path = fn
	bridge_pending_frames = floor(((endframe - startframe) / project_tempo) * fps) + 1
	bridge_pending_fps = fps

	if (!exportmovie_begin(fn, startframe, endframe))
	{
		bridge_export_restore()
		return bridge_error("io_error", "The movie encoder could not start for " + fn)
	}

	res = bridge_ok(ds_map_create())
	res[?"pending"] = true
	res[?"pending_timeout_ms"] = 3600000 // A movie can take a while
	return res
}

/// bridge_export_restore()
/// @desc Puts back the export popup settings that a bridge export replaced.

function bridge_export_restore()
{
	if (bridge_pending_kind = "movie")
	{
		popup_exportmovie.format = bridge_saved_movie_format
		popup_exportmovie.framespersecond = bridge_saved_movie_fps
		popup_exportmovie.bit_rate = bridge_saved_movie_bit_rate
		popup_exportmovie.include_audio = bridge_saved_movie_audio
		popup_exportmovie.high_quality = bridge_saved_movie_hq
		popup_exportmovie.include_hidden = bridge_saved_movie_hidden
	}
	else
		popup_exportimage.high_quality = bridge_saved_image_hq
}

/// bridge_export_poll()
/// @desc Returns the response map of a command that finishes over several steps, or -1 while it is still running.

function bridge_export_poll()
{
	var result;
	if (window_state = "export_image" || window_state = "export_movie")
		return -1

	bridge_export_restore()

	if (!file_exists_lib(bridge_pending_path))
		return bridge_error("io_error", "The export finished but no file was written to " + bridge_pending_path)

	result = ds_map_create()
	result[?"path"] = bridge_pending_path
	result[?"width"] = project_video_width
	result[?"height"] = project_video_height
	if (bridge_pending_kind = "movie")
	{
		result[?"frames"] = bridge_pending_frames
		result[?"frame_rate"] = bridge_pending_fps
		result[?"seconds"] = bridge_real(bridge_pending_frames / bridge_pending_fps)
	}
	return bridge_ok(result)
}
