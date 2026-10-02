/// question(text)
/// @arg text

function question(text)
{
	var answer;
	
	// A bridge command is running: nobody is there to answer, so take the safe choice
	if (bridge_is_quiet())
	{
		log("Question answered no for the bridge", text)
		return false
	}
	
	window_set_caption("Mine-imator")
	answer = show_question(text)
	window_set_caption("")
	
	return answer;
}
