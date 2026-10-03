/// bridge_world_regions_dir(folder, dimension)
/// @arg folder
/// @arg dimension
/// @desc Returns the folder with the .mca region files of a dimension of a Minecraft world, or "" if there is none.
/// Understands the layout before 26.1 (region, DIM-1/region, DIM1/region), the layout from 26.1 on
/// (dimensions/minecraft/<dimension>/region), and a folder that is itself a region folder.

function bridge_world_regions_dir(folder, dim)
{
	var cands = array();
	if (dim = "overworld")
	{
		array_add(cands, folder + "/region")
		array_add(cands, folder + "/dimensions/minecraft/overworld/region")
		array_add(cands, folder)
	}
	else if (dim = "nether")
	{
		array_add(cands, folder + "/DIM-1/region")
		array_add(cands, folder + "/dimensions/minecraft/the_nether/region")
	}
	else
	{
		array_add(cands, folder + "/DIM1/region")
		array_add(cands, folder + "/dimensions/minecraft/the_end/region")
	}

	for (var i = 0; i < array_length(cands); i++)
		if (directory_exists_lib(cands[i]) && array_length(file_find(cands[i], ".mca")) > 0)
			return cands[i]

	return ""
}

/// bridge_world_vec_error(list, name)
/// @arg list
/// @arg name
/// @desc Returns "" if the value is a list of three whole numbers, otherwise why not.

function bridge_world_vec_error(val, name)
{
	if (!is_real(val) || is_bool(val) || !ds_exists(val, ds_type_list) || ds_list_size(val) != 3)
		return string(name) + " must be three whole numbers [x, y, z]"

	for (var i = 0; i < 3; i++)
		if (!is_real(val[|i]) || is_bool(val[|i]) || val[|i] != round(val[|i]))
			return string(name) + " must be three whole numbers [x, y, z]"

	return ""
}

/// bridge_world_block_index(name)
/// @arg name
/// @desc The index of a block name in the app's block list (what the world import filter uses), or -1.

function bridge_world_block_index(name)
{
	if (!is_string(name))
		return -1

	for (var b = 0; b < ds_list_size(mc_assets.block_list); b++)
		if (mc_assets.block_list[|b].name = name)
			return b

	return -1
}

/// bridge_cmd_import_world(args)
/// @arg args
/// @desc Adds a box of blocks from a Minecraft world to the scene as a scenery object. The app builds it over
/// several frames, so the reply is sent by bridge_pending_poll once it is done.

function bridge_cmd_import_world(args)
{
	var folder, dim, regions, err, from, to, onlyblocks, excludeblocks, filter, mode, name, res, tl, start, finish, worldname, worldregions;
	folder = bridge_arg(args, "world_folder", "")
	if (!is_string(folder) || folder = "")
		return bridge_error("bad_args", "world_folder must be the folder of a Minecraft world")
	if (!directory_exists_lib(string(folder)))
		return bridge_error("not_found", "No folder at " + string(folder))

	dim = bridge_arg(args, "dimension", "overworld")
	if (!is_string(dim) || (dim != "overworld" && dim != "nether" && dim != "end"))
		return bridge_error("bad_args", "dimension must be overworld, nether or end")

	regions = bridge_world_regions_dir(string(folder), string(dim))
	if (regions = "")
		return bridge_error("not_found", "No region files (.mca) for the " + string(dim) + " in " + string(folder))

	from = bridge_arg(args, "from", null)
	to = bridge_arg(args, "to", null)
	err = bridge_world_vec_error(from, "from")
	if (err = "")
		err = bridge_world_vec_error(to, "to")
	if (err != "")
		return bridge_error("bad_args", err)

	for (var a = 0; a < 3; a++)
	{
		if (to[|a] <= from[|a])
			return bridge_error("bad_args", "to must be above from on every axis (from is included, to is not)")
		if (to[|a] - from[|a] > 1024)
			return bridge_error("bad_args", "The box can be at most 1024 blocks long on each axis")
	}

	// Which blocks to leave out, or the only ones to keep
	onlyblocks = bridge_arg(args, "only_blocks", null)
	excludeblocks = bridge_arg(args, "exclude_blocks", null)
	filter = array()
	mode = 0
	if (onlyblocks != null || excludeblocks != null)
	{
		if (onlyblocks != null && excludeblocks != null)
			return bridge_error("bad_args", "Give only_blocks or exclude_blocks, not both")

		var names = (onlyblocks != null ? onlyblocks : excludeblocks);
		if (!is_real(names) || is_bool(names) || !ds_exists(names, ds_type_list) || ds_list_size(names) = 0)
			return bridge_error("bad_args", "only_blocks and exclude_blocks must be non-empty lists of block names")

		for (var i = 0; i < ds_list_size(names); i++)
		{
			if (bridge_world_block_index(names[|i]) < 0)
				return bridge_error("not_found", "Unknown block " + string(names[|i]) + ", see list_names kind block")
			array_add(filter, bridge_world_block_index(names[|i]))
		}

		mode = (onlyblocks != null ? 1 : 0)
	}

	name = bridge_arg(args, "name", "")
	if (!is_string(name))
		return bridge_error("bad_args", "name must be a string")

	// The importer reads the filter mode from the app's setting when it starts, which is a frame later
	bridge_world_mode_saved = false
	if (array_length(filter) > 0)
	{
		bridge_world_prev_mode = setting_world_import_filter_mode
		bridge_world_mode_saved = true
		setting_world_import_filter_mode = mode
	}

	start = vec3(round(from[|0]), round(from[|1]), round(from[|2]))
	finish = vec3(round(to[|0]), round(to[|1]), round(to[|2]))
	// This stock action keeps its name and folder in variant fields, so they are passed as variants, not converted
	// (the opposite of the usual rule: a typed string would change the types of its fields and break the build)
	worldname = bridge_arg(args, "world_folder", "")
	worldname = filename_name(string(folder))
	worldregions = bridge_arg(args, "world_folder", "")
	worldregions = regions
	res = action_res_import_world(worldname, worldregions, start, finish, mode, filter)
	res.scenery_tl_add = false
	action_res_scenery_animate(res)

	tl = bridge_loaded_find(obj_timeline)
	if (tl = null)
	{
		bridge_undo_last_load(action_res_scenery_animate)
		bridge_undo_last_load(action_res_import_world)
		bridge_world_restore_mode()
		return bridge_error("internal_error", "The world box was not added")
	}

	bridge_name_new(tl, args)

	bridge_pending_kind = "scenery"
	bridge_pending_world = true
	bridge_pending_tl = tl
	bridge_pending_res = res
	bridge_pending_file = filename_name(string(folder))
	bridge_quiet_until = current_time + 600000

	err = bridge_ok(ds_map_create())
	err[?"pending"] = true
	err[?"pending_timeout_ms"] = 600000
	return err
}

/// bridge_world_restore_mode()
/// @desc Puts the app's world import filter mode back after an import used its own.

function bridge_world_restore_mode()
{
	if (bridge_world_mode_saved)
		setting_world_import_filter_mode = bridge_world_prev_mode

	bridge_world_mode_saved = false
}
