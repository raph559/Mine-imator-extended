/// Automation bridge state and control. Implemented in CppProject/Gml/BridgeFunc.cpp,
/// the bodies below only exist so the project still runs in GameMaker.

/// CppSeparate BoolType bridge_is_running()
function bridge_is_running()
{
	return false
}

/// CppSeparate BoolType bridge_has_failed()
function bridge_has_failed()
{
	return false
}

/// CppSeparate IntType bridge_get_port()
function bridge_get_port()
{
	return 0
}

/// CppSeparate IntType bridge_get_clients()
function bridge_get_clients()
{
	return 0
}

/// CppSeparate BoolType bridge_start()
function bridge_start()
{
	return false
}

/// CppSeparate void bridge_stop()
function bridge_stop()
{
}

/// CppSeparate IntType bridge_map_item_type(IntType, StringType)
/// @desc The data structure type of a value in a decoded JSON object: ds_type_list or ds_type_map for an
/// array or object, 0 for a plain value. A ds id and a number cannot be told apart in GML, this can.
function bridge_map_item_type(map, key)
{
	return 0
}

/// CppSeparate IntType bridge_list_item_type(IntType, IntType)
/// @desc Same for an item of a decoded JSON array.
function bridge_list_item_type(list, pos)
{
	return 0
}
