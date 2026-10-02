/// bridge_cmd_project_new(args)
/// @arg args
/// @desc Creates and opens a new project without the new project dialog.

function bridge_cmd_project_new(args)
{
	var name, dirname, fn;
	name = bridge_arg(args, "name", "")
	if (!is_string(name) || name = "")
		return bridge_error("bad_args", "name must be a non-empty string")

	if (project_changed && !bridge_arg(args, "discard", false))
		return bridge_error("unsaved_changes", "The open project has unsaved changes. Save it first or pass discard: true")

	dirname = bridge_arg(args, "folder", setting_project_folder + filename_get_valid(name))
	fn = dirname + "/" + filename_get_valid(name) + ".miproject"
	if (file_exists_lib(fn))
		return bridge_error("already_exists", "A project already exists at " + fn)

	directory_create_lib(setting_project_folder)
	directory_create_lib(dirname)
	if (!directory_exists_lib(dirname))
		return bridge_error("io_error", "Could not create the folder " + dirname)

	if (popup != null)
		popup_close()
	window_state = "" // Before saving, project_save resets the project on the home screen

	project_reset()
	action_load_render_settings(render_default_file)
	project_name = name
	project_folder = dirname
	project_file = fn
	project_save()

	return bridge_cmd_get_status(args)
}

/// bridge_cmd_project_open(args)
/// @arg args

function bridge_cmd_project_open(args)
{
	var fn, prevstate;
	fn = bridge_arg(args, "path", "")
	if (!is_string(fn) || fn = "" || !file_exists_lib(fn))
		return bridge_error("not_found", "No project file at " + string(fn))

	// Archives and legacy formats can ask questions in dialogs
	if (filename_ext(fn) != ".miproject")
		return bridge_error("bad_args", "path must be a .miproject file")

	if (project_changed && !bridge_arg(args, "discard", false))
		return bridge_error("unsaved_changes", "The open project has unsaved changes. Save it first or pass discard: true")

	if (popup != null)
		popup_close()
	prevstate = window_state
	window_state = ""

	if (!project_load(fn))
	{
		window_state = prevstate
		return bridge_error("load_failed", "Mine-imator could not load " + fn)
	}

	return bridge_cmd_get_status(args)
}

/// bridge_cmd_project_save(args)
/// @arg args

function bridge_cmd_project_save(args)
{
	if (project_file = "")
		return bridge_error("no_project", "The project has no file yet. Call project_new first")

	project_save()

	return bridge_cmd_get_status(args)
}
