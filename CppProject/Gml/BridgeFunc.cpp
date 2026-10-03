#include "Generated/Scripts.hpp"

#include "Bridge/Bridge.hpp"
#include "Asset/DataStructure.hpp"

// C++ side of the functions declared in GmProject/scripts/bridge_native
namespace CppProject
{
	BoolType bridge_is_running()
	{
		return Bridge::instance && Bridge::instance->IsRunning();
	}

	BoolType bridge_has_failed()
	{
		return Bridge::instance && Bridge::instance->HasFailed();
	}

	IntType bridge_get_port()
	{
		return Bridge::instance ? Bridge::instance->Port() : 0;
	}

	IntType bridge_get_clients()
	{
		return Bridge::instance ? Bridge::instance->ClientCount() : 0;
	}

	BoolType bridge_start()
	{
		return Bridge::instance && Bridge::instance->Start();
	}

	void bridge_stop()
	{
		if (Bridge::instance)
			Bridge::instance->Stop();
	}

	IntType bridge_map_item_type(IntType mapId, StringType key)
	{
		Map* map = FindMap(mapId);
		if (!map)
			return 0;

		if (map->GetType() == Map::HASH_STRING)
			return static_cast<StringHashMap*>(map)->hash.value(key).dsType;

		return map->map.value(VarType(key)).dsType;
	}

	IntType bridge_list_item_type(IntType listId, IntType pos)
	{
		List* list = FindList(listId);
		if (!list || pos < 0 || pos >= list->vec.size())
			return 0;

		return list->vec[pos].dsType;
	}
}
