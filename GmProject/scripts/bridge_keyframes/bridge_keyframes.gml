/// bridge_find_keyframe(tl, frame)
/// @arg tl
/// @arg frame
/// @desc Returns the keyframe of the timeline at the given position, or null.

function bridge_find_keyframe(tl, frame)
{
	for (var k = 0; k < ds_list_size(tl.keyframe_list); k++)
		if (tl.keyframe_list[|k].position = frame)
			return tl.keyframe_list[|k]

	return null
}

/// bridge_cmd_set_frame(args)
/// @arg args

function bridge_cmd_set_frame(args)
{
	var result;
	if (!is_real(bridge_arg(args, "frame", null)) || bridge_arg(args, "frame", null) < 0)
		return bridge_error("bad_args", "frame must be a number of 0 or more")

	if (timeline_playing)
		action_tl_play()
	timeline_marker = round(bridge_arg(args, "frame", 0))

	result = ds_map_create()
	result[?"frame"] = timeline_marker
	return bridge_ok(result)
}

/// bridge_values_error(valmap)
/// @arg valmap
/// @desc Checks a map of value name to value from a request. Returns "" if every entry can be applied, otherwise why not.

function bridge_values_error(valmap)
{
	var key, vid, val, n;
	if (!is_real(valmap) || !ds_exists(valmap, ds_type_map))
		return "values must be an object of value name to value"

	n = 0
	key = ds_map_find_first(valmap)
	while (!is_undefined(key))
	{
		vid = ds_list_find_index(value_name_list, string_upper(key))
		val = valmap[?key]
		if (vid < 0)
			return "Unknown value name " + string(key)

		if (tl_value_is_texture(vid) || tl_value_is_obj(vid))
			return string(key) + " refers to a resource and cannot be set through the bridge"
		else if (tl_value_is_color(vid))
		{
			if (!bridge_is_hex_color(val))
				return string(key) + " must be a color like #RRGGBB"
		}
		else if (vid = e_value.TRANSITION)
		{
			if (!is_string(val) || ds_list_find_index(transition_list, val) < 0)
				return "Unknown transition " + string(val)
		}
		else if (tl_value_is_string(vid))
		{
			if (!is_string(val))
				return string(key) + " must be a string"
		}
		else if (tl_value_is_bool(vid))
		{
			if (!is_bool(val))
				return string(key) + " must be true or false"
		}
		else if (!is_real(val))
			return string(key) + " must be a number"

		n++
		key = ds_map_find_next(valmap, key)
	}

	if (n = 0)
		return "values is empty"

	return ""
}

/// bridge_values_apply(tl, frame, valmap)
/// @arg tl
/// @arg frame
/// @arg valmap
/// @desc Sets already checked values on one timeline at a frame, creating the keyframe if needed. One undo step.

function bridge_values_apply(tl, frame, valmap)
{
	var key, vid, val;

	// Select only this timeline and put the marker on the frame, as the UI does before editing
	tl_deselect_all()
	with (tl)
		tl_select()
	app_update_tl_edit()
	timeline_marker = frame
	with (tl)
		tl_update_values()

	tl_value_set_start(tl_value_set, false)
	key = ds_map_find_first(valmap)
	while (!is_undefined(key))
	{
		vid = ds_list_find_index(value_name_list, string_upper(key))
		val = valmap[?key]
		if (tl_value_is_color(vid))
			val = hex_to_color(val)

		tl_value_set(vid, val, false)
		key = ds_map_find_next(valmap, key)
	}
	tl_value_set_done()
	tl_update_length()
}

/// bridge_cmd_set_values(args)
/// @arg args
/// @desc Sets values of one object at a frame, creating the keyframe if needed. One undo step.

function bridge_cmd_set_values(args)
{
	var tl, err, result;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))

	if (!is_real(bridge_arg(args, "frame", 0)) || bridge_arg(args, "frame", 0) < 0)
		return bridge_error("bad_args", "frame must be a number of 0 or more")

	err = bridge_values_error(bridge_arg(args, "values", null))
	if (err != "")
		return bridge_error("bad_args", err)

	if (timeline_playing)
		action_tl_play()
	bridge_values_apply(tl, round(bridge_arg(args, "frame", timeline_marker)), args[?"values"])

	result = ds_map_create()
	result[?"id"] = tl.save_id
	result[?"frame"] = timeline_marker
	result[?"values_set"] = ds_map_size(args[?"values"])
	return bridge_ok(result)
}

/// bridge_cmd_set_keyframes(args)
/// @arg args
/// @desc Sets many keyframes in one call: a list of {id, frame, values}. Nothing is applied unless every entry is valid.

function bridge_cmd_set_keyframes(args)
{
	var list, entry, err, prevmarker, result;
	if (!ds_map_exists(args, "keyframes") || !is_real(args[?"keyframes"]) || !ds_exists(args[?"keyframes"], ds_type_list) || ds_list_size(args[?"keyframes"]) = 0)
		return bridge_error("bad_args", "keyframes must be a non-empty list of {id, frame, values}")
	list = args[?"keyframes"]

	// Check everything before changing anything
	for (var i = 0; i < ds_list_size(list); i++)
	{
		entry = list[|i]
		if (!is_real(entry) || !ds_exists(entry, ds_type_map))
			return bridge_error("bad_args", "keyframes[" + string(i) + "] must be an object with id, frame and values")
		if (bridge_find_tl(bridge_arg(entry, "id", "")) = null)
			return bridge_error("not_found", "keyframes[" + string(i) + "]: no object with id " + string(bridge_arg(entry, "id", "")))
		if (!is_real(bridge_arg(entry, "frame", null)) || bridge_arg(entry, "frame", null) < 0)
			return bridge_error("bad_args", "keyframes[" + string(i) + "]: frame must be a number of 0 or more")

		err = bridge_values_error(bridge_arg(entry, "values", null))
		if (err != "")
			return bridge_error("bad_args", "keyframes[" + string(i) + "]: " + err)
	}

	if (timeline_playing)
		action_tl_play()
	prevmarker = timeline_marker

	for (var i = 0; i < ds_list_size(list); i++)
	{
		entry = list[|i]
		bridge_values_apply(bridge_find_tl(entry[?"id"]), round(entry[?"frame"]), entry[?"values"])
	}

	timeline_marker = prevmarker

	result = ds_map_create()
	result[?"keyframes"] = ds_list_size(list)
	result[?"undo_steps"] = ds_list_size(list)
	return bridge_ok(result)
}

/// bridge_cmd_remove_keyframes(args)
/// @arg args

function bridge_cmd_remove_keyframes(args)
{
	var tl, frames, kfs, result;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))

	if (!ds_map_exists(args, "frames") || !is_real(args[?"frames"]) || !ds_exists(args[?"frames"], ds_type_list) || ds_list_size(args[?"frames"]) = 0)
		return bridge_error("bad_args", "frames must be a non-empty list of frame numbers")
	frames = args[?"frames"]

	// Check everything before changing anything
	kfs = array()
	for (var i = 0; i < ds_list_size(frames); i++)
	{
		kfs[i] = bridge_find_keyframe(tl, frames[|i])
		if (kfs[i] = null)
			return bridge_error("not_found", "No keyframe at frame " + string(frames[|i]))
	}

	tl_deselect_all()
	for (var i = 0; i < array_length(kfs); i++)
		tl_keyframe_select(kfs[i])
	app_update_tl_edit()
	action_tl_keyframes_remove()

	result = ds_map_create()
	result[?"removed"] = array_length(kfs)
	return bridge_ok(result)
}

/// bridge_cmd_move_keyframes(args)
/// @arg args
/// @desc Moves one keyframe to another frame through the same actions as dragging it in the timeline.

function bridge_cmd_move_keyframes(args)
{
	var tl, fromframe, toframe, kf, result;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))

	if (!bridge_is_frame(args, "from") || !bridge_is_frame(args, "to"))
		return bridge_error("bad_args", "from and to must be frame numbers of 0 or more")
	fromframe = round(bridge_arg(args, "from", 0))
	toframe = round(bridge_arg(args, "to", 0))

	kf = bridge_find_keyframe(tl, fromframe)
	if (kf = null)
		return bridge_error("not_found", "No keyframe at frame " + string(fromframe))
	if (toframe != fromframe && bridge_find_keyframe(tl, toframe) != null)
		return bridge_error("bad_args", "There is already a keyframe at frame " + string(toframe))

	tl_deselect_all()
	tl_keyframe_select(kf)
	app_update_tl_edit()

	timeline_mouse_pos = fromframe
	action_tl_keyframes_move_start(kf)
	timeline_mouse_pos = toframe
	action_tl_keyframes_move()
	action_tl_keyframes_move_done()

	with (tl)
	{
		tl_update_values()
		update_matrix = true
	}
	tl_update_matrix()

	result = ds_map_create()
	result[?"frame"] = kf.position
	return bridge_ok(result)
}
