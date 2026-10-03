#pragma once

#include "Common.hpp"

#include <QElapsedTimer>
#include <QJsonObject>
#include <QJsonValue>
#include <QPointer>
#include <QQueue>
#include <QSet>
#include <QTcpServer>
#include <QTcpSocket>

namespace CppProject
{
	// Local command socket for external automation.
	// Protocol and command set: docs/superpowers/specs/2026-10-02-mcp-bridge-design.md
	//
	// The bridge always exists but stays closed until Start() is called: by the --bridge
	// launch flag, the "start automatically" setting, or the MCP menu in the toolbar.
	struct Bridge : QObject
	{
		// The port comes from MINEIMATOR_BRIDGE_PORT, or 41234.
		Bridge();

		// Starts listening on 127.0.0.1. Returns false if the port could not be opened.
		bool Start();

		// Stops listening and disconnects every client.
		void Stop();

		// Runs queued requests through the GML dispatcher. Called once per step
		// for the main window, while its graphics state is active.
		void ProcessPending();

		bool IsRunning() const { return listening; }
		bool HasFailed() const { return failed; } // The last Start() could not open the port
		int Port() const { return port; }
		int ClientCount() const { return sockets.size(); }

		static Bridge* instance;

	private:
		struct Request
		{
			QPointer<QTcpSocket> socket;
			QJsonValue id;
			QString cmd;
			QString argsJson;
			qint64 queuedMs = 0; // When it was received, for the wait while the person drags
		};

		struct Notice
		{
			QString text;
			bool warning;
		};

		void ReadSocket(QTcpSocket* socket);
		void HandleLine(QTcpSocket* socket, const QByteArray& line);
		void Reply(QTcpSocket* socket, const QJsonValue& id, QJsonObject body);
		void ReplyError(QTcpSocket* socket, const QJsonValue& id, const QString& code, const QString& message);

		QTcpServer server;
		quint16 port = 41234;
		bool listening = false;
		bool failed = false;
		QSet<QTcpSocket*> sockets;
		QHash<QTcpSocket*, QByteArray> buffers;
		QQueue<Request> queue;
		QVector<Notice> notices; // Shown as toasts on the next step

		// A command that finishes over several steps (e.g. an export)
		BoolType waiting = false;
		Request waitingRequest;
		QElapsedTimer waitingTimer;
		qint64 pendingTimeoutMs = 10 * 60 * 1000; // Default limit, MINEIMATOR_BRIDGE_PENDING_TIMEOUT_MS overrides
		bool pendingTimeoutFixed = false; // Set from the environment: commands cannot extend it
		qint64 waitingTimeoutMs = 0; // Limit of the command being waited for

		// Commands wait while the person drags something in the app, up to this long
		qint64 dragWaitMs = 60 * 1000; // MINEIMATOR_BRIDGE_DRAG_WAIT_MS overrides
	};
}
