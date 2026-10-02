/// bridge_undo_count()
/// @desc How many steps can be undone. Comparing it before and after a change gives the steps the change added.

function bridge_undo_count()
{
	return history_amount - history_pos
}

/// bridge_cmd_duplicate_object(args)
/// @arg args
/// @desc Duplicates one object with its children and keyframes, like Duplicate in the timeline's menu.

function bridge_cmd_duplicate_object(args)
{
	var tl, prevvalue;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))
	if (tl.part_of != null)
		return bridge_error("bad_args", "A body part cannot be duplicated on its own, duplicate the object it belongs to")

	with (tl)
		tl_select_single()
	app_update_tl_edit()

	// The action duplicates the right-clicked timeline when there is one
	prevvalue = list_item_value
	list_item_value = null
	action_tl_duplicate()
	list_item_value = prevvalue

	if (tl_edit = null || tl_edit = tl)
		return bridge_error("internal_error", "The object was not duplicated")

	return bridge_ok(bridge_tl_summary(tl_edit))
}

/// bridge_copy_target(tl, totl, src)
/// @arg tl
/// @arg totl
/// @arg src
/// @desc Returns the timeline that the keyframes of src (tl or one of its body parts) are copied to, or null if totl has no match.

function bridge_copy_target(tl, totl, src)
{
	var part = null;
	if (totl = tl)
		return src

	// An object's own keyframes go to the target object, a body part's to a body part
	if (src = tl && (tl.part_of = null || totl.part_of != null))
		return totl

	// Otherwise to the target's body part of the same name
	if (totl.part_list = null)
		return null
	with (totl)
		part = tl_part_find(src.model_part_name)
	return part
}

/// bridge_cmd_copy_keyframes(args)
/// @arg args
/// @desc Copies the keyframes of an object and its body parts between two frames to another frame,
/// on the same object or another one, through the app's copy and paste. Keyframes already at the
/// target frames are replaced. Nothing is changed unless the whole copy can be done.

function bridge_cmd_copy_keyframes(args)
{
	var tl, totl, frame, endframe, toframe, sources, kfs, conflicts, targets, minpos, steps, result;
	var prevamount, prevtl, prevpos, prevvalue, prevpartof, prevpartname;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))

	totl = tl
	if (ds_map_exists(args, "to_id"))
	{
		totl = bridge_find_tl(bridge_arg(args, "to_id", ""))
		if (totl = null)
			return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "to_id", "")))
	}

	if (!bridge_is_frame(args, "frame"))
		return bridge_error("bad_args", "frame must be a frame number of 0 or more")
	frame = round(bridge_arg(args, "frame", 0))

	endframe = frame
	if (ds_map_exists(args, "end_frame"))
	{
		if (!is_real(args[?"end_frame"]) || args[?"end_frame"] < frame)
			return bridge_error("bad_args", "end_frame must be a frame number, not before frame")
		endframe = round(args[?"end_frame"])
	}

	if (!bridge_is_frame(args, "to_frame"))
		return bridge_error("bad_args", "to_frame must be a frame number of 0 or more")
	toframe = round(bridge_arg(args, "to_frame", 0))

	// The object and its body parts
	sources = array(tl)
	if (tl.part_list != null)
		for (var p = 0; p < ds_list_size(tl.part_list); p++)
			array_add(sources, tl.part_list[|p])

	// Find the keyframes, where they go, and what is already there, before changing anything
	kfs = array()
	targets = array()
	conflicts = array()
	minpos = null
	for (var s = 0; s < array_length(sources); s++)
	{
		var src, dst, used;
		src = sources[s]
		dst = null
		used = false
		for (var k = 0; k < ds_list_size(src.keyframe_list); k++)
		{
			var kf, existing;
			kf = src.keyframe_list[|k]
			if (kf.position < frame || kf.position > endframe)
				continue

			if (!used)
			{
				dst = bridge_copy_target(tl, totl, src)
				if (dst = null)
				{
					if (src.model_part_name = "")
						return bridge_error("bad_args", "The target object has no body parts to copy to")
					return bridge_error("bad_args", "The target object has no body part " + src.model_part_name)
				}
				array_add(targets, dst)
				used = true
			}

			array_add(kfs, kf)
			if (minpos = null || kf.position < minpos)
				minpos = kf.position

			existing = bridge_find_keyframe(dst, toframe + kf.position - frame)
			if (existing != null)
				array_add(conflicts, existing)
		}
	}

	if (array_length(kfs) = 0)
	{
		if (endframe = frame)
			return bridge_error("not_found", "No keyframe at frame " + string(frame))
		return bridge_error("not_found", "No keyframes from frame " + string(frame) + " to " + string(endframe))
	}

	// Keep the user's keyframe clipboard
	prevamount = copy_kf_amount
	if (prevamount > 0)
	{
		prevtl = array_copy_1d(copy_kf_tl_save_id)
		prevpos = array_copy_1d(copy_kf_pos)
		prevvalue = array_copy_2d(copy_kf_value)
		prevpartof = array_copy_1d(copy_kf_tl_part_of_save_id)
		prevpartname = array_copy_1d(copy_kf_tl_model_part_name)
	}

	tl_deselect_all()
	for (var i = 0; i < array_length(kfs); i++)
		tl_keyframe_select(kfs[i])
	tl_keyframes_copy()

	steps = 0
	if (array_length(conflicts) > 0)
	{
		tl_deselect_all()
		for (var i = 0; i < array_length(conflicts); i++)
			tl_keyframe_select(conflicts[i])
		app_update_tl_edit()
		action_tl_keyframes_remove()
		steps++
	}

	// One timeline is pasted into the selected timeline, several into the selected object's body parts
	tl_deselect_all()
	if (array_length(targets) = 1)
	{
		with (targets[0])
			tl_select_single()
	}
	else
	{
		with (totl)
			tl_select_single()
	}
	app_update_tl_edit()
	action_tl_keyframes_paste(toframe + minpos - frame)
	steps++

	copy_kf_amount = prevamount
	if (prevamount > 0)
	{
		copy_kf_tl_save_id = prevtl
		copy_kf_pos = prevpos
		copy_kf_value = prevvalue
		copy_kf_tl_part_of_save_id = prevpartof
		copy_kf_tl_model_part_name = prevpartname
	}

	result = ds_map_create()
	result[?"copied"] = array_length(kfs)
	result[?"replaced"] = array_length(conflicts)
	result[?"undo_steps"] = steps
	return bridge_ok(result)
}

/// bridge_view_camera_name()
/// @desc The camera the main view looks through: "work", "active" or a camera's id.

function bridge_view_camera_name()
{
	if (view_main.camera = -4)
		return "work"
	if (view_main.camera = -5 || !instance_exists(view_main.camera))
		return "active"
	return view_main.camera.save_id
}

/// bridge_cmd_set_view_camera(args)
/// @arg args
/// @desc Chooses the camera the main view looks through, like the camera menu at the top of the view.

function bridge_cmd_set_view_camera(args)
{
	var cam, tl, result;
	cam = bridge_arg(args, "camera", "")
	if (!is_string(cam) || cam = "")
		return bridge_error("bad_args", "camera must be work, active, or the id of a camera object")

	if (cam = "work")
		view_main.camera = -4
	else if (cam = "active")
		view_main.camera = -5
	else
	{
		tl = bridge_find_tl(string(cam))
		if (tl = null)
			return bridge_error("not_found", "No object with id " + string(cam))
		if (tl.type != e_tl_type.CAMERA)
			return bridge_error("bad_args", "Object " + string(cam) + " is not a camera")
		view_main.camera = tl
	}

	result = ds_map_create()
	result[?"camera"] = bridge_view_camera_name()
	return bridge_ok(result)
}

/// bridge_marker_color_names()
/// @desc The marker colours in the order of the app's colour menu.

function bridge_marker_color_names()
{
	return array("red", "orange", "yellow", "green", "forest_green", "teal", "blue", "purple", "pink")
}

/// bridge_find_marker(frame)
/// @arg frame

function bridge_find_marker(frame)
{
	for (var i = 0; i < ds_list_size(timeline_marker_list); i++)
		if (timeline_marker_list[|i].pos = frame)
			return timeline_marker_list[|i]

	return null
}

/// bridge_marker_map(marker)
/// @arg marker

function bridge_marker_map(marker)
{
	var m, colors;
	colors = bridge_marker_color_names()
	m = ds_map_create()
	m[?"frame"] = marker.pos
	m[?"name"] = marker.name
	m[?"color"] = colors[marker.color]
	return m
}

/// bridge_markers_list()
/// @desc Returns a list of every marker, in frame order.

function bridge_markers_list()
{
	var markers = ds_list_create();
	for (var i = 0; i < ds_list_size(timeline_marker_list); i++)
	{
		ds_list_add(markers, bridge_marker_map(timeline_marker_list[|i]))
		ds_list_mark_as_map(markers, i)
	}

	return markers
}

/// bridge_cmd_set_marker(args)
/// @arg args
/// @desc Adds a marker at a frame, or changes the name, colour or frame of the marker already there.

function bridge_cmd_set_marker(args)
{
	var frame, marker, hasname, colorindex, colors, hasto, toframe, newname, newcolor, hobj, prevedit, undobefore, result;
	if (!bridge_is_frame(args, "frame"))
		return bridge_error("bad_args", "frame must be a frame number of 0 or more")
	frame = round(bridge_arg(args, "frame", 0))
	marker = bridge_find_marker(frame)

	// Check everything before changing anything
	hasname = ds_map_exists(args, "name")
	if (hasname && !is_string(args[?"name"]))
		return bridge_error("bad_args", "name must be a string")
	if (hasname && string_length(args[?"name"]) > 100)
		return bridge_error("bad_args", "name can be up to 100 characters")

	colorindex = -1
	if (ds_map_exists(args, "color"))
	{
		colors = bridge_marker_color_names()
		if (is_string(args[?"color"]))
			for (var i = 0; i < array_length(colors); i++)
				if (colors[i] = args[?"color"])
					colorindex = i
		if (colorindex < 0)
			return bridge_error("bad_args", "color must be one of red, orange, yellow, green, forest_green, teal, blue, purple, pink")
	}

	hasto = ds_map_exists(args, "to_frame")
	toframe = frame
	if (hasto)
	{
		if (!is_real(args[?"to_frame"]) || args[?"to_frame"] < 0)
			return bridge_error("bad_args", "to_frame must be a frame number of 0 or more")
		toframe = round(args[?"to_frame"])
		if (marker = null)
			return bridge_error("not_found", "No marker at frame " + string(frame) + " to move")
		if (toframe != frame && bridge_find_marker(toframe) != null)
			return bridge_error("bad_args", "There is already a marker at frame " + string(toframe))
	}

	undobefore = bridge_undo_count()
	prevedit = timeline_marker_edit

	if (marker = null)
	{
		// Like action_tl_marker_new, without opening the marker editor
		marker = new_obj(obj_marker)
		marker.pos = frame
		if (hasname)
			marker.name = string(args[?"name"])
		if (colorindex >= 0)
			marker.color = colorindex

		hobj = history_set(action_tl_marker_new)
		with (hobj)
		{
			marker_save_id = save_id_get(marker)
			marker_pos = marker.pos
			marker_color = marker.color
			marker_name = marker.name
		}
		ds_list_add(timeline_marker_list, marker)
		marker_list_sort()
	}
	else
	{
		newname = marker.name
		if (hasname)
			newname = string(args[?"name"])
		newcolor = marker.color
		if (colorindex >= 0)
			newcolor = colorindex

		if (newname != marker.name || newcolor != marker.color)
		{
			timeline_marker_edit = marker
			action_tl_marker_edit(newname, newcolor)
		}

		if (toframe != frame)
		{
			marker.edit_pos = marker.pos
			marker.pos = toframe
			timeline_marker_edit = marker
			action_tl_marker_pos()
		}
	}

	timeline_marker_edit = prevedit

	result = ds_map_create()
	ds_map_add_map(result, "marker", bridge_marker_map(marker))
	result[?"undo_steps"] = bridge_undo_count() - undobefore
	return bridge_ok(result)
}

/// bridge_cmd_remove_marker(args)
/// @arg args

function bridge_cmd_remove_marker(args)
{
	var frame, marker, prevvalue, result;
	if (!bridge_is_frame(args, "frame"))
		return bridge_error("bad_args", "frame must be a frame number of 0 or more")
	frame = round(bridge_arg(args, "frame", 0))
	marker = bridge_find_marker(frame)
	if (marker = null)
		return bridge_error("not_found", "No marker at frame " + string(frame))

	// The action deletes the right-clicked marker
	prevvalue = list_item_value
	list_item_value = marker
	action_tl_marker_delete()
	list_item_value = prevvalue

	result = ds_map_create()
	result[?"removed"] = 1
	return bridge_ok(result)
}

/// bridge_loop_map()
/// @desc The play region and repeat mode.

function bridge_loop_map()
{
	var m = ds_map_create();
	if (timeline_region_start = null)
	{
		m[?"start"] = undefined
		m[?"end"] = undefined
	}
	else
	{
		m[?"start"] = timeline_region_start
		m[?"end"] = timeline_region_end
	}

	if (timeline_seamless_repeat)
		m[?"repeat"] = "seamless"
	else if (timeline_repeat)
		m[?"repeat"] = "repeat"
	else
		m[?"repeat"] = "off"

	return m
}

/// bridge_cmd_set_loop(args)
/// @arg args
/// @desc Sets or clears the play region of the timeline, and whether playback repeats.
/// Like in the app, the region and repeat mode are not undone with Undo.

function bridge_cmd_set_loop(args)
{
	var hasstart, hasend, hasrepeat, hasclear, mode;
	hasstart = ds_map_exists(args, "start")
	hasend = ds_map_exists(args, "end")
	hasrepeat = ds_map_exists(args, "repeat")
	hasclear = ds_map_exists(args, "clear")

	// Check everything before changing anything
	if (!hasstart && !hasend && !hasrepeat && !hasclear)
		return bridge_error("bad_args", "Give start and end, clear, or repeat")
	if (hasclear)
	{
		if (!is_bool(args[?"clear"]))
			return bridge_error("bad_args", "clear must be true or false")
		if (hasstart || hasend)
			return bridge_error("bad_args", "clear cannot be given with start and end")
	}
	if (hasstart != hasend)
		return bridge_error("bad_args", "start and end must be given together")
	if (hasstart)
	{
		if (!is_real(args[?"start"]) || !is_real(args[?"end"]) || args[?"start"] < 0 || round(args[?"end"]) <= round(args[?"start"]))
			return bridge_error("bad_args", "start and end must be frame numbers of 0 or more, with end after start")
	}

	mode = ""
	if (hasrepeat)
	{
		mode = bridge_arg(args, "repeat", "")
		if (!is_string(mode) || (mode != "off" && mode != "repeat" && mode != "seamless"))
			return bridge_error("bad_args", "repeat must be off, repeat or seamless")
	}

	if (hasclear && (args[?"clear"] > 0))
	{
		timeline_region_start = null
		timeline_region_end = null
	}
	if (hasstart)
	{
		timeline_region_start = round(args[?"start"])
		timeline_region_end = round(args[?"end"])
	}
	if (hasrepeat)
	{
		timeline_repeat = (mode = "repeat")
		timeline_seamless_repeat = (mode = "seamless")
	}
	project_changed = true

	return bridge_ok(bridge_loop_map())
}
