/// bridge_background_names()
/// @desc Every background setting the bridge exposes.

function bridge_background_names()
{
	return array("sky_time", "sky_rotation", "sunlight_strength", "sunlight_angle", "sky_sun_angle", "sky_sun_scale", "sky_moon_angle", "sky_moon_scale", "sky_clouds_speed", "sky_clouds_height", "sky_clouds_size", "sky_clouds_thickness", "sky_clouds_offset", "fog_distance", "fog_size", "fog_height", "wind_speed", "wind_strength", "wind_direction", "sky_clouds_show", "fog_show", "fog_sky", "fog_color_custom", "twilight", "wind", "ground_show", "sky_color", "sky_clouds_color", "sunlight_color", "ambient_color", "night_color", "grass_color", "foliage_color", "water_color", "fog_color", "sky_moon_phase", "biome")
}

/// bridge_background_kind(name)
/// @arg name
/// @desc Returns "number", "bool", "color", "phase" or "biome" for a background setting, or "" if the name is not one.

function bridge_background_kind(name)
{
	switch (name)
	{
		case "sky_time":
		case "sky_rotation":
		case "sunlight_strength":
		case "sunlight_angle":
		case "sky_sun_angle":
		case "sky_sun_scale":
		case "sky_moon_angle":
		case "sky_moon_scale":
		case "sky_clouds_speed":
		case "sky_clouds_height":
		case "sky_clouds_size":
		case "sky_clouds_thickness":
		case "sky_clouds_offset":
		case "fog_distance":
		case "fog_size":
		case "fog_height":
		case "wind_speed":
		case "wind_strength":
		case "wind_direction":
			return "number"
		case "sky_clouds_show":
		case "fog_show":
		case "fog_sky":
		case "fog_color_custom":
		case "twilight":
		case "wind":
		case "ground_show":
			return "bool"
		case "sky_color":
		case "sky_clouds_color":
		case "sunlight_color":
		case "ambient_color":
		case "night_color":
		case "grass_color":
		case "foliage_color":
		case "water_color":
		case "fog_color":
			return "color"
		case "sky_moon_phase": return "phase"
		case "biome": return "biome"
	}
	
	return ""
}

/// bridge_background_get(name)
/// @arg name
/// @desc Returns the current value of a background setting, as it is sent over the bridge.

function bridge_background_get(name)
{
	switch (name)
	{
		case "sky_time": return background_sky_time
		case "sky_rotation": return background_sky_rotation
		case "sunlight_strength": return background_sunlight_strength
		case "sunlight_angle": return background_sunlight_angle
		case "sky_sun_angle": return background_sky_sun_angle
		case "sky_sun_scale": return background_sky_sun_scale
		case "sky_moon_angle": return background_sky_moon_angle
		case "sky_moon_scale": return background_sky_moon_scale
		case "sky_clouds_speed": return background_sky_clouds_speed
		case "sky_clouds_height": return background_sky_clouds_height
		case "sky_clouds_size": return background_sky_clouds_size
		case "sky_clouds_thickness": return background_sky_clouds_thickness
		case "sky_clouds_offset": return background_sky_clouds_offset
		case "fog_distance": return background_fog_distance
		case "fog_size": return background_fog_size
		case "fog_height": return background_fog_height
		case "wind_speed": return background_wind_speed
		case "wind_strength": return background_wind_strength
		case "wind_direction": return background_wind_direction
		case "sky_clouds_show": return (background_sky_clouds_show > 0)
		case "fog_show": return (background_fog_show > 0)
		case "fog_sky": return (background_fog_sky > 0)
		case "fog_color_custom": return (background_fog_color_custom > 0)
		case "twilight": return (background_twilight > 0)
		case "wind": return (background_wind > 0)
		case "ground_show": return (background_ground_show > 0)
		case "sky_color": return "#" + color_to_hex(background_sky_color)
		case "sky_clouds_color": return "#" + color_to_hex(background_sky_clouds_color)
		case "sunlight_color": return "#" + color_to_hex(background_sunlight_color)
		case "ambient_color": return "#" + color_to_hex(background_ambient_color)
		case "night_color": return "#" + color_to_hex(background_night_color)
		case "grass_color": return "#" + color_to_hex(background_grass_color)
		case "foliage_color": return "#" + color_to_hex(background_foliage_color)
		case "water_color": return "#" + color_to_hex(background_water_color)
		case "fog_color": return "#" + color_to_hex(background_fog_color)
		case "sky_moon_phase": return background_sky_moon_phase
		case "biome": return background_biome
	}
	
	return undefined
}

/// bridge_background_error(name, value)
/// @arg name
/// @arg value
/// @desc Returns "" if the value can be applied to the background setting, otherwise why not.

function bridge_background_error(name, val)
{
	switch (bridge_background_kind(name))
	{
		case "number":
			if (!is_real(val))
				return string(name) + " must be a number"
			return ""

		case "bool":
			if (!is_bool(val))
				return string(name) + " must be true or false"
			return ""

		case "color":
			if (!bridge_is_hex_color(val))
				return string(name) + " must be a color like #RRGGBB"
			return ""

		case "phase":
			if (!is_real(val) || val < 0 || val > 7 || val != round(val))
				return "sky_moon_phase must be a whole number from 0 to 7"
			return ""

		case "biome":
			if (!is_string(val))
				return "biome must be a string"
			if (find_biome(string(val)) = null)
				return "Unknown biome " + string(val)
			return ""
	}

	return "Unknown background setting " + string(name)
}

/// bridge_background_apply(name, value)
/// @arg name
/// @arg value
/// @desc Applies one checked background setting through the app's action.
/// Returns 1 if it changed something (one undo step), 0 if it already had that value.

function bridge_background_apply(name, val)
{
	switch (name)
	{
		case "sky_time":
			if (background_sky_time = bridge_real(val))
				return 0
			action_background_sky_time(bridge_real(val), false)
			return 1
		
		case "sky_rotation":
			if (background_sky_rotation = bridge_real(val))
				return 0
			action_background_sky_rotation(bridge_real(val), false)
			return 1
		
		case "sunlight_strength":
			if (background_sunlight_strength = bridge_real(val))
				return 0
			action_background_sunlight_strength(bridge_real(val) * 100, false)
			return 1
		
		case "sunlight_angle":
			if (background_sunlight_angle = bridge_real(val))
				return 0
			action_background_sunlight_angle(bridge_real(val), false)
			return 1
		
		case "sky_sun_angle":
			if (background_sky_sun_angle = bridge_real(val))
				return 0
			action_background_sky_sun_angle(bridge_real(val), false)
			return 1
		
		case "sky_sun_scale":
			if (background_sky_sun_scale = bridge_real(val))
				return 0
			action_background_sky_sun_scale(bridge_real(val) * 100, false)
			return 1
		
		case "sky_moon_angle":
			if (background_sky_moon_angle = bridge_real(val))
				return 0
			action_background_sky_moon_angle(bridge_real(val), false)
			return 1
		
		case "sky_moon_scale":
			if (background_sky_moon_scale = bridge_real(val))
				return 0
			action_background_sky_moon_scale(bridge_real(val) * 100, false)
			return 1
		
		case "sky_clouds_speed":
			if (background_sky_clouds_speed = bridge_real(val))
				return 0
			action_background_sky_clouds_speed(bridge_real(val) * 100, false)
			return 1
		
		case "sky_clouds_height":
			if (background_sky_clouds_height = bridge_real(val))
				return 0
			action_background_sky_clouds_height(bridge_real(val), false)
			return 1
		
		case "sky_clouds_size":
			if (background_sky_clouds_size = bridge_real(val))
				return 0
			action_background_sky_clouds_size(bridge_real(val), false)
			return 1
		
		case "sky_clouds_thickness":
			if (background_sky_clouds_thickness = bridge_real(val))
				return 0
			action_background_sky_clouds_thickness(bridge_real(val), false)
			return 1
		
		case "sky_clouds_offset":
			if (background_sky_clouds_offset = bridge_real(val))
				return 0
			action_background_sky_clouds_offset(bridge_real(val), false)
			return 1
		
		case "fog_distance":
			if (background_fog_distance = bridge_real(val))
				return 0
			action_background_fog_distance(bridge_real(val), false)
			return 1
		
		case "fog_size":
			if (background_fog_size = bridge_real(val))
				return 0
			action_background_fog_size(bridge_real(val), false)
			return 1
		
		case "fog_height":
			if (background_fog_height = bridge_real(val))
				return 0
			action_background_fog_height(bridge_real(val), false)
			return 1
		
		case "wind_speed":
			if (background_wind_speed = bridge_real(val))
				return 0
			action_background_wind_speed(bridge_real(val) * 100, false)
			return 1
		
		case "wind_strength":
			if (background_wind_strength = bridge_real(val))
				return 0
			action_background_wind_strength(bridge_real(val), false)
			return 1
		
		case "wind_direction":
			if (background_wind_direction = bridge_real(val))
				return 0
			action_background_wind_direction(bridge_real(val), false)
			return 1
		
		case "sky_clouds_show":
			if ((background_sky_clouds_show > 0) = (val > 0))
				return 0
			action_background_sky_clouds_show((val > 0))
			return 1
		
		case "fog_show":
			if ((background_fog_show > 0) = (val > 0))
				return 0
			action_background_fog_show((val > 0))
			return 1
		
		case "fog_sky":
			if ((background_fog_sky > 0) = (val > 0))
				return 0
			action_background_fog_sky((val > 0))
			return 1
		
		case "fog_color_custom":
			if ((background_fog_color_custom > 0) = (val > 0))
				return 0
			action_background_fog_color_custom((val > 0))
			return 1
		
		case "twilight":
			if ((background_twilight > 0) = (val > 0))
				return 0
			action_background_twilight((val > 0))
			return 1
		
		case "wind":
			if ((background_wind > 0) = (val > 0))
				return 0
			action_background_wind((val > 0))
			return 1
		
		case "ground_show":
			if ((background_ground_show > 0) = (val > 0))
				return 0
			action_background_ground_show((val > 0))
			return 1
		
		case "sky_color":
			if (background_sky_color = hex_to_color(string(val)))
				return 0
			action_background_sky_color(hex_to_color(string(val)))
			return 1
		
		case "sky_clouds_color":
			if (background_sky_clouds_color = hex_to_color(string(val)))
				return 0
			action_background_sky_clouds_color(hex_to_color(string(val)))
			return 1
		
		case "sunlight_color":
			if (background_sunlight_color = hex_to_color(string(val)))
				return 0
			action_background_sunlight_color(hex_to_color(string(val)))
			return 1
		
		case "ambient_color":
			if (background_ambient_color = hex_to_color(string(val)))
				return 0
			action_background_ambient_color(hex_to_color(string(val)))
			return 1
		
		case "night_color":
			if (background_night_color = hex_to_color(string(val)))
				return 0
			action_background_night_color(hex_to_color(string(val)))
			return 1
		
		case "grass_color":
			if (background_grass_color = hex_to_color(string(val)))
				return 0
			action_background_grass_color(hex_to_color(string(val)))
			return 1
		
		case "foliage_color":
			if (background_foliage_color = hex_to_color(string(val)))
				return 0
			action_background_foliage_color(hex_to_color(string(val)))
			return 1
		
		case "water_color":
			if (background_water_color = hex_to_color(string(val)))
				return 0
			action_background_water_color(hex_to_color(string(val)))
			return 1
		
		case "fog_color":
			if (background_fog_color = hex_to_color(string(val)))
				return 0
			action_background_fog_color(hex_to_color(string(val)))
			return 1
		
		case "sky_moon_phase":
			if (background_sky_moon_phase = round(val))
				return 0
			action_background_sky_moon_phase(round(val))
			return 1
		
		case "biome":
			if (background_biome = val)
				return 0
			action_background_biome(string(val))
			return 1
	}
	
	return 0
}

/// bridge_background_map()
/// @desc Returns a map of every exposed background setting.

function bridge_background_map()
{
	var m, names;
	m = ds_map_create()
	names = bridge_background_names()
	for (var i = 0; i < array_length(names); i++)
		m[?names[i]] = bridge_background_get(names[i])

	return m
}

/// bridge_cmd_set_background(args)
/// @arg args
/// @desc Changes background settings. Nothing is applied unless every setting is valid.

function bridge_cmd_set_background(args)
{
	var key, err, steps, names, result;

	// Check everything before changing anything
	key = ds_map_find_first(args)
	while (!is_undefined(key))
	{
		err = bridge_background_error(key, args[?key])
		if (err != "")
		{
			if (string_pos("Unknown biome", err) = 1)
				return bridge_error("not_found", err)
			return bridge_error("bad_args", err)
		}
		key = ds_map_find_next(args, key)
	}

	// In a fixed order, so the result does not depend on how the request was written
	steps = 0
	names = bridge_background_names()
	for (var i = 0; i < array_length(names); i++)
		if (ds_map_exists(args, names[i]))
			steps += bridge_background_apply(names[i], args[?names[i]])

	result = bridge_background_map()
	result[?"undo_steps"] = steps
	return bridge_ok(result)
}

/// bridge_project_settings_map()
/// @desc Returns a map of the project, render and background settings.

function bridge_project_settings_map()
{
	var m = ds_map_create();
	m[?"name"] = project_name
	m[?"tempo"] = project_tempo
	m[?"video_width"] = project_video_width
	m[?"video_height"] = project_video_height
	m[?"video_keep_aspect_ratio"] = (project_video_keep_aspect_ratio > 0)
	m[?"render_preset"] = project_render_settings
	m[?"render_samples"] = project_render_samples
	m[?"render_shadows"] = (project_render_shadows > 0)
	m[?"render_ssao"] = (project_render_ssao > 0)
	m[?"render_glow"] = (project_render_glow > 0)
	m[?"render_aa"] = (project_render_aa > 0)
	m[?"render_indirect"] = (project_render_indirect > 0)
	m[?"render_reflections"] = (project_render_reflections > 0)
	ds_map_add_map(m, "background", bridge_background_map())

	return m
}

/// bridge_cmd_get_project_settings(args)
/// @arg args

function bridge_cmd_get_project_settings(args)
{
	var result = bridge_project_settings_map();
	ds_map_add_map(result, "loop", bridge_loop_map())
	return bridge_ok(result)
}

/// bridge_project_setting_error(name, value)
/// @arg name
/// @arg value
/// @desc Returns "" if the project setting can be applied, otherwise why not.

function bridge_project_setting_error(name, val)
{
	switch (name)
	{
		case "tempo":
			if (!is_real(val) || val < 1 || val > 100)
				return "tempo must be a number from 1 to 100"
			return ""

		case "video_width":
		case "video_height":
			if (!is_real(val) || val < 1 || val > 8192 || val != round(val))
				return string(name) + " must be a whole number from 1 to 8192"
			return ""

		case "render_samples":
			if (!is_real(val) || val < 1 || val > 256 || val != round(val))
				return "render_samples must be a whole number from 1 to 256"
			return ""

		case "render_preset":
			if (!is_string(val) || val = "")
				return "render_preset must be a preset name such as performance, balanced or extreme"
			if (!file_exists_lib(render_directory + string(val) + ".mirender"))
				return "Unknown render preset " + string(val)
			return ""
		
		case "render_shadows":
		case "render_ssao":
		case "render_glow":
		case "render_aa":
		case "render_indirect":
		case "render_reflections":
			if (!is_bool(val))
				return string(name) + " must be true or false"
			return ""
	}

	return "Unknown project setting " + string(name)
}

/// bridge_cmd_set_project_settings(args)
/// @arg args
/// @desc Changes tempo, resolution and render settings. Nothing is applied unless every setting is valid.

function bridge_cmd_set_project_settings(args)
{
	var settings, key, err, steps, keepratio, result;
	if (!ds_map_exists(args, "settings") || !is_real(args[?"settings"]) || !ds_exists(args[?"settings"], ds_type_map) || ds_map_size(args[?"settings"]) = 0)
		return bridge_error("bad_args", "settings must be a non-empty object of setting name to value")
	settings = args[?"settings"]

	// Check everything before changing anything
	key = ds_map_find_first(settings)
	while (!is_undefined(key))
	{
		err = bridge_project_setting_error(key, settings[?key])
		if (err != "")
		{
			if (string_pos("Unknown render preset", err) = 1)
				return bridge_error("not_found", err)
			return bridge_error("bad_args", err)
		}
		key = ds_map_find_next(settings, key)
	}

	steps = 0

	// The preset first: it replaces the individual render options
	if (ds_map_exists(settings, "render_preset") && project_render_settings != settings[?"render_preset"])
	{
		action_project_render_settings(string(settings[?"render_preset"]))
		steps++
	}

	if (ds_map_exists(settings, "tempo") && project_tempo != bridge_real(settings[?"tempo"]))
	{
		action_project_tempo(bridge_real(settings[?"tempo"]), false)
		steps++
	}

	// Width and height are applied as given: the aspect ratio lock only follows along when one of them is set
	keepratio = project_video_keep_aspect_ratio
	if (ds_map_exists(settings, "video_width") && ds_map_exists(settings, "video_height"))
		project_video_keep_aspect_ratio = false
	if (ds_map_exists(settings, "video_width") && project_video_width != round(settings[?"video_width"]))
	{
		action_project_video_width(round(settings[?"video_width"]), false)
		steps++
	}
	if (ds_map_exists(settings, "video_height") && project_video_height != round(settings[?"video_height"]))
	{
		action_project_video_height(round(settings[?"video_height"]), false)
		steps++
	}
	project_video_keep_aspect_ratio = keepratio

	if (ds_map_exists(settings, "render_samples") && project_render_samples != round(settings[?"render_samples"]))
	{
		action_project_render_samples(round(settings[?"render_samples"]), false)
		steps++
	}
	if (ds_map_exists(settings, "render_shadows") && (project_render_shadows > 0) != (settings[?"render_shadows"] > 0))
	{
		action_project_render_shadows((settings[?"render_shadows"] > 0))
		steps++
	}
	if (ds_map_exists(settings, "render_ssao") && (project_render_ssao > 0) != (settings[?"render_ssao"] > 0))
	{
		action_project_render_ssao((settings[?"render_ssao"] > 0))
		steps++
	}
	if (ds_map_exists(settings, "render_glow") && (project_render_glow > 0) != (settings[?"render_glow"] > 0))
	{
		action_project_render_glow((settings[?"render_glow"] > 0))
		steps++
	}
	if (ds_map_exists(settings, "render_aa") && (project_render_aa > 0) != (settings[?"render_aa"] > 0))
	{
		action_project_render_aa((settings[?"render_aa"] > 0))
		steps++
	}
	if (ds_map_exists(settings, "render_indirect") && (project_render_indirect > 0) != (settings[?"render_indirect"] > 0))
	{
		action_project_render_indirect((settings[?"render_indirect"] > 0))
		steps++
	}
	if (ds_map_exists(settings, "render_reflections") && (project_render_reflections > 0) != (settings[?"render_reflections"] > 0))
	{
		action_project_render_reflections((settings[?"render_reflections"] > 0))
		steps++
	}
	
	result = bridge_project_settings_map()
	result[?"undo_steps"] = steps
	return bridge_ok(result)
}
