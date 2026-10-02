/// action_bridge_toggle()
/// @desc Starts or stops the automation bridge from the MCP menu.

function action_bridge_toggle()
{
	if (bridge_is_running())
		bridge_stop()
	else
		bridge_start()
}

/// action_setting_bridge_autostart()
/// @desc Toggles whether the automation bridge starts with the program.

function action_setting_bridge_autostart()
{
	setting_bridge_autostart = !setting_bridge_autostart
	settings_save()
}
