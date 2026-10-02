/// bridge_bench_set_skin(filename)
/// @arg filename
/// @desc Sets the workbench character skin from an image file, reusing an already loaded skin of the same name.

function bridge_bench_set_skin(fn)
{
	var res = null;
	with (obj_resource)
		if (type = e_res_type.SKIN && filename = filename_name(fn))
			res = id

	// new_res asks a question when the name is already taken, so only call it for new names
	if (res = null)
	{
		res = new_res(fn, e_res_type.SKIN)
		if (bench_settings.model_file != null)
			res.player_skin = bench_settings.model_file.player_skin

		with (res)
			res_load()
	}

	with (bench_settings)
	{
		model_tex = res
		temp_update_model_shape()
	}
}

/// bridge_cmd_create_object(args)
/// @arg args

function bridge_cmd_create_object(args)
{
	var typename, tltype, model, skin, name, prevtype, prevani, placenew, obj, tl;
	typename = bridge_arg(args, "type", "")
	if (!is_string(typename))
		return bridge_error("bad_args", "type must be a string")
	if (typename = "character")
		typename = "char"

	tltype = ds_list_find_index(tl_type_name_list, typename)
	if (tltype != e_tl_type.CHARACTER && tltype != e_tl_type.ITEM && tltype != e_tl_type.BLOCK && tltype != e_tl_type.TEXT &&
		tltype != e_tl_type.CUBE && tltype != e_tl_type.CONE && tltype != e_tl_type.CYLINDER && tltype != e_tl_type.SPHERE && tltype != e_tl_type.SURFACE &&
		tltype != e_tl_type.CAMERA && tltype != e_tl_type.SPOT_LIGHT && tltype != e_tl_type.POINT_LIGHT && tltype != e_tl_type.FOLDER)
		return bridge_error("bad_args", "Unsupported type. Use char, item, block, text, cube, cone, cylinder, sphere, surface, camera, spotlight, pointlight or folder")

	if (!is_string(bridge_arg(args, "model", "")) || !is_string(bridge_arg(args, "skin", "")) || !is_string(bridge_arg(args, "name", "")))
		return bridge_error("bad_args", "model, skin and name must be strings")
	
	// Plain strings, so the app's typed variables and parameters do not widen to variants
	model = string(bridge_arg(args, "model", ""))
	skin = string(bridge_arg(args, "skin", ""))
	name = string(bridge_arg(args, "name", ""))
	if (model != "" && (tltype != e_tl_type.CHARACTER || ds_list_find_index(bench_settings.char_list.list, model) < 0))
		return bridge_error("not_found", "Unknown character model " + model)
	if (skin != "" && (tltype != e_tl_type.CHARACTER || !file_exists_lib(skin)))
		return bridge_error("not_found", "No skin image at " + skin)

	// Set up the workbench as the UI would
	prevtype = bench_settings.type
	if (type_is_timeline(tltype))
		bench_settings.type = tltype
	else
	{
		// bench_click creates the object on a repeated click, a running animation makes it only configure
		prevani = bench_show_ani_type
		bench_show_ani_type = "bridge"
		if (type_is_shape(tltype))
		{
			bench_settings.shape_type = tltype - e_tl_type.CUBE
			bench_click(e_tl_type.SHAPE)
		}
		else
			bench_click(tltype)
		bench_show_ani_type = prevani

		if (model != "")
			action_bench_model_name(model)
		if (skin != "")
			bridge_bench_set_skin(skin)
	}

	// Create without the interactive mouse placement
	placenew = setting_place_new
	setting_place_new = false
	action_bench_create()
	setting_place_new = placenew
	if (type_is_timeline(tltype))
		bench_settings.type = prevtype

	// The history entry holds the new timeline, or the new template it belongs to
	obj = save_id_find(history[0].spawn_save_id[0])
	tl = null
	if (obj != null && obj.object_index = obj_timeline)
		tl = obj
	else
	{
		with (obj_timeline)
			if (temp = obj && part_of = null)
				tl = id
	}
	if (tl = null)
		return bridge_error("internal_error", "The object was not created")

	with (tl)
		tl_select_single()
	app_update_tl_edit()
	if (name != "")
		action_tl_name(name)

	return bridge_ok(bridge_tl_summary(tl))
}

/// bridge_cmd_remove_object(args)
/// @arg args

function bridge_cmd_remove_object(args)
{
	var tl = bridge_find_tl(bridge_arg(args, "id", ""));
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))
	if (tl.part_of != null)
		return bridge_error("bad_args", "Body parts cannot be removed on their own, remove the object they belong to")

	with (tl)
		tl_select_single()
	list_item_value = null // No right-clicked list item
	action_tl_remove()

	return bridge_ok(ds_map_create())
}

/// bridge_cmd_rename_object(args)
/// @arg args

function bridge_cmd_rename_object(args)
{
	var tl, name;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))

	name = bridge_arg(args, "name", null)
	if (!is_string(name))
		return bridge_error("bad_args", "name must be a string")

	with (tl)
		tl_select_single()
	app_update_tl_edit()
	action_tl_name(name)

	return bridge_ok(bridge_tl_summary(tl))
}

/// bridge_cmd_set_parent(args)
/// @arg args

function bridge_cmd_set_parent(args)
{
	var tl, parentid, par;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))
	if (tl.part_of != null)
		return bridge_error("bad_args", "Body parts cannot be moved to another parent")

	parentid = bridge_arg(args, "parent", "")
	par = app
	if (parentid != "")
	{
		par = bridge_find_tl(parentid)
		if (par = null)
			return bridge_error("not_found", "No object with id " + string(parentid))
	}

	with (tl)
		tl_select_single()
	app_update_tl_edit()
	action_tl_parent(par, ds_list_size(par.tree_list))

	// The action skips moves that would put an object inside itself
	if (tl.parent != par)
		return bridge_error("bad_args", "An object cannot be parented to itself or to one of its children")

	return bridge_ok(bridge_tl_summary(tl))
}

/// bridge_cmd_select(args)
/// @arg args

function bridge_cmd_select(args)
{
	var ids, tls, result;
	if (!ds_map_exists(args, "ids") || !is_real(args[?"ids"]) || !ds_exists(args[?"ids"], ds_type_list))
		return bridge_error("bad_args", "ids must be a list of object ids")

	// Check everything before changing the selection
	ids = args[?"ids"]
	tls = array()
	for (var i = 0; i < ds_list_size(ids); i++)
	{
		tls[i] = bridge_find_tl(ids[|i])
		if (tls[i] = null)
			return bridge_error("not_found", "No object with id " + string(ids[|i]))
	}

	tl_deselect_all()
	for (var i = 0; i < array_length(tls); i++)
		with (tls[i])
			tl_select()
	app_update_tl_edit()

	result = ds_map_create()
	result[?"selected"] = array_length(tls)
	return bridge_ok(result)
}

/// bridge_steps_error(args)
/// @arg args
/// @desc Checks the optional steps argument of undo and redo. Returns "" if it is fine.

function bridge_steps_error(args)
{
	if (!is_real(bridge_arg(args, "steps", 1)) || bridge_arg(args, "steps", 1) < 1)
		return "steps must be a number of 1 or more"

	return ""
}

/// bridge_cmd_undo(args)
/// @arg args
/// @desc Undoes up to "steps" changes (default 1) and reports how many it undid.

function bridge_cmd_undo(args)
{
	var steps, done, result;
	if (bridge_steps_error(args) != "")
		return bridge_error("bad_args", bridge_steps_error(args))

	steps = round(bridge_arg(args, "steps", 1))
	done = 0
	while (done < steps && history_pos < history_amount)
	{
		action_toolbar_undo()
		done++
	}

	result = ds_map_create()
	result[?"done"] = (done > 0)
	result[?"steps"] = done
	return bridge_ok(result)
}

/// bridge_cmd_redo(args)
/// @arg args
/// @desc Redoes up to "steps" changes (default 1) and reports how many it redid.

function bridge_cmd_redo(args)
{
	var steps, done, result;
	if (bridge_steps_error(args) != "")
		return bridge_error("bad_args", bridge_steps_error(args))

	steps = round(bridge_arg(args, "steps", 1))
	done = 0
	while (done < steps && history_pos > 0)
	{
		action_toolbar_redo()
		done++
	}

	result = ds_map_create()
	result[?"done"] = (done > 0)
	result[?"steps"] = done
	return bridge_ok(result)
}
