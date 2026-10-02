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

	if (cmd = "get_status")
		res = bridge_cmd_get_status(args)
	else if (window_state != "" && window_state != "startup")
		res = bridge_error("busy", "Mine-imator is busy: " + window_state)
	else
		res = bridge_dispatch_command(cmd, args)

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
	result[?"redo_steps"] = history_pos

	return bridge_ok(result)
}

/// bridge_pending_poll()
/// @desc Returns the response map of a command that finishes over several steps, or -1 while it is still running.

function bridge_pending_poll()
{
	if (window_state = "export_image")
		return -1

	return bridge_error("internal_error", "No command is pending")
}
