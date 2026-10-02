/// bridge_value_ref_error(valueid, name, value)
/// @arg valueid
/// @arg name
/// @arg value
/// @desc Checks a value that refers to a resource or object (sound_obj, texture_obj, text_font, path_obj...).
/// Returns "" if it can be set, otherwise why not. A message containing "Unknown resource" means the id was not found.

function bridge_value_ref_error(vid, name, val)
{
	var obj;

	// null clears it (JSON null arrives as the app's null)
	if (is_real(val) && !is_bool(val) && val = null)
		return ""
	if (!is_string(val) || val = "")
		return string(name) + " must be the id of a resource or object, or null"

	obj = save_id_find(string(val))
	if (obj = null)
		return "Unknown resource or object " + string(val) + " for " + string(name)

	if (vid = e_value.SOUND_OBJ)
	{
		if (obj.object_index != obj_resource || obj.type != e_res_type.SOUND)
			return "sound_obj must be a sound added with import_sound"
	}
	else if (vid = e_value.TEXT_FONT)
	{
		if (obj.object_index != obj_resource || obj.type != e_res_type.FONT)
			return "text_font must be a font resource"
	}
	else if (tl_value_is_texture(vid))
	{
		if (obj.object_index != obj_resource && (obj.object_index != obj_timeline || obj.type != e_tl_type.CAMERA))
			return string(name) + " must be an image resource or a camera"
	}
	else if (obj.object_index != obj_timeline)
		return string(name) + " must be the id of an object"

	return ""
}

/// bridge_particle_preset_file(name)
/// @arg name
/// @desc Returns the file of a particle preset given by name (from the Particles folder) or full path, or "" if there is none.

function bridge_particle_preset_file(name)
{
	if (string_lower(filename_ext(name)) = ".miparticles")
		return (file_exists_lib(name) ? name : "")

	if (file_exists_lib(particles_directory + name + ".miparticles"))
		return particles_directory + name + ".miparticles"

	return ""
}

/// bridge_particle_preset_names()
/// @desc The list_names response for particle presets.

function bridge_particle_preset_names()
{
	var files, names, result;
	files = file_find(particles_directory, ".miparticles")
	names = ds_list_create()
	for (var i = 0; i < array_length(files); i++)
		ds_list_add(names, filename_new_ext(filename_name(files[i]), ""))

	result = ds_map_create()
	ds_map_add_list(result, "names", names)
	return bridge_ok(result)
}

/// bridge_particle_settings_add(map, template)
/// @arg map
/// @arg template
/// @desc Adds a particle spawner's settings to a settings map.

function bridge_particle_settings_add(m, temp)
{
	var box;
	m[?"spawn_continuous"] = (temp.pc_spawn_constant > 0)
	m[?"spawn_amount"] = temp.pc_spawn_amount
	m[?"spawn_region"] = (temp.pc_spawn_region_use > 0 ? temp.pc_spawn_region_type : "none")
	m[?"spawn_sphere_radius"] = temp.pc_spawn_region_sphere_radius
	m[?"spawn_cube_size"] = temp.pc_spawn_region_cube_size

	box = ds_list_create()
	ds_list_add(box, temp.pc_spawn_region_box_size[X], temp.pc_spawn_region_box_size[Y], temp.pc_spawn_region_box_size[Z])
	ds_map_add_list(m, "spawn_box_size", box)

	// null when particles are not removed that way
	m[?"lifetime"] = (temp.pc_destroy_at_time > 0 ? temp.pc_destroy_at_time_seconds : undefined)
	m[?"max_particles"] = (temp.pc_destroy_at_amount > 0 ? temp.pc_destroy_at_amount_val : undefined)
	m[?"remove_at_animation_end"] = (temp.pc_destroy_at_animation_finish > 0)
}

/// bridge_particle_setting_error(name, value)
/// @arg name
/// @arg value
/// @desc Returns "" if the particle spawner setting can be applied, otherwise why not.

function bridge_particle_setting_error(name, val)
{
	switch (name)
	{
		case "spawn_continuous":
		case "remove_at_animation_end":
			return (is_bool(val) ? "" : string(name) + " must be true or false")

		case "spawn_amount":
		case "spawn_sphere_radius":
		case "spawn_cube_size":
			return ((is_real(val) && !is_bool(val) && val > 0) ? "" : string(name) + " must be a number above 0")

		case "spawn_region":
		{
			if (!is_string(val) || (val != "none" && val != "sphere" && val != "cube" && val != "box"))
				return "spawn_region must be none, sphere, cube or box"
			return ""
		}

		case "spawn_box_size":
		{
			if (!is_real(val) || !ds_exists(val, ds_type_list) || ds_list_size(val) != 3)
				return "spawn_box_size must be three numbers above 0"
			for (var i = 0; i < 3; i++)
				if (!is_real(val[|i]) || val[|i] <= 0)
					return "spawn_box_size must be three numbers above 0"
			return ""
		}

		case "lifetime":
		case "max_particles":
		{
			// null turns the limit off
			if (is_real(val) && !is_bool(val) && val = null)
				return ""
			if (!is_real(val) || is_bool(val) || val <= 0)
				return string(name) + " must be a number above 0, or null for no limit"
			return ""
		}
	}

	return "Not a particle setting"
}

/// bridge_particle_setting_apply(template, name, value)
/// @arg template
/// @arg name
/// @arg value
/// @desc Applies one checked particle spawner setting through the app's actions. Returns the undo steps added.

function bridge_particle_setting_apply(temp, name, val)
{
	var prevtemp, before, num;
	before = bridge_undo_count()
	prevtemp = temp_edit
	temp_edit = temp

	switch (name)
	{
		case "spawn_continuous":
			if ((temp.pc_spawn_constant > 0) != (val > 0))
				action_lib_pc_spawn_constant((val > 0))
			break

		case "remove_at_animation_end":
			if ((temp.pc_destroy_at_animation_finish > 0) != (val > 0))
				action_lib_pc_destroy_at_animation_finish((val > 0))
			break

		case "spawn_amount":
			num = bridge_real(val)
			if (temp.pc_spawn_amount != num)
				action_lib_pc_spawn_amount(num, 0)
			break

		case "spawn_sphere_radius":
			num = bridge_real(val)
			if (temp.pc_spawn_region_sphere_radius != num)
				action_lib_pc_spawn_region_sphere_radius(num, 0)
			break

		case "spawn_cube_size":
			num = bridge_real(val)
			if (temp.pc_spawn_region_cube_size != num)
				action_lib_pc_spawn_region_cube_size(num, 0)
			break

		case "spawn_box_size":
		{
			var prevaxis = axis_edit;
			for (var a = X; a <= Z; a++)
			{
				num = bridge_real(val[|a])
				if (temp.pc_spawn_region_box_size[a] = num)
					continue
				axis_edit = a
				action_lib_pc_spawn_region_box_size(num, 0)
			}
			axis_edit = prevaxis
			break
		}

		case "spawn_region":
		{
			if (val = "none")
			{
				if (temp.pc_spawn_region_use > 0)
					action_lib_pc_spawn_region_use(false)
				break
			}
			if (!(temp.pc_spawn_region_use > 0))
				action_lib_pc_spawn_region_use(true)
			if (temp.pc_spawn_region_type != val)
				action_lib_pc_spawn_region_type(string(val))
			break
		}

		case "lifetime":
		{
			if (!is_real(val) || val < 0)
			{
				if (temp.pc_destroy_at_time > 0)
					action_lib_pc_destroy_at_time(false)
				break
			}
			num = bridge_real(val)
			if (!(temp.pc_destroy_at_time > 0))
				action_lib_pc_destroy_at_time(true)
			if (temp.pc_destroy_at_time_seconds != num)
				action_lib_pc_destroy_at_time_seconds(num, 0)
			break
		}

		case "max_particles":
		{
			if (!is_real(val) || val < 0)
			{
				if (temp.pc_destroy_at_amount > 0)
					action_lib_pc_destroy_at_amount(false)
				break
			}
			num = round(val)
			if (!(temp.pc_destroy_at_amount > 0))
				action_lib_pc_destroy_at_amount(true)
			if (temp.pc_destroy_at_amount_val != num)
				action_lib_pc_destroy_at_amount_val(num, 0)
			break
		}
	}

	temp_edit = prevtemp
	return bridge_undo_count() - before
}

/// bridge_cmd_import_sound(args)
/// @arg args
/// @desc Adds a sound file to the project. The app decodes it over several frames,
/// so the reply is sent by bridge_pending_poll once it is ready.

function bridge_cmd_import_sound(args)
{
	var fn, err, res;
	fn = bridge_arg(args, "path", "")
	err = bridge_file_error(fn, array(".wav", ".ogg", ".mp3"))
	if (err >= 0)
		return err

	action_res_sound_load(string(fn))
	res = bridge_loaded_find(obj_resource)
	if (res = null)
	{
		bridge_undo_last_load(action_res_sound_load)
		return bridge_error("bad_args", "Could not load the sound " + filename_name(fn))
	}

	bridge_pending_kind = "sound"
	bridge_pending_res = res
	bridge_pending_file = filename_name(fn)
	bridge_quiet_until = current_time + 600000

	err = bridge_ok(ds_map_create())
	err[?"pending"] = true
	err[?"pending_timeout_ms"] = 600000
	return err
}

/// bridge_sound_poll()
/// @desc Finishes import_sound. Returns -1 while the sound is decoded, otherwise the response.

function bridge_sound_poll()
{
	var res, failed, message;
	res = bridge_pending_res
	failed = !instance_exists(res)
	if (!failed && !res.ready)
	{
		if (popup = popup_loading || ds_priority_size(load_queue) > 0)
			return -1
		failed = true
	}
	if (bridge_quiet_message != "")
		failed = true

	message = bridge_quiet_end()
	if (failed)
	{
		bridge_undo_last_load(action_res_sound_load)
		return bridge_error("bad_args", "Could not load the sound " + bridge_pending_file + (message != "" ? ": " + message : ""))
	}

	return bridge_ok(bridge_res_summary(res))
}
