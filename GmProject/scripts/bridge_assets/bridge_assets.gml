/// bridge_startup()
/// @desc Sets up the bridge's state. Called once when the app starts, before anything can show an error.

function bridge_startup()
{
	// error() and question() do not open message boxes while a bridge command runs (bridge_quiet),
	// or until bridge_quiet_until while the app loads something a command started. See bridge_is_quiet
	globalvar bridge_quiet, bridge_quiet_until, bridge_quiet_message;
	bridge_quiet = false
	bridge_quiet_until = 0
	bridge_quiet_message = ""

	bridge_pending_kind = ""
	bridge_skin_http = null
	bridge_skin_done = false
	bridge_skin_ok = false
	bridge_skin_status = 0

	// Tests point this at a local server
	bridge_skin_url = environment_get_variable("MINEIMATOR_BRIDGE_SKIN_URL")
	if (bridge_skin_url = "")
		bridge_skin_url = link_skins
}

/// bridge_is_quiet()
/// @desc Whether error() and question() should not open message boxes now.

function bridge_is_quiet()
{
	return (bridge_quiet || current_time < bridge_quiet_until)
}

/// bridge_quiet_end()
/// @desc Ends the quiet period of a load started by a command, and returns the error it kept back, if any.

function bridge_quiet_end()
{
	var message = bridge_quiet_message;
	bridge_quiet_until = 0
	bridge_quiet_message = ""
	return message
}

/// bridge_skin_file()
/// @desc Where a player skin is downloaded to before it is added to the project.

function bridge_skin_file()
{
	return file_directory + "bridge_skin.png"
}

/// bridge_file_error(filename, extensions)
/// @arg filename
/// @arg extensions
/// @desc Returns -1 if the file exists and has one of the extensions, otherwise an error response.

function bridge_file_error(fn, exts)
{
	var ext, ok, names;
	if (!is_string(fn) || fn = "")
		return bridge_error("bad_args", "path must be the full path of a file")

	ext = string_lower(filename_ext(fn))
	ok = false
	names = ""
	for (var i = 0; i < array_length(exts); i++)
	{
		if (exts[i] = ext)
			ok = true
		names += (i > 0 ? ", " : "") + exts[i]
	}
	if (!ok)
		return bridge_error("bad_args", "path must be a " + names + " file")

	if (!file_exists_lib(fn))
		return bridge_error("not_found", "No file at " + fn)

	return -1
}

/// bridge_is_image(filename)
/// @arg filename
/// @desc Whether the file starts like a PNG or JPEG image. The app loads anything else as an empty texture.

function bridge_is_image(fn)
{
	var buf, b0, b1, b2, b3;
	buf = buffer_load_lib(fn)
	if (buf < 0)
		return false

	if (buffer_get_size(buf) < 4)
	{
		buffer_delete(buf)
		return false
	}

	b0 = buffer_read(buf, buffer_u8)
	b1 = buffer_read(buf, buffer_u8)
	b2 = buffer_read(buf, buffer_u8)
	b3 = buffer_read(buf, buffer_u8)
	buffer_delete(buf)

	return ((b0 = 137 && b1 = 80 && b2 = 78 && b3 = 71) || (b0 = 255 && b1 = 216 && b2 = 255))
}

/// bridge_res_summary(resource)
/// @arg resource

function bridge_res_summary(res)
{
	var m = ds_map_create();
	with (res) // Not set until the Resources tab shows it
		res_update_display_name()

	m[?"id"] = res.save_id
	m[?"type"] = res_type_name_list[|res.type]
	m[?"name"] = res.display_name
	m[?"file"] = res.filename
	m[?"used"] = (res.count > 0)
	return m
}

/// bridge_find_res(id)
/// @arg id
/// @desc Returns the project resource with the given save ID, or null.

function bridge_find_res(saveid)
{
	if (!is_string(saveid) || saveid = "")
		return null

	for (var i = 0; i < ds_list_size(res_list.list); i++)
		if (res_list.list[|i].save_id = saveid)
			return res_list.list[|i]

	return null
}

/// bridge_res_id(resource)
/// @arg resource
/// @desc The save ID of a resource chosen by the user, or undefined for none or the default pack.

function bridge_res_id(res)
{
	if (res = null || res = mc_res || !instance_exists(res))
		return undefined
	return res.save_id
}

/// bridge_cmd_list_resources(args)
/// @arg args

function bridge_cmd_list_resources(args)
{
	var result, list;
	list = ds_list_create()
	for (var i = 0; i < ds_list_size(res_list.list); i++)
	{
		ds_list_add(list, bridge_res_summary(res_list.list[|i]))
		ds_list_mark_as_map(list, i)
	}

	result = ds_map_create()
	ds_map_add_list(result, "resources", list)
	return bridge_ok(result)
}

/// bridge_cmd_remove_resource(args)
/// @arg args
/// @desc Removes a resource from the project, like the Resources tab. Objects using it go back to the default.

function bridge_cmd_remove_resource(args)
{
	var res, result;
	res = bridge_find_res(bridge_arg(args, "id", ""))
	if (res = null)
		return bridge_error("not_found", "No resource with id " + string(bridge_arg(args, "id", "")))
	if (res = mc_res)
		return bridge_error("bad_args", "The default pack cannot be removed")

	res_edit = res
	action_res_remove()

	result = ds_map_create()
	result[?"removed"] = 1
	return bridge_ok(result)
}

/// bridge_loaded_find(object)
/// @arg object
/// @desc After a load action, returns the top-level timeline (obj_timeline) or the resource (obj_resource) it added.

function bridge_loaded_find(obj)
{
	var hobj = history[0];
	for (var i = 0; i < hobj.loaded_amount; i++)
	{
		var inst = save_id_find(hobj.loaded_save_id[i]);
		if (inst = null || inst.object_index != obj)
			continue
		if (obj = obj_timeline && inst.part_of != null)
			continue
		return inst
	}

	return null
}

/// bridge_undo_last_load(script)
/// @arg script
/// @desc Takes back a load action that failed, if it is the last change.

function bridge_undo_last_load(script)
{
	if (history_pos = 0 && history_amount > 0 && history[0].script = script)
		action_toolbar_undo()
}

/// bridge_name_new(tl, args)
/// @arg tl
/// @arg args
/// @desc Selects a newly added timeline and gives it the name in args, if any.

function bridge_name_new(tl, args)
{
	with (tl)
		tl_select_single()
	app_update_tl_edit()

	if (is_string(bridge_arg(args, "name", "")) && bridge_arg(args, "name", "") != "")
		action_tl_name(string(bridge_arg(args, "name", "")))
}

/// bridge_skin_owner(tl)
/// @arg tl
/// @desc Returns the timeline whose template holds the skin of tl (its character for a body part), or null.

function bridge_skin_owner(tl)
{
	if (tl.part_of != null)
		tl = tl.part_of
	if (tl.temp = null)
		return null
	if (tl.type = e_tl_type.CHARACTER || tl.type = e_tl_type.SPECIAL_BLOCK)
		return tl
	if (tl.type = e_tl_type.MODEL && tl.temp.model != null && tl.temp.model.model_format != e_model_format.BLOCK)
		return tl

	return null
}

/// bridge_skin_apply(owner, resource)
/// @arg owner
/// @arg resource
/// @desc Sets the skin of a character, special block or model through the app's action. Returns the response.

function bridge_skin_apply(owner, res)
{
	var prevtemp, undobefore, result;
	undobefore = bridge_undo_count()
	prevtemp = temp_edit
	temp_edit = owner.temp
	action_lib_model_tex(res)
	temp_edit = prevtemp

	result = ds_map_create()
	result[?"id"] = owner.save_id
	result[?"skin"] = res.save_id
	result[?"undo_steps"] = bridge_undo_count() - undobefore
	return bridge_ok(result)
}

/// bridge_is_player_name(name)
/// @arg name

function bridge_is_player_name(name)
{
	var c;
	if (string_length(name) < 1 || string_length(name) > 16)
		return false

	for (var i = 1; i <= string_length(name); i++)
	{
		c = ord(string_char_at(name, i))
		if (!((c >= ord("a") && c <= ord("z")) || (c >= ord("A") && c <= ord("Z")) || (c >= ord("0") && c <= ord("9")) || c = ord("_")))
			return false
	}

	return true
}

/// bridge_cmd_set_skin(args)
/// @arg args
/// @desc Sets the skin of a character from a PNG file, or downloads a player's skin by name.

function bridge_cmd_set_skin(args)
{
	var tl, owner, haspath, hasplayer, fn, err, name, res;
	tl = bridge_find_tl(bridge_arg(args, "id", ""))
	if (tl = null)
		return bridge_error("not_found", "No object with id " + string(bridge_arg(args, "id", "")))
	owner = bridge_skin_owner(tl)
	if (owner = null)
		return bridge_error("bad_args", "Only characters, special blocks and custom models have a skin")

	haspath = ds_map_exists(args, "path")
	hasplayer = ds_map_exists(args, "player")
	if (haspath = hasplayer)
		return bridge_error("bad_args", "Give either path or player")

	if (haspath)
	{
		fn = bridge_arg(args, "path", "")
		err = bridge_file_error(fn, array(".png"))
		if (err >= 0)
			return err
		if (!bridge_is_image(string(fn)))
			return bridge_error("bad_args", "The file is not a PNG image")

		res = new_res(string(fn), e_res_type.SKIN)
		if (owner.temp.model_file != null)
			res.player_skin = owner.temp.model_file.player_skin
		with (res)
			res_load()

		return bridge_skin_apply(owner, res)
	}

	name = bridge_arg(args, "player", "")
	if (!is_string(name) || !bridge_is_player_name(name))
		return bridge_error("bad_args", "player must be a Minecraft player name: up to 16 letters, digits or underscores")

	// The reply is sent by bridge_pending_poll once the download is done
	file_delete_lib(bridge_skin_file())
	bridge_skin_done = false
	bridge_skin_ok = false
	bridge_skin_http = http_get_file(bridge_skin_url + string(name), bridge_skin_file())
	bridge_pending_kind = "skin"
	bridge_pending_tl = owner
	bridge_pending_player = string(name)
	bridge_quiet_until = current_time + 30000

	res = bridge_ok(ds_map_create())
	res[?"pending"] = true
	res[?"pending_timeout_ms"] = 30000
	return res
}

/// bridge_skin_http_done(status, httpstatus)
/// @arg status
/// @arg httpstatus
/// @desc Called by app_event_http when the bridge's skin download ends.

function bridge_skin_http_done(status, httpstatus)
{
	bridge_skin_http = null
	bridge_skin_done = true
	bridge_skin_status = httpstatus
	bridge_skin_ok = (status = 0 && httpstatus = http_ok && file_exists_lib(bridge_skin_file()))
}

/// bridge_skin_poll()
/// @desc Finishes set_skin by player name. Returns -1 while the download runs, otherwise the response.

function bridge_skin_poll()
{
	var fn, res, response;
	if (!bridge_skin_done)
		return -1

	bridge_quiet_end()
	if (!instance_exists(bridge_pending_tl))
		return bridge_error("not_found", "The object was removed during the download")

	if (!bridge_skin_ok)
	{
		if (bridge_skin_status = 404)
			return bridge_error("not_found", "No skin found for player " + bridge_pending_player)
		return bridge_error("network_error", "Could not download the skin of " + bridge_pending_player + " (HTTP status " + string(bridge_skin_status) + ")")
	}

	// Kept in the Skins folder like a skin downloaded from the app
	directory_create_lib(skins_directory_get())
	fn = skins_directory_get() + bridge_pending_player + ".png"
	file_copy_lib(bridge_skin_file(), fn)

	res = null
	with (obj_resource)
		if (type = e_res_type.DOWNLOADED_SKIN && filename = filename_name(fn))
			res = id

	if (res = null)
	{
		res = new_res(fn, e_res_type.DOWNLOADED_SKIN)
		res.player_skin = true
		with (res)
			res_load()
	}

	response = bridge_skin_apply(bridge_pending_tl, res)
	bridge_quiet_end()
	return response
}

/// bridge_cmd_import_model(args)
/// @arg args
/// @desc Adds a .mimodel model to the project as an object, like dropping the file on the app.

function bridge_cmd_import_model(args)
{
	var fn, err, map, problem, tl, res;
	fn = bridge_arg(args, "path", "")
	err = bridge_file_error(fn, array(".mimodel"))
	if (err >= 0)
		return err

	// The fields model_file_load needs, checked here so a bad file is not half loaded
	problem = ""
	map = json_load(string(fn))
	if (!ds_map_valid(map))
		problem = "it is not valid JSON"
	else
	{
		if (!is_string(map[?"name"]))
			problem = "it has no name"
		else if (!is_string(map[?"texture"]))
			problem = "it has no texture"
		else if (!ds_list_valid(map[?"texture_size"]))
			problem = "it has no texture_size"
		else if (!ds_list_valid(map[?"parts"]))
			problem = "it has no parts"
		ds_map_destroy(map)
	}
	if (problem != "")
		return bridge_error("bad_args", "Could not load the model: " + problem)

	action_res_model_load(string(fn))
	tl = bridge_loaded_find(obj_timeline)
	res = bridge_loaded_find(obj_resource)
	if (tl = null || res = null || res.model_file = null || bridge_quiet_message != "")
	{
		bridge_undo_last_load(action_res_model_load)
		return bridge_error("bad_args", "Could not load the model " + filename_name(fn) + (bridge_quiet_message != "" ? ": " + bridge_quiet_message : ""))
	}

	bridge_name_new(tl, args)
	return bridge_ok(bridge_tl_summary(tl))
}

/// bridge_cmd_import_scenery(args)
/// @arg args
/// @desc Adds a .schematic, .nbt or .blocks file as a scenery object. The app builds it over several frames,
/// so the reply is sent by bridge_pending_poll once it is done.

function bridge_cmd_import_scenery(args)
{
	var fn, err, tl, res;
	fn = bridge_arg(args, "path", "")
	err = bridge_file_error(fn, array(".schematic", ".nbt", ".blocks"))
	if (err >= 0)
		return err

	action_lib_scenery_load(string(fn))
	tl = bridge_loaded_find(obj_timeline)
	res = bridge_loaded_find(obj_resource)
	if (tl = null || res = null)
	{
		bridge_undo_last_load(action_lib_scenery_load)
		return bridge_error("bad_args", "Could not load the scenery " + filename_name(fn))
	}

	// Answers the app's question about adding blocks as separate objects before it is asked
	res.scenery_tl_add = (bridge_arg(args, "block_objects", false) > 0)

	bridge_name_new(tl, args)

	bridge_pending_kind = "scenery"
	bridge_pending_tl = tl
	bridge_pending_res = res
	bridge_pending_file = filename_name(fn)
	bridge_quiet_until = current_time + 600000

	err = bridge_ok(ds_map_create())
	err[?"pending"] = true
	err[?"pending_timeout_ms"] = 600000
	return err
}

/// bridge_scenery_poll()
/// @desc Finishes import_scenery. Returns -1 while the scenery is being built, otherwise the response.

function bridge_scenery_poll()
{
	var res, failed, message, result, size;
	res = bridge_pending_res
	failed = !instance_exists(res) || !instance_exists(bridge_pending_tl)
	if (!failed && !res.ready)
	{
		// Still in the loading queue
		if (popup = popup_loading || ds_priority_size(load_queue) > 0)
			return -1
		failed = true
	}
	if (bridge_quiet_message != "")
		failed = true

	message = bridge_quiet_end()

	if (failed)
	{
		bridge_undo_last_load(action_tl_name)
		bridge_undo_last_load(action_lib_scenery_load)
		return bridge_error("bad_args", "Could not load the scenery " + bridge_pending_file + (message != "" ? ": " + message : ""))
	}

	result = bridge_tl_summary(bridge_pending_tl)
	size = ds_list_create()
	ds_list_add(size, res.scenery_size[X], res.scenery_size[Y], res.scenery_size[Z])
	ds_map_add_list(result, "size", size)
	return bridge_ok(result)
}

/// bridge_cmd_import_image(args)
/// @arg args
/// @desc Adds an image to the project as a texture resource.

function bridge_cmd_import_image(args)
{
	var fn, err, res;
	fn = bridge_arg(args, "path", "")
	err = bridge_file_error(fn, array(".png", ".jpg", ".jpeg"))
	if (err >= 0)
		return err
	if (!bridge_is_image(string(fn)))
		return bridge_error("bad_args", "The file is not a PNG or JPEG image")

	action_res_image_load(string(fn), e_res_type.TEXTURE)
	res = bridge_loaded_find(obj_resource)
	if (res = null || !res.texture || bridge_quiet_message != "")
	{
		bridge_undo_last_load(action_res_image_load)
		return bridge_error("bad_args", "Could not load the image " + filename_name(fn))
	}

	return bridge_ok(bridge_res_summary(res))
}

/// bridge_pending_poll()
/// @desc Called by the bridge every step while a command waits for the app. Returns -1 to keep waiting,
/// otherwise the response to send.

function bridge_pending_poll()
{
	var res;
	bridge_quiet = true
	if (bridge_pending_kind = "skin")
		res = bridge_skin_poll()
	else if (bridge_pending_kind = "scenery")
		res = bridge_scenery_poll()
	else if (bridge_pending_kind = "sound")
		res = bridge_sound_poll()
	else
		res = bridge_export_poll()
	bridge_quiet = false
	return res
}
