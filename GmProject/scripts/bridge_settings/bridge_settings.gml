/// bridge_flag_names()
/// @desc The on/off settings of a timeline that the bridge exposes.

function bridge_flag_names()
{
	return array("hidden", "locked", "ghost",
				 "shadows", "glow", "backfaces", "fog", "ssao", "texture_filtering", "texture_blur",
				 "inherit_position", "inherit_rotation", "inherit_scale", "inherit_alpha",
				 "inherit_color", "inherit_visibility", "inherit_bend", "inherit_texture")
}

/// bridge_flag_get(tl, name)
/// @arg tl
/// @arg name
/// @desc Returns 1 or 0 for an on/off setting of a timeline, or -1 if the name is not one.

function bridge_flag_get(tl, name)
{
	switch (name)
	{
		case "hidden": return (tl.hide > 0 ? 1 : 0)
		case "locked": return (tl.lock > 0 ? 1 : 0)
		case "ghost": return (tl.ghost > 0 ? 1 : 0)
		case "shadows": return (tl.shadows > 0 ? 1 : 0)
		case "glow": return (tl.glow > 0 ? 1 : 0)
		case "backfaces": return (tl.backfaces > 0 ? 1 : 0)
		case "fog": return (tl.fog > 0 ? 1 : 0)
		case "ssao": return (tl.ssao > 0 ? 1 : 0)
		case "texture_filtering": return (tl.texture_filtering > 0 ? 1 : 0)
		case "texture_blur": return (tl.texture_blur > 0 ? 1 : 0)
		case "inherit_position": return (tl.inherit_position > 0 ? 1 : 0)
		case "inherit_rotation": return (tl.inherit_rotation > 0 ? 1 : 0)
		case "inherit_scale": return (tl.inherit_scale > 0 ? 1 : 0)
		case "inherit_alpha": return (tl.inherit_alpha > 0 ? 1 : 0)
		case "inherit_color": return (tl.inherit_color > 0 ? 1 : 0)
		case "inherit_visibility": return (tl.inherit_visibility > 0 ? 1 : 0)
		case "inherit_bend": return (tl.inherit_bend > 0 ? 1 : 0)
		case "inherit_texture": return (tl.inherit_texture > 0 ? 1 : 0)
	}

	return -1
}

/// bridge_flag_set(tl, name, enable)
/// @arg tl
/// @arg name
/// @arg enable
/// @desc Changes an on/off setting through the app's action. The timeline must be the only selected one,
/// and the setting must differ from enable (hidden, locked and ghost are toggles).

function bridge_flag_set(tl, name, enable)
{
	switch (name)
	{
		case "hidden": action_tl_hide(tl) break
		case "locked": action_tl_lock(tl) break
		case "ghost": action_tl_ghost(tl) break
		case "shadows": action_tl_shadows(enable) break
		case "glow": action_tl_glow(enable) break
		case "backfaces": action_tl_backfaces(enable) break
		case "fog": action_tl_fog(enable) break
		case "ssao": action_tl_ssao(enable) break
		case "texture_filtering": action_tl_texture_filtering(enable) break
		case "texture_blur": action_tl_texture_blur(enable) break
		case "inherit_position": action_tl_inherit_position(enable) break
		case "inherit_rotation": action_tl_inherit_rotation(enable) break
		case "inherit_scale": action_tl_inherit_scale(enable) break
		case "inherit_alpha": action_tl_inherit_alpha(enable) break
		case "inherit_color": action_tl_inherit_color(enable) break
		case "inherit_visibility": action_tl_inherit_visibility(enable) break
		case "inherit_bend": action_tl_inherit_bend(enable) break
		case "inherit_texture": action_tl_inherit_texture(enable) break
	}
}

/// bridge_settings_map(tl)
/// @arg tl
/// @desc Returns a map of the timeline's settings, with the names set_object_settings takes.

function bridge_settings_map(tl)
{
	var m, names, pivot;
	m = ds_map_create()
	names = bridge_flag_names()
	for (var i = 0; i < array_length(names); i++)
		m[?names[i]] = (bridge_flag_get(tl, names[i]) > 0)

	// null unless a custom rotation point is set
	if (tl.rot_point_custom)
	{
		pivot = ds_list_create()
		ds_list_add(pivot, tl.rot_point[X], tl.rot_point[Y], tl.rot_point[Z])
		ds_map_add_list(m, "pivot", pivot)
	}
	else
		m[?"pivot"] = undefined

	if (tl.type = e_tl_type.TEXT)
		m[?"text"] = tl.text
	if (tl.type = e_tl_type.ITEM && tl.temp != null)
		m[?"item"] = mc_assets.item_texture_list[|tl.temp.item_slot]
	if (tl.type = e_tl_type.BLOCK && tl.temp != null)
		m[?"block"] = tl.temp.block_name

	// Resources: null when the object uses the default
	if (tl.part_of = null && bridge_skin_owner(tl) = tl)
		m[?"skin"] = bridge_res_id(tl.temp.model_tex)
	if (type_is_shape(tl.type) && tl.temp != null)
		m[?"texture"] = bridge_res_id(tl.temp.shape_tex)

	return m
}

/// bridge_setting_error(tl, name, value)
/// @arg tl
/// @arg name
/// @arg value
/// @desc Returns "" if the setting can be applied to the timeline, otherwise why not.
/// A message starting with "Unknown item" or "Unknown block" means the name was not found.

function bridge_setting_error(tl, name, val)
{
	if (bridge_flag_get(tl, name) >= 0)
	{
		if (!is_bool(val))
			return string(name) + " must be true or false"
		return ""
	}

	switch (name)
	{
		case "pivot":
		{
			// null resets it, otherwise three numbers
			if (is_real(val) && val < 0)
				return ""
			if (!is_real(val) || !ds_exists(val, ds_type_list) || ds_list_size(val) != 3 || !is_real(val[|0]) || !is_real(val[|1]) || !is_real(val[|2]))
				return "pivot must be a list of three numbers, or null for the default"
			return ""
		}

		case "text":
		{
			if (tl.type != e_tl_type.TEXT)
				return "text can only be set on a text object"
			if (!is_string(val))
				return "text must be a string"
			return ""
		}

		case "item":
		{
			if (tl.type != e_tl_type.ITEM || tl.temp = null)
				return "item can only be set on an item object"
			if (!is_string(val) || val = "")
				return "item must be a non-empty string"
			if (ds_list_find_index(mc_assets.item_texture_list, val) < 0)
				return "Unknown item " + string(val) + ", see list_names"
			return ""
		}

		case "block":
		{
			if (tl.type != e_tl_type.BLOCK || tl.temp = null)
				return "block can only be set on a block object"
			if (!is_string(val))
				return "block must be a string"
			if (ds_list_find_index(bench_settings.block_list.list, val) < 0)
				return "Unknown block " + string(val) + ", see list_names"
			return ""
		}

		case "texture":
		{
			if (!type_is_shape(tl.type) || tl.temp = null)
				return "texture can only be set on a cube, cone, cylinder, sphere or surface"
			if (is_real(val) && val < 0)
				return ""
			if (!is_string(val))
				return "texture must be the id of an image from import_image, or null for none"
			if (bridge_find_res(val) = null)
				return "Unknown resource " + string(val) + ", see list_resources"
			if (bridge_find_res(val).type != e_res_type.TEXTURE)
				return "texture must be an image added with import_image"
			return ""
		}
	}

	return "Unknown setting " + string(name)
}

/// bridge_setting_apply(tl, name, value)
/// @arg tl
/// @arg name
/// @arg value
/// @desc Applies one checked setting to the timeline, which must be the only selected one.
/// Returns how many undo steps it added, 0 if the setting already had that value.

function bridge_setting_apply(tl, name, val)
{
	var steps, prevtemp, slot;
	steps = 0

	if (bridge_flag_get(tl, name) >= 0)
	{
		if ((bridge_flag_get(tl, name) > 0) = (val > 0))
			return 0

		bridge_flag_set(tl, name, (val > 0))
		return 1
	}

	if (name = "texture")
		return bridge_setting_apply_texture(tl, val)

	switch (name)
	{
		case "pivot":
		{
			if (is_real(val) && val < 0)
			{
				if (tl.rot_point_custom)
				{
					action_tl_rotpoint_custom(false)
					steps++
				}
				break
			}

			if (!tl.rot_point_custom)
			{
				action_tl_rotpoint_custom(true)
				steps++
			}
			for (var a = X; a <= Z; a++)
			{
				if (tl.rot_point[a] = bridge_real(val[|a]))
					continue

				axis_edit = a
				action_tl_rotpoint(bridge_real(val[|a]), false)
				steps++
			}
			break
		}

		case "text":
		{
			if (tl.text != val)
			{
				action_tl_text(string(val))
				steps++
			}
			break
		}

		// Items and blocks are settings of the object's library template
		case "item":
		{
			slot = ds_list_find_index(mc_assets.item_texture_list, val)
			if (tl.temp.item_slot != slot)
			{
				prevtemp = temp_edit
				temp_edit = tl.temp
				action_lib_item_slot(slot)
				temp_edit = prevtemp
				steps++
			}
			break
		}

		case "block":
		{
			if (tl.temp.block_name != val)
			{
				prevtemp = temp_edit
				temp_edit = tl.temp
				action_lib_block_name(string(val))
				temp_edit = prevtemp
				steps++
			}
			break
		}
	}

	return steps
}

/// bridge_setting_apply_texture(tl, value)
/// @arg tl
/// @arg value
/// @desc Sets the texture of a shape, or none for a negative value (null). Returns the undo steps added.

function bridge_setting_apply_texture(tl, val)
{
	var res, prevtemp;
	res = null
	if (is_string(val))
		res = bridge_find_res(val)
	if (tl.temp.shape_tex = res)
		return 0

	prevtemp = temp_edit
	temp_edit = tl.temp
	action_lib_shape_tex(res)
	temp_edit = prevtemp
	return 1
}

/// bridge_cmd_set_object_settings(args)
/// @arg args
/// @desc Changes settings of one object that are not keyframed. Nothing is applied unless every setting is valid.

function bridge_cmd_set_object_settings(args)
{
	var tl, settings, key, err, steps, result;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))

	if (!ds_map_exists(args, "settings") || !is_real(args[?"settings"]) || !ds_exists(args[?"settings"], ds_type_map) || ds_map_size(args[?"settings"]) = 0)
		return bridge_error("bad_args", "settings must be a non-empty object of setting name to value")
	settings = args[?"settings"]

	// Check everything before changing anything
	key = ds_map_find_first(settings)
	while (!is_undefined(key))
	{
		err = bridge_setting_error(tl, key, settings[?key])
		if (err != "")
		{
			if (string_pos("Unknown item", err) = 1 || string_pos("Unknown block", err) = 1 || string_pos("Unknown resource", err) = 1)
				return bridge_error("not_found", err)
			return bridge_error("bad_args", err)
		}
		key = ds_map_find_next(settings, key)
	}

	with (tl)
		tl_select_single()
	app_update_tl_edit()

	steps = 0
	key = ds_map_find_first(settings)
	while (!is_undefined(key))
	{
		steps += bridge_setting_apply(tl, key, settings[?key])
		key = ds_map_find_next(settings, key)
	}

	result = ds_map_create()
	result[?"id"] = tl.save_id
	result[?"undo_steps"] = steps
	ds_map_add_map(result, "settings", bridge_settings_map(tl))
	return bridge_ok(result)
}

/// bridge_cmd_list_names(args)
/// @arg args
/// @desc Lists the names that can be used for items, blocks and character models.

function bridge_cmd_list_names(args)
{
	var kind, source, names, result;
	kind = bridge_arg(args, "kind", "")
	if (kind = "item")
		source = mc_assets.item_texture_list
	else if (kind = "block")
		source = bench_settings.block_list.list
	else if (kind = "character")
		source = bench_settings.char_list.list
	else
		return bridge_error("bad_args", "kind must be item, block or character")

	names = ds_list_create()
	for (var i = 0; i < ds_list_size(source); i++)
		if (source[|i] != "") // The item sheet has unused slots
			ds_list_add(names, source[|i])

	result = ds_map_create()
	ds_map_add_list(result, "names", names)
	return bridge_ok(result)
}
