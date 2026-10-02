/// error(name)
/// @arg name

function error(name)
{
	// A bridge command is running: it reports the error instead
	if (bridge_is_quiet())
	{
		bridge_quiet_message = text_get(name)
		log("Error kept back for the bridge", name)
		return null
	}
	
	window_set_caption(text_get(name + "caption"))
	show_message(text_get(name))
	window_set_caption("")
	
	return null
}
