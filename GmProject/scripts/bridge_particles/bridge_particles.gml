/// bridge_ptype_list(template)
/// @arg template
/// @desc Returns a list of maps, one for each particle type of a particle spawner template.

function bridge_ptype_list(temp)
{
	var types = ds_list_create();
	for (var i = 0; i < ds_list_size(temp.pc_type_list); i++)
	{
		ds_list_add(types, bridge_ptype_map(temp.pc_type_list[|i]))
		ds_list_mark_as_map(types, i)
	}

	return types
}

/// bridge_ptype_find(timeline, reference)
/// @arg timeline
/// @arg reference
/// @desc Finds a particle type of a spawner by its id, or else by its name. Returns null if there is none.

function bridge_ptype_find(tl, ref)
{
	if (!is_string(ref) || ref = "")
		return null

	for (var i = 0; i < ds_list_size(tl.temp.pc_type_list); i++)
		if (tl.temp.pc_type_list[|i].save_id = ref)
			return tl.temp.pc_type_list[|i]

	for (var i = 0; i < ds_list_size(tl.temp.pc_type_list); i++)
		if (tl.temp.pc_type_list[|i].name = ref)
			return tl.temp.pc_type_list[|i]

	return null
}

/// bridge_ptype_settings_error(args)
/// @arg args
/// @desc Checks the settings object of a request. Returns "" if every setting can be applied, otherwise why not.
/// A message starting with "Unknown sprite" means the sprite template was not found.

function bridge_ptype_settings_error(args)
{
	var settings, key, err;
	if (bridge_map_item_type(args, "settings") != ds_type_map)
		return "settings must be an object of setting name to value"

	settings = args[?"settings"]
	if (ds_map_size(settings) = 0)
		return "settings is empty"

	key = ds_map_find_first(settings)
	while (!is_undefined(key))
	{
		err = bridge_ptype_error(key, settings[?key], settings)
		if (err != "")
			return err
		key = ds_map_find_next(settings, key)
	}

	return ""
}

/// bridge_ptype_settings_apply(timeline, ptype, settings)
/// @arg timeline
/// @arg ptype
/// @arg settings
/// @desc Applies a checked settings object in a fixed order, through the app's actions.

function bridge_ptype_settings_apply(tl, p, settings)
{
	var names, prevtemp, prevptype, prevaxis;
	names = bridge_ptype_names()
	prevtemp = temp_edit
	prevptype = ptype_edit
	prevaxis = axis_edit
	temp_edit = tl.temp

	for (var i = 0; i < array_length(names); i++)
		if (ds_map_exists(settings, names[i]))
			bridge_ptype_apply(p, names[i], settings[?names[i]])

	temp_edit = prevtemp
	ptype_edit = prevptype
	axis_edit = prevaxis
}

/// bridge_ptype_error_code(message)
/// @arg message

function bridge_ptype_error_code(err)
{
	if (string_pos("Unknown sprite", err) = 1)
		return "not_found"
	return "bad_args"
}

/// bridge_ptype_reply(timeline, ptype, undobefore)
/// @arg timeline
/// @arg ptype
/// @arg undobefore

function bridge_ptype_reply(tl, p, undobefore)
{
	var result = bridge_ptype_map(p);
	result[?"undo_steps"] = bridge_undo_count() - undobefore
	return bridge_ok(result)
}

/// bridge_ptype_refresh(timeline)
/// @arg timeline
/// @desc Brings the particle editor's list of types in line with the spawner after a type was added or removed.

function bridge_ptype_refresh(tl)
{
	var prevtemp = temp_edit;
	temp_edit = tl.temp
	tab_template_editor_update_ptype_list()
	temp_edit = prevtemp
}

/// bridge_cmd_add_particle_type(args)
/// @arg args
/// @desc Adds a particle type to a particle spawner, with the given settings if any.

function bridge_cmd_add_particle_type(args)
{
	var tl, err, p, undobefore, prevtemp, prevptype;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))
	if (tl.type != e_tl_type.PARTICLE_SPAWNER || tl.temp = null)
		return bridge_error("bad_args", "That object is not a particle spawner")

	// Nothing is added unless every setting is valid
	if (ds_map_exists(args, "settings"))
	{
		err = bridge_ptype_settings_error(args)
		if (err != "")
			return bridge_error(bridge_ptype_error_code(err), err)
	}

	undobefore = bridge_undo_count()
	prevtemp = temp_edit
	prevptype = ptype_edit
	temp_edit = tl.temp
	action_lib_pc_type_add()
	p = ptype_edit
	temp_edit = prevtemp
	ptype_edit = prevptype

	if (ds_map_exists(args, "settings"))
		bridge_ptype_settings_apply(tl, p, args[?"settings"])
	bridge_ptype_refresh(tl)

	return bridge_ptype_reply(tl, p, undobefore)
}

/// bridge_cmd_set_particle_type(args)
/// @arg args
/// @desc Changes settings of a particle type of a spawner. Nothing is applied unless every setting is valid.

function bridge_cmd_set_particle_type(args)
{
	var tl, p, err, undobefore;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))
	if (tl.type != e_tl_type.PARTICLE_SPAWNER || tl.temp = null)
		return bridge_error("bad_args", "That object is not a particle spawner")

	p = bridge_ptype_find(tl, bridge_arg(args, "type", ""))
	if (p = null)
		return bridge_error("not_found", "No particle type " + string(bridge_arg(args, "type", "")) + " on that spawner, see get_object")

	err = bridge_ptype_settings_error(args)
	if (err != "")
		return bridge_error(bridge_ptype_error_code(err), err)

	undobefore = bridge_undo_count()
	bridge_ptype_settings_apply(tl, p, args[?"settings"])
	return bridge_ptype_reply(tl, p, undobefore)
}

/// bridge_cmd_remove_particle_type(args)
/// @arg args

function bridge_cmd_remove_particle_type(args)
{
	var tl, p, prevtemp, prevptype, result;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))
	if (tl.type != e_tl_type.PARTICLE_SPAWNER || tl.temp = null)
		return bridge_error("bad_args", "That object is not a particle spawner")

	p = bridge_ptype_find(tl, bridge_arg(args, "type", ""))
	if (p = null)
		return bridge_error("not_found", "No particle type " + string(bridge_arg(args, "type", "")) + " on that spawner, see get_object")

	prevtemp = temp_edit
	prevptype = ptype_edit
	temp_edit = tl.temp
	ptype_edit = p
	action_lib_pc_type_remove()
	temp_edit = prevtemp
	ptype_edit = prevptype
	bridge_ptype_refresh(tl)

	result = ds_map_create()
	result[?"removed"] = 1
	result[?"remaining"] = ds_list_size(tl.temp.pc_type_list)
	return bridge_ok(result)
}

/// bridge_cmd_duplicate_particle_type(args)
/// @arg args

function bridge_cmd_duplicate_particle_type(args)
{
	var tl, p, copy, undobefore, prevtemp, prevptype;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))
	if (tl.type != e_tl_type.PARTICLE_SPAWNER || tl.temp = null)
		return bridge_error("bad_args", "That object is not a particle spawner")

	p = bridge_ptype_find(tl, bridge_arg(args, "type", ""))
	if (p = null)
		return bridge_error("not_found", "No particle type " + string(bridge_arg(args, "type", "")) + " on that spawner, see get_object")

	undobefore = bridge_undo_count()
	prevtemp = temp_edit
	prevptype = ptype_edit
	temp_edit = tl.temp
	ptype_edit = p
	action_lib_pc_type_duplicate()
	copy = ptype_edit
	temp_edit = prevtemp
	ptype_edit = prevptype
	bridge_ptype_refresh(tl)

	return bridge_ptype_reply(tl, copy, undobefore)
}
