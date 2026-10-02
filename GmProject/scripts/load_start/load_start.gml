/// load_start(object, script)
/// @arg object
/// @arg script

function load_start(object, script)
{
	if (popup != popup_loading)
	{
		popup = popup_loading
		popup_ani = 0
		popup_ani_type = "show"
	}
	else if (popup_ani_type = "hide")
	{
		// A load started while the popup of the previous one is closing: show it again,
		// otherwise it closes and nothing runs the queue
		popup_ani_type = "show"
	}
	
	if (popup = popup_loading && popup_ani != 1)
		popup.load_amount = ds_priority_size(load_queue)
	
	with (popup_loading)
	{
		caption = ""
		progress = 0
		load_object = object
		load_script = script
	}
	
	window_busy = "popup" + popup.name
}
