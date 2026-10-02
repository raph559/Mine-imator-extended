import net from "node:net";

export class BridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
  }
}

/** Newline-delimited JSON client for the Mine-imator bridge socket. */
export class BridgeClient {
  #socket = null;
  #connecting = null;
  #buffer = "";
  #nextId = 1;
  #pending = new Map();

  constructor({ host = "127.0.0.1", port = 41234, timeoutMs = 30000 } = {}) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
  }

  #connect() {
    if (this.#socket) return Promise.resolve();
    this.#connecting ??= new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      socket.setEncoding("utf8");
      socket.once("connect", () => {
        this.#socket = socket;
        this.#connecting = null;
        resolve();
      });
      socket.on("error", (err) => {
        if (this.#socket !== socket) {
          this.#connecting = null;
          reject(err);
        }
      });
      socket.on("data", (chunk) => this.#onData(chunk));
      socket.on("close", () => {
        if (this.#socket === socket) this.#onClose();
      });
    });
    return this.#connecting;
  }

  #onData(chunk) {
    this.#buffer += chunk;
    let newline;
    while ((newline = this.#buffer.indexOf("\n")) >= 0) {
      const line = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      if (line.trim() === "") continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const entry = this.#pending.get(message.id);
      if (!entry) continue;
      this.#pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.ok) entry.resolve(message.result ?? {});
      else entry.reject(new BridgeError(message.error?.code ?? "unknown", message.error?.message ?? "Unknown bridge error"));
    }
  }

  #onClose() {
    this.#socket = null;
    this.#buffer = "";
    for (const entry of this.#pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new BridgeError("disconnected", "Mine-imator closed the connection"));
    }
    this.#pending.clear();
  }

  async call(cmd, args = {}, { timeoutMs = this.timeoutMs } = {}) {
    await this.#connect();
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new BridgeError("timeout", `Mine-imator did not answer ${cmd} within ${timeoutMs} ms`));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      this.#socket.write(JSON.stringify({ id, cmd, args }) + "\n");
    });
  }

  close() {
    this.#socket?.destroy();
  }
}
