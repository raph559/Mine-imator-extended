#include "Generated/Scripts.hpp"

#include "Bridge/Bridge.hpp"

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
}
