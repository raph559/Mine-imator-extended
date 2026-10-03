/// bridge_dispatch(cmd, argsjson)
/// @arg cmd
/// @arg argsjson
/// @desc Runs one command from the automation bridge. Returns a response map
/// holding "ok" and either "result" or "error". The caller destroys the map.

function bridge_dispatch(cmd, argsjson)
{
	var args, res;
	args = json_decode(argsjson)
	if (args < 0)
		return bridge_error("bad_request", "args must be a JSON object")

	// Message boxes would block the app until someone clicks them: errors are sent back instead
	// A load a command started may still be running (get_status is answered meanwhile): keep its error
	bridge_quiet = true
	if (current_time >= bridge_quiet_until)
		bridge_quiet_message = ""

	if (cmd = "get_status")
		res = bridge_cmd_get_status(args)
	else if (window_state != "" && window_state != "startup")
		res = bridge_error("busy", "Mine-imator is busy: " + window_state)
	else
		res = bridge_dispatch_command(cmd, args)

	// An error the app raised while the command still succeeded
	if (bridge_quiet_message != "" && res[?"ok"] && current_time >= bridge_quiet_until)
	{
		var result = res[?"result"];
		result[?"warning"] = bridge_quiet_message
		bridge_quiet_message = ""
	}
	bridge_quiet = false

	ds_map_destroy(args)
	return res
}

/// bridge_dispatch_command(cmd, args)
/// @arg cmd
/// @arg args

function bridge_dispatch_command(cmd, args)
{
	if (cmd = "project_new")
		return bridge_cmd_project_new(args)
	if (cmd = "project_open")
		return bridge_cmd_project_open(args)

	// Only the commands above work from the home screen
	if (window_state = "startup")
		return bridge_error("no_project", "No project is open. Call project_new or project_open first")

	switch (cmd)
	{
		case "project_save": return bridge_cmd_project_save(args)
		case "get_scene": return bridge_cmd_get_scene(args)
		case "get_object": return bridge_cmd_get_object(args)
		case "create_object": return bridge_cmd_create_object(args)
		case "remove_object": return bridge_cmd_remove_object(args)
		case "rename_object": return bridge_cmd_rename_object(args)
		case "set_parent": return bridge_cmd_set_parent(args)
		case "select": return bridge_cmd_select(args)
		case "set_object_settings": return bridge_cmd_set_object_settings(args)
		case "list_names": return bridge_cmd_list_names(args)
		case "set_frame": return bridge_cmd_set_frame(args)
		case "set_values": return bridge_cmd_set_values(args)
		case "set_keyframes": return bridge_cmd_set_keyframes(args)
		case "remove_keyframes": return bridge_cmd_remove_keyframes(args)
		case "move_keyframes": return bridge_cmd_move_keyframes(args)
		case "set_work_camera": return bridge_cmd_set_work_camera(args)
		case "play": return bridge_cmd_play(args)
		case "stop": return bridge_cmd_stop(args)
		case "screenshot": return bridge_cmd_screenshot(args)
		case "export_image": return bridge_cmd_export_image(args)
		case "export_movie": return bridge_cmd_export_movie(args)
		case "set_background": return bridge_cmd_set_background(args)
		case "get_project_settings": return bridge_cmd_get_project_settings(args)
		case "set_project_settings": return bridge_cmd_set_project_settings(args)
		case "duplicate_object": return bridge_cmd_duplicate_object(args)
		case "copy_keyframes": return bridge_cmd_copy_keyframes(args)
		case "set_view_camera": return bridge_cmd_set_view_camera(args)
		case "set_marker": return bridge_cmd_set_marker(args)
		case "remove_marker": return bridge_cmd_remove_marker(args)
		case "set_loop": return bridge_cmd_set_loop(args)
		case "set_skin": return bridge_cmd_set_skin(args)
		case "test_set_drag": return bridge_cmd_test_set_drag(args)
		case "import_model": return bridge_cmd_import_model(args)
		case "import_scenery": return bridge_cmd_import_scenery(args)
		case "import_image": return bridge_cmd_import_image(args)
		case "import_sound": return bridge_cmd_import_sound(args)
		case "list_resources": return bridge_cmd_list_resources(args)
		case "remove_resource": return bridge_cmd_remove_resource(args)
		case "undo": return bridge_cmd_undo(args)
		case "redo": return bridge_cmd_redo(args)
	}

	return bridge_error("unknown_command", "Unknown command " + cmd)
}

/// bridge_ok(result)
/// @arg result
/// @desc Wraps a result map in a success response. The result map is owned by the response.

function bridge_ok(result)
{
	var res = ds_map_create();
	res[?"ok"] = true
	ds_map_add_map(res, "result", result)
	return res
}

/// bridge_error(code, message)
/// @arg code
/// @arg message

function bridge_error(code, message)
{
	var res, err;
	res = ds_map_create()
	err = ds_map_create()
	err[?"code"] = code
	err[?"message"] = message
	res[?"ok"] = false
	ds_map_add_map(res, "error", err)
	return res
}

/// bridge_arg(args, name, default)
/// @arg args
/// @arg name
/// @arg default

function bridge_arg(args, name, def)
{
	if (!ds_map_exists(args, name))
		return def

	return args[?name]
}

/// bridge_is_frame(args, name)
/// @arg args
/// @arg name
/// @desc Whether the argument is given and is a frame number of 0 or more.

function bridge_is_frame(args, name)
{
	if (!ds_map_exists(args, name) || !is_real(args[?name]))
		return false

	return (args[?name] >= 0)
}

/// bridge_find_tl(saveid)
/// @arg saveid
/// @desc Returns the timeline with the given save ID, or null.

function bridge_find_tl(saveid)
{
	if (!is_string(saveid) || saveid = "")
		return null

	with (obj_timeline)
		if (save_id = saveid)
			return id

	return null
}

/// bridge_cmd_get_status(args)
/// @arg args

function bridge_cmd_get_status(args)
{
	var result = ds_map_create();
	result[?"version"] = mineimator_version
	result[?"protocol"] = 1
	result[?"window_state"] = window_state

	// Project variables are not set up until the assets are loaded
	if (window_state = "load_assets")
		return bridge_ok(result)

	result[?"project_name"] = project_name
	result[?"project_file"] = project_file
	result[?"project_changed"] = (project_changed > 0) // Booleans are plain numbers in the app, send real booleans
	result[?"tempo"] = project_tempo
	result[?"frame"] = timeline_marker
	result[?"timeline_length"] = timeline_length
	result[?"playing"] = (timeline_playing > 0)
	result[?"object_count"] = instance_number(obj_timeline)
	result[?"undo_steps"] = history_amount - history_pos
	result[?"user_dragging"] = (bridge_user_dragging() > 0)
	result[?"redo_steps"] = history_pos
	result[?"view_camera"] = bridge_view_camera_name()
	
	// Progress of a running movie export
	if (window_state = "export_movie")
	{
		result[?"export_frame"] = exportmovie_frame
		result[?"export_frames"] = floor(((exportmovie_marker_end - exportmovie_marker_start) / project_tempo) * popup_exportmovie.framespersecond) + 1
	}

	return bridge_ok(result)
}

/// bridge_real(value)
/// @arg value
/// @desc A bridge number as a plain real (to 3 decimals), so app variables keep their number type.

function bridge_real(val)
{
	return round(val * 1000) / 1000
}

/// bridge_is_hex_color(value)
/// @arg value
/// @desc True for a string like #RRGGBB.

function bridge_is_hex_color(val)
{
	if (!is_string(val) || string_length(val) != 7 || string_char_at(val, 1) != "#")
		return false
	
	for (var i = 2; i <= 7; i++)
		if (string_pos(string_char_at(val, i), "0123456789abcdefABCDEF") = 0)
			return false
	
	return true
}
