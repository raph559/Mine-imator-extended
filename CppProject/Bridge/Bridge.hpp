#pragma once

#include "Common.hpp"

#include <QJsonObject>
#include <QElapsedTimer>
#include <QJsonValue>
#include <QPointer>
#include <QQueue>
#include <QTcpServer>
#include <QTcpSocket>

namespace CppProject
{
	// Local command socket for external automation.
	// Protocol and command set: docs/superpowers/specs/2026-10-02-mcp-bridge-design.md
	struct Bridge : QObject
	{
		// Starts listening on 127.0.0.1, returns false if the port could not be opened.
		bool Start(quint16 port);

		// Runs queued requests through the GML dispatcher. Called once per step
		// for the main window, while its graphics state is active.
		void ProcessPending();

		static Bridge* instance;

	private:
		struct Request
		{
			QPointer<QTcpSocket> socket;
			QJsonValue id;
			QString cmd;
			QString argsJson;
		};

		void ReadSocket(QTcpSocket* socket);
		void HandleLine(QTcpSocket* socket, const QByteArray& line);
		void Reply(QTcpSocket* socket, const QJsonValue& id, QJsonObject body);
		void ReplyError(QTcpSocket* socket, const QJsonValue& id, const QString& code, const QString& message);

		QTcpServer server;
		QHash<QTcpSocket*, QByteArray> buffers;
		QQueue<Request> queue;

		// A command that finishes over several steps (e.g. an export)
		BoolType waiting = false;
		Request waitingRequest;
		QElapsedTimer waitingTimer;
		qint64 pendingTimeoutMs = 10 * 60 * 1000; // MINEIMATOR_BRIDGE_PENDING_TIMEOUT_MS overrides
	};
}
