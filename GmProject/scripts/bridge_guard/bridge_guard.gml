/// bridge_user_dragging()
/// @desc Returns 1 while the person holds the mouse button down on something they are dragging in the app
/// (a gizmo, keyframes, a panel edge, a slider), otherwise 0. Menus, popups and the object bench do not count.

function bridge_user_dragging()
{
	var busy, prefixes;
	if (bridge_test_drag)
		return 1

	if (!(mouse_left > 0))
		return 0

	busy = window_busy
	if (busy = "")
		return 0

	prefixes = array("rendercontrol", "view", "timeline", "tabmove", "tabclick", "panelresize", "scrollbar", "sortlist_resize", "colorpicker", "bezier", "preview", "particleeditor", "patterneditor", "popupmove")
	for (var i = 0; i < array_length(prefixes); i++)
		if (string_pos(prefixes[i], busy) = 1)
			return 1

	return 0
}

/// bridge_should_wait(cmd)
/// @arg cmd
/// @desc Whether the bridge should hold back this command for now. Called by the transport before each command.
/// get_status always answers, so a client can see why it waits.

function bridge_should_wait(cmd)
{
	if (cmd = "get_status" || cmd = "test_set_drag")
		return 0

	return bridge_user_dragging()
}

/// bridge_cmd_test_set_drag(args)
/// @arg args
/// @desc For the tests only (needs MINEIMATOR_BRIDGE_TESTING=1): pretends that the person is, or is not, dragging.

function bridge_cmd_test_set_drag(args)
{
	var result;
	if (!bridge_testing)
		return bridge_error("unknown_command", "Unknown command test_set_drag")

	bridge_test_drag = (bridge_arg(args, "on", false) > 0)

	result = ds_map_create()
	result[?"dragging"] = (bridge_user_dragging() > 0)
	return bridge_ok(result)
}
