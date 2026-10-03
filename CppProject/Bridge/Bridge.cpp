#include "Bridge.hpp"

#include "AppHandler.hpp"
#include "Asset/DataStructure.hpp"
#include "Generated/GmlFunc.hpp"
#include "Generated/Scripts.hpp"

#include <QJsonArray>
#include <QJsonDocument>
#include <QDateTime>

namespace CppProject
{
	Bridge* Bridge::instance = nullptr;

	static const int maxLineBytes = 1024 * 1024;
	static const double stepBudgetMs = 8.0;

	static QJsonObject EncodeMap(IntType id);

	// Converts a ds_map/ds_list value to JSON, following nested structures marked with a dsType.
	static QJsonValue EncodeValue(const VarType& value, IntType dsType)
	{
		if (dsType == ds_type_map)
			return EncodeMap(value.ToInt());

		if (dsType == ds_type_list)
		{
			QJsonArray arr;
			if (List* list = FindList(value.ToInt()))
				for (const List::ListValue& item : list->vec)
					arr.append(EncodeValue(item.value, item.dsType));
			return arr;
		}

		if (value.IsString())
			return value.Str().QStr();
		if (value.IsBool())
			return value.ToBool();
		if (value.IsInt())
			return (double)value.ToInt();
		if (value.IsReal())
			return value.ToReal();

		return QJsonValue(); // Undefined and containers
	}

	static QJsonObject EncodeMap(IntType id)
	{
		QJsonObject obj;
		Map* map = FindMap(id);
		if (!map)
			return obj;

		if (map->GetType() == Map::HASH_STRING)
		{
			const QHash<StringType, Map::MapValue>& hash = static_cast<StringHashMap*>(map)->hash;
			for (auto it = hash.constBegin(); it != hash.constEnd(); ++it)
				obj[it.key().QStr()] = EncodeValue(it.value().value, it.value().dsType);
		}
		else if (map->GetType() == Map::MAP)
		{
			for (auto it = map->map.constBegin(); it != map->map.constEnd(); ++it)
				obj[it.key().ToStr().QStr()] = EncodeValue(it.value().value, it.value().dsType);
		}

		return obj;
	}

	Bridge::Bridge()
	{
		bool ok = false;
		int value = qEnvironmentVariableIntValue("MINEIMATOR_BRIDGE_PORT", &ok);
		if (ok && value > 0 && value < 65536)
			port = value;

		value = qEnvironmentVariableIntValue("MINEIMATOR_BRIDGE_PENDING_TIMEOUT_MS", &ok);
		if (ok && value > 0)
		{
			pendingTimeoutMs = value;
			pendingTimeoutFixed = true;
		}

		value = qEnvironmentVariableIntValue("MINEIMATOR_BRIDGE_DRAG_WAIT_MS", &ok);
		if (ok && value > 0)
			dragWaitMs = value;

		connect(&server, &QTcpServer::newConnection, this, [this]()
		{
			while (QTcpSocket* socket = server.nextPendingConnection())
			{
				sockets.insert(socket);
				connect(socket, &QTcpSocket::readyRead, this, [this, socket]() { ReadSocket(socket); });
				connect(socket, &QTcpSocket::disconnected, this, [this, socket]()
				{
					sockets.remove(socket);
					buffers.remove(socket);
					socket->deleteLater();
				});
			}
		});
	}

	bool Bridge::Start()
	{
		if (listening)
			return true;

		if (!server.listen(QHostAddress::LocalHost, port))
		{
			WARNING("Bridge could not listen on port " + NumStr(port) + ": " + server.errorString());
			failed = true;
			notices.append({ "Automation bridge could not open port " + NumStr(port), true });
			return false;
		}

		DEBUG("Bridge listening on 127.0.0.1:" + NumStr(port));
		listening = true;
		failed = false;
		notices.append({ "Automation bridge started on port " + NumStr(port), false });
		return true;
	}

	void Bridge::Stop()
	{
		if (!listening)
			return;

		server.close();
		listening = false;

		// abort() emits disconnected, which edits the set
		const QList<QTcpSocket*> open = sockets.values();
		for (QTcpSocket* socket : open)
			socket->abort();

		queue.clear();
		waiting = false;

		DEBUG("Bridge stopped");
		notices.append({ "Automation bridge stopped", false });
	}

	void Bridge::ReadSocket(QTcpSocket* socket)
	{
		buffers[socket].append(socket->readAll());

		for (;;)
		{
			QByteArray& buffer = buffers[socket];
			int newline = buffer.indexOf('\n');
			if (newline < 0)
				break;

			QByteArray line = buffer.left(newline).trimmed();
			buffer.remove(0, newline + 1);
			if (!line.isEmpty())
				HandleLine(socket, line);
		}

		if (buffers[socket].size() > maxLineBytes)
		{
			ReplyError(socket, QJsonValue(), "bad_request", "Request line is too long");
			socket->disconnectFromHost();
		}
	}

	void Bridge::HandleLine(QTcpSocket* socket, const QByteArray& line)
	{
		QJsonParseError parseError;
		QJsonDocument doc = QJsonDocument::fromJson(line, &parseError);
		if (parseError.error || !doc.isObject())
		{
			ReplyError(socket, QJsonValue(), "bad_request", "Each line must be one JSON object");
			return;
		}

		QJsonObject obj = doc.object();
		QJsonValue id = obj.value("id");
		QString cmd = obj.value("cmd").toString();
		QJsonValue args = obj.value("args");
		if (cmd.isEmpty())
		{
			ReplyError(socket, id, "bad_request", "cmd must be a non-empty string");
			return;
		}
		if (!args.isUndefined() && !args.isObject())
		{
			ReplyError(socket, id, "bad_request", "args must be a JSON object");
			return;
		}

		// A modal dialog stalls the step loop, so nothing queued would run until it closes
		if (App->blocked)
		{
			ReplyError(socket, id, "busy_modal", "Mine-imator is showing a dialog. Close it in the app and try again");
			return;
		}

		queue.enqueue({ socket, id, cmd, QString(QJsonDocument(args.toObject()).toJson(QJsonDocument::Compact)), QDateTime::currentMSecsSinceEpoch() });
	}

	void Bridge::ProcessPending()
	{
		if (!global::_app)
			return;

		ScopeAny scope(global::_app->id);

		// Announce bridge events with the app's own toasts, once its interface is up
		if (!notices.isEmpty() && !(global::_app->window_state == "load_assets"))
		{
			for (const Notice& notice : notices)
				toast_new(scope, notice.warning ? e_toast_WARNING : e_toast_INFO, StringType(notice.text));
			notices.clear();
		}

		try
		{
			if (waiting)
			{
				IntType mapId = VarType(bridge_pending_poll(scope)).ToInt();
				if (mapId >= 0)
				{
					Reply(waitingRequest.socket, waitingRequest.id, EncodeMap(mapId));
					ds_map_destroy(mapId);
					waiting = false;
				}
				else if (waitingTimer.hasExpired(waitingTimeoutMs))
				{
					ReplyError(waitingRequest.socket, waitingRequest.id, "timeout", "The command did not finish in time. It may still be running in Mine-imator");
					waiting = false;
				}
			}

			// While a command is pending only get_status is answered, the rest waits in order
			QQueue<Request> deferred;
			Timer budget;
			while (!queue.isEmpty() && budget.ElapsedMs() < stepBudgetMs)
			{
				Request request = queue.dequeue();
				if (!request.socket)
					continue;
				if (waiting && request.cmd != "get_status")
				{
					deferred.enqueue(request);
					continue;
				}

				// The person is dragging something with the mouse: let them finish, but not forever
				if (VarType(bridge_should_wait(scope, StringType(request.cmd))).ToInt() > 0)
				{
					if (QDateTime::currentMSecsSinceEpoch() - request.queuedMs > dragWaitMs)
						ReplyError(request.socket, request.id, "busy", "Mine-imator is busy: the mouse is being dragged in the app. Try again in a moment");
					else
						deferred.enqueue(request);
					continue;
				}

				try
				{
					IntType mapId = VarType(bridge_dispatch(scope, StringType(request.cmd), StringType(request.argsJson))).ToInt();
					QJsonObject body = EncodeMap(mapId);
					ds_map_destroy(mapId);

					// The connection count is only known on this side
					if (request.cmd == "get_status" && body.value("result").isObject())
					{
						QJsonObject result = body.value("result").toObject();
						result["clients"] = ClientCount();
						body["result"] = result;
					}

					if (body.value("pending").toBool())
					{
						waiting = true;
						waitingRequest = request;
						waitingTimer.start();

						// A command may ask for a longer wait (a movie export), unless the limit was set from outside
						waitingTimeoutMs = pendingTimeoutMs;
						if (!pendingTimeoutFixed && body.value("pending_timeout_ms").toDouble() > 0)
							waitingTimeoutMs = (qint64)body.value("pending_timeout_ms").toDouble();
					}
					else
						Reply(request.socket, request.id, body);
				}
				catch (const QString& ex)
				{
					DEBUG("Bridge command " + request.cmd + " failed: " + ex);
					bridge_reset(scope, 0);
					ReplyError(request.socket, request.id, "internal_error", ex);
				}
			}

			while (!deferred.isEmpty())
				queue.prepend(deferred.takeLast());
		}
		catch (const QString& ex)
		{
			DEBUG("Bridge poll failed: " + ex);
			bridge_reset(scope, 1);
			ReplyError(waitingRequest.socket, waitingRequest.id, "internal_error", ex);
			waiting = false;
		}
	}

	void Bridge::Reply(QTcpSocket* socket, const QJsonValue& id, QJsonObject body)
	{
		if (!socket || socket->state() != QAbstractSocket::ConnectedState)
			return;

		body.remove("pending");
		body.remove("pending_timeout_ms");
		body["id"] = id;
		socket->write(QJsonDocument(body).toJson(QJsonDocument::Compact) + "\n");
	}

	void Bridge::ReplyError(QTcpSocket* socket, const QJsonValue& id, const QString& code, const QString& message)
	{
		QJsonObject error { { "code", code }, { "message", message } };
		Reply(socket, id, QJsonObject { { "ok", false }, { "error", error } });
	}
}
