/// bridge_tl_summary(tl)
/// @arg tl
/// @desc Returns a map describing a timeline, without its values.

function bridge_tl_summary(tl)
{
	var m, frames;
	m = ds_map_create()
	m[?"id"] = tl.save_id
	m[?"name"] = tl.display_name
	m[?"type"] = tl_type_name_list[|tl.type]
	m[?"parent"] = ""
	if (tl.parent != null && tl.parent != app)
		m[?"parent"] = tl.parent.save_id
	m[?"part_of"] = ""
	if (tl.part_of != null)
		m[?"part_of"] = tl.part_of.save_id
	m[?"part"] = tl.model_part_name
	m[?"selected"] = (tl.selected > 0)
	m[?"hidden"] = (tl.hide > 0)

	frames = ds_list_create()
	for (var k = 0; k < ds_list_size(tl.keyframe_list); k++)
		ds_list_add(frames, tl.keyframe_list[|k].position)
	ds_map_add_list(m, "frames", frames)

	return m
}

/// bridge_value_out(valueid, value)
/// @arg valueid
/// @arg value

function bridge_value_out(vid, val)
{
	// Resources and objects by id, null for none
	if (tl_value_is_texture(vid) || tl_value_is_obj(vid))
	{
		if (!is_real(val) || val <= 0 || !instance_exists(val))
			return undefined
		return val.save_id
	}

	if (tl_value_is_color(vid))
		return "#" + color_to_hex(val)

	if (tl_value_is_bool(vid))
		return (val > 0)

	return tl_value_get_save_id(vid, val)
}

/// bridge_values_map(tl, array)
/// @arg tl
/// @arg array
/// @desc Position, rotation and scale are always included, other values only when they differ from the default.

function bridge_values_map(tl, arr)
{
	var m = ds_map_create();
	for (var v = 0; v < ds_list_size(value_name_list); v++)
	{
		if (v > e_value.SCA_Z && arr[@ v] = tl.value_default[v])
			continue

		m[?string_lower(value_name_list[|v])] = bridge_value_out(v, arr[@ v])
	}

	return m
}

/// bridge_cmd_get_scene(args)
/// @arg args

function bridge_cmd_get_scene(args)
{
	var result, objects;
	result = ds_map_create()
	objects = ds_list_create()

	with (obj_timeline)
	{
		ds_list_add(objects, bridge_tl_summary(id))
		ds_list_mark_as_map(objects, ds_list_size(objects) - 1)
	}

	result[?"frame"] = timeline_marker
	ds_map_add_list(result, "objects", objects)
	ds_map_add_list(result, "markers", bridge_markers_list())

	return bridge_ok(result)
}

/// bridge_cmd_get_object(args)
/// @arg args

function bridge_cmd_get_object(args)
{
	var tl, result, keyframes;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))

	result = bridge_tl_summary(tl)
	ds_map_add_map(result, "values", bridge_values_map(tl, tl.value))
	ds_map_add_map(result, "settings", bridge_settings_map(tl))

	keyframes = ds_list_create()
	for (var k = 0; k < ds_list_size(tl.keyframe_list); k++)
	{
		var kf, m;
		kf = tl.keyframe_list[|k]
		m = ds_map_create()
		m[?"frame"] = kf.position
		ds_map_add_map(m, "values", bridge_values_map(tl, kf.value))
		ds_list_add(keyframes, m)
		ds_list_mark_as_map(keyframes, k)
	}
	ds_map_add_list(result, "keyframes", keyframes)

	return bridge_ok(result)
}
