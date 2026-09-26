import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import http from "node:http";
import { spawn } from "node:child_process";
import { WebSocket } from "ws";

const TOKEN = "test-secret-token";
const BOOT_TIMEOUT_MS = 15000;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: "127.0.0.1", port, path, timeout: 3000 },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function waitReady(port) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const res = await httpGet(port, "/health");
      if (res.status === 200) return JSON.parse(res.body);
    } catch (err) {
      lastError = err;
    }
    await delay(100);
  }
  throw new Error(`Server não arrancou: ${lastError?.message || "timeout"}`);
}

async function spawnServer(extraEnv = {}) {
  const port = await getFreePort();
  const child = spawn(process.execPath, ["server.mjs"], {
    env: {
      ...process.env,
      PORT: String(port),
      TIKTOK_ENABLED: "0",
      WS_TEST_HOOKS: "1",
      BRIDGE_TOKEN: TOKEN,
      ALLOWED_ORIGINS: "https://allowed.example",
      WS_UPGRADE_RATE_LIMIT: "500",
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true
  });

  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));

  const exitPromise = new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });

  let health = null;
  try {
    health = await waitReady(port);
  } catch (err) {
    child.kill();
    throw new Error(`${err.message}\nlogs:\n${logs.join("")}`);
  }

  return {
    child,
    port,
    logs,
    health,
    exitPromise,
    send: (msg) =>
      new Promise((resolve, reject) => {
        if (!child.connected) {
          reject(new Error("IPC não disponível"));
          return;
        }
        child.send(msg, (err) => (err ? reject(err) : resolve()));
      }),
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      try {
        child.kill();
      } catch {
        /* noop */
      }
      await Promise.race([exitPromise, delay(4000)]);
      if (child.exitCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
          /* noop */
        }
      }
    }
  };
}

function wsConnect(port, options = {}) {
  const {
    path = "/ws",
    token = null,
    origin = undefined,
    headers = {},
    query = null
  } = options;

  let search = "";
  if (query) {
    search = `?${new URLSearchParams(query).toString()}`;
  } else if (token) {
    search = `?token=${encodeURIComponent(token)}`;
  }

  const url = `ws://127.0.0.1:${port}${path}${search}`;
  const ws = new WebSocket(url, { origin, headers, handshakeTimeout: 5000 });

  return new Promise((resolve, reject) => {
    const state = { ws, status: null };

    ws.once("unexpected-response", (_req, res) => {
      state.status = res.statusCode;
      res.resume();
      ws.terminate();
      resolve(state);
    });
    ws.once("open", () => {
      state.status = 101;
      resolve(state);
    });
    ws.once("error", (err) => {
      if (state.status === null) reject(err);
    });
  });
}

function waitForClose(ws, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve({ code: ws._closeCode ?? 1006, reason: "" });
      return;
    }
    const timer = setTimeout(
      () => reject(new Error("timeout aguardando close")),
      timeoutMs
    );
    ws.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: String(reason || "") });
    });
  });
}

function waitForMessages(ws, count, predicate = () => true, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const received = [];
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(
        new Error(`timeout: ${received.length}/${count} mensagens`)
      );
    }, timeoutMs);

    function onMessage(raw) {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!predicate(msg)) return;
      received.push(msg);
      if (received.length >= count) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(received);
      }
    }

    ws.on("message", onMessage);
  });
}

// A — path correcto conecta (client Node sem Origin)
test("A: /ws com token correcto conecta", async () => {
  const server = await spawnServer();
  try {
    const { status } = await wsConnect(server.port, { token: TOKEN });
    assert.equal(status, 101);
  } finally {
    await server.stop();
  }
});

// B — path errado é rejeitado com 400
test("B: path '/' (legado) é rejeitado com 400", async () => {
  const server = await spawnServer();
  try {
    const root = await wsConnect(server.port, { path: "/", token: TOKEN });
    assert.equal(root.status, 400);
    const other = await wsConnect(server.port, { path: "/other", token: TOKEN });
    assert.equal(other.status, 400);
  } finally {
    await server.stop();
  }
});

// C — origin inválida é rejeitada com 403
test("C: origin inválido é rejeitado com 403", async () => {
  const server = await spawnServer();
  try {
    const bad = await wsConnect(server.port, {
      token: TOKEN,
      origin: "https://evil.example"
    });
    assert.equal(bad.status, 403);

    const allowed = await wsConnect(server.port, {
      token: TOKEN,
      origin: "https://allowed.example"
    });
    assert.equal(allowed.status, 101);

    const local = await wsConnect(server.port, {
      token: TOKEN,
      origin: "http://localhost:3000"
    });
    assert.equal(local.status, 101);
  } finally {
    await server.stop();
  }
});

// D — token ausente/errado é rejeitado com 401
test("D: token ausente ou errado é rejeitado com 401", async () => {
  const server = await spawnServer();
  try {
    const none = await wsConnect(server.port, {});
    assert.equal(none.status, 401);

    const wrong = await wsConnect(server.port, { token: "nope" });
    assert.equal(wrong.status, 401);

    const header = await wsConnect(server.port, {
      token: null,
      headers: { "x-bridge-token": "nope" }
    });
    assert.equal(header.status, 401);
  } finally {
    await server.stop();
  }
});

// E — token correcto + header correcto recebem bridgeStatus
test("E: token correcto liga e recebe bridgeStatus", async () => {
  const server = await spawnServer();
  try {
    const viaQuery = await wsConnect(server.port, { token: TOKEN });
    assert.equal(viaQuery.status, 101);
    const [status1] = await waitForMessages(
      viaQuery.ws,
      1,
      (m) => m.type === "bridgeStatus"
    );
    assert.equal(typeof status1.connected, "boolean");

    const viaHeader = await wsConnect(server.port, {
      token: null,
      headers: { "x-bridge-token": TOKEN }
    });
    assert.equal(viaHeader.status, 101);

    viaQuery.ws.close();
    viaHeader.ws.close();
  } finally {
    await server.stop();
  }
});

// F — payload acima do máximo fecha com 1009
test("F: payload acima de WS_MAX_PAYLOAD_BYTES fecha 1009", async () => {
  const server = await spawnServer({ WS_MAX_PAYLOAD_BYTES: "65536" });
  try {
    const { ws, status } = await wsConnect(server.port, { token: TOKEN });
    assert.equal(status, 101);
    await waitForMessages(ws, 1, (m) => m.type === "bridgeStatus");

    ws.send("x".repeat(70000));
    const closed = await waitForClose(ws);
    assert.equal(closed.code, 1009);
  } finally {
    await server.stop();
  }
});

// G — limite de clientes rejeita o excedente com 429
test("G: MAX_WS_CLIENTS excedido devolve 429", async () => {
  const server = await spawnServer({ MAX_WS_CLIENTS: "1" });
  const sockets = [];
  try {
    const first = await wsConnect(server.port, { token: TOKEN });
    assert.equal(first.status, 101);
    sockets.push(first.ws);

    const second = await wsConnect(server.port, { token: TOKEN });
    assert.equal(second.status, 429);

    const health = JSON.parse((await httpGet(server.port, "/health")).body);
    assert.equal(health.maxWsClients, 1);
    assert.equal(health.websocketClients, 1);
  } finally {
    for (const ws of sockets) {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    }
    await server.stop();
  }
});

// H — backpressure: cliente pausado, broadcast via IPC, health responde
test("H: broadcast sob backpressure não trava o servidor", async () => {
  const server = await spawnServer({
    WS_BACKPRESSURE_BYTES: "65536",
    WS_MAX_BUFFERED_BYTES: "262144"
  });
  try {
    const { ws, status } = await wsConnect(server.port, { token: TOKEN });
    assert.equal(status, 101);
    await waitForMessages(ws, 1, (m) => m.type === "bridgeStatus");

    // Pausa o socket do cliente (não lê dados).
    ws._socket.pause();

    // 60 mensagens de 64KB ≈ 3.8MB, acima de qualquer limite de buffer.
    await server.send({ type: "broadcast", count: 60, size: 65536 });
    await delay(700);

    // O servidor continua responsivo.
    const res = await httpGet(server.port, "/health");
    assert.equal(res.status, 200);
    const health = JSON.parse(res.body);
    assert.equal(health.ok, true);
    assert.ok(
      health.wsDroppedMessages + health.wsBackpressureClosures > 0,
      "esperava drops/backpressure registados"
    );

    ws._socket.resume();
  } finally {
    await server.stop();
  }
});

// I — estado TikTok reflectido no /health
test("I: /health reflecte connected/disconnected", async () => {
  const server = await spawnServer();
  try {
    let health = JSON.parse((await httpGet(server.port, "/health")).body);
    assert.equal(health.tiktokConnected, false);
    assert.equal(health.tikTokConnected, false);
    assert.notEqual(health.state, "connected");

    await server.send({ type: "mark-tiktok-connected" });
    await delay(150);
    health = JSON.parse((await httpGet(server.port, "/health")).body);
    assert.equal(health.tiktokConnected, true);
    assert.equal(health.tikTokConnected, true);
    assert.equal(health.state, "connected");

    await server.send({ type: "tiktok-disconnect" });
    await delay(150);
    health = JSON.parse((await httpGet(server.port, "/health")).body);
    assert.equal(health.tiktokConnected, false);
    assert.equal(health.tikTokConnected, false);
    assert.ok(
      ["disconnected", "reconnecting"].includes(health.state),
      `state inesperado: ${health.state}`
    );

    assert.equal(typeof health.version, "string");
    assert.equal(typeof health.maxWsClients, "number");
    assert.equal(health.wsPath, "/ws");
    assert.equal(health.username, process.env.TIKTOK_USERNAME || "itshugoverse");
  } finally {
    await server.stop();
  }
});

// J — shutdown limpo fecha clientes (1001) e termina com exit 0
test("J: shutdown fecha WS 1001 e termina com exit 0", async () => {
  const server = await spawnServer();
  const { ws, status } = await wsConnect(server.port, { token: TOKEN });
  assert.equal(status, 101);
  await waitForMessages(ws, 1, (m) => m.type === "bridgeStatus");

  const closedPromise = waitForClose(ws, 8000);
  await server.send({ type: "shutdown", signal: "TEST" });

  const closed = await closedPromise;
  assert.equal(closed.code, 1001);

  const exit = await Promise.race([
    server.exitPromise,
    delay(8000).then(() => ({ code: "timeout" }))
  ]);
  assert.equal(exit.code, 0, `exit code: ${exit.code}`);

  await assert.rejects(() => httpGet(server.port, "/health"));
});

// K — FASE 5.8: join é retransmitido como evento social puro
test("K: join é retransmitido como evento social", async () => {
  const server = await spawnServer();
  try {
    const { ws, status } = await wsConnect(server.port, { token: TOKEN });
    assert.equal(status, 101);
    await waitForMessages(ws, 1, (m) => m.type === "bridgeStatus");

    await server.send({ type: "join", username: "@NovoViewer", userId: "777" });
    const [joinMsg] = await waitForMessages(ws, 1, (m) => m.type === "join");
    assert.equal(joinMsg.username, "@NovoViewer");
    assert.equal(joinMsg.userId, "777");
    assert.ok("uniqueId" in joinMsg);
    assert.equal(typeof joinMsg.id, "string");
    ws.close();
  } finally {
    await server.stop();
  }
});

// Extra — rate limit de upgrades devolve 429
test("extra: WS_UPGRADE_RATE_LIMIT devolve 429", async () => {
  const server = await spawnServer({ WS_UPGRADE_RATE_LIMIT: "2" });
  try {
    const first = await wsConnect(server.port, { token: "wrong-1" });
    assert.equal(first.status, 401);
    const second = await wsConnect(server.port, { token: "wrong-2" });
    assert.equal(second.status, 401);
    const third = await wsConnect(server.port, { token: "wrong-3" });
    assert.equal(third.status, 429);
  } finally {
    await server.stop();
  }
});

// L — FASE 5.8 QA: socket antigo não apaga o novo (nem vice-versa)
test("L: novo socket não fecha o antigo; ambos recebem broadcast", async () => {
  const server = await spawnServer();
  try {
    const first = await wsConnect(server.port, { token: TOKEN });
    assert.equal(first.status, 101);
    await waitForMessages(first.ws, 1, (m) => m.type === "bridgeStatus");

    const second = await wsConnect(server.port, { token: TOKEN });
    assert.equal(second.status, 101);
    await waitForMessages(second.ws, 1, (m) => m.type === "bridgeStatus");

    // Socket antigo continua aberto e funcional após o novo ligar.
    assert.equal(first.ws.readyState, WebSocket.OPEN);
    const wait1 = waitForMessages(first.ws, 1, (m) => m.type === "join");
    const wait2 = waitForMessages(second.ws, 1, (m) => m.type === "join");
    await server.send({ type: "join", username: "@Ambos" });
    const [m1] = await wait1;
    const [m2] = await wait2;
    assert.equal(m1.username, "@Ambos");
    assert.equal(m2.username, "@Ambos");
    assert.equal(first.ws.readyState, WebSocket.OPEN);
    assert.equal(second.ws.readyState, WebSocket.OPEN);

    const health = JSON.parse((await httpGet(server.port, "/health")).body);
    assert.equal(health.websocketClients, 2);

    first.ws.close();
    second.ws.close();
  } finally {
    await server.stop();
  }
});

// M — token opcional: servidor sem BRIDGE_TOKEN aceita ligação sem token
test("M: sem BRIDGE_TOKEN o handshake WS é opcional", async () => {
  const server = await spawnServer({ BRIDGE_TOKEN: "" });
  try {
    const anon = await wsConnect(server.port, {});
    assert.equal(anon.status, 101);
    await waitForMessages(anon.ws, 1, (m) => m.type === "bridgeStatus");

    const health = JSON.parse((await httpGet(server.port, "/health")).body);
    assert.equal(health.ok, true);

    anon.ws.close();
  } finally {
    await server.stop();
  }
});

// N — reconnect: cliente novo após queda volta a receber broadcasts (/health OK)
test("N: reconnect volta a receber broadcasts e /health ok", async () => {
  const server = await spawnServer();
  try {
    const first = await wsConnect(server.port, { token: TOKEN });
    assert.equal(first.status, 101);
    await waitForMessages(first.ws, 1, (m) => m.type === "bridgeStatus");
    const beforeClose = waitForMessages(first.ws, 1, (m) => m.type === "join");
    await server.send({ type: "join", username: "@Antes" });
    await beforeClose;
    first.ws.close();
    await waitForClose(first.ws, 3000);

    await delay(150);
    const health1 = JSON.parse((await httpGet(server.port, "/health")).body);
    assert.equal(health1.websocketClients, 0);
    assert.equal(health1.ok, true);

    const second = await wsConnect(server.port, { token: TOKEN });
    assert.equal(second.status, 101);
    await waitForMessages(second.ws, 1, (m) => m.type === "bridgeStatus");
    const afterReconnect = waitForMessages(second.ws, 1, (m) => m.type === "join");
    await server.send({ type: "join", username: "@Depois" });
    const [msg] = await afterReconnect;
    assert.equal(msg.username, "@Depois");

    const health2 = JSON.parse((await httpGet(server.port, "/health")).body);
    assert.equal(health2.websocketClients, 1);

    second.ws.close();
  } finally {
    await server.stop();
  }
});

test("extra: CORS sem wildcard em /health", async () => {
  const server = await spawnServer();
  try {
    const allowed = await new Promise((resolve, reject) => {
      const req = http.get(
        {
          host: "127.0.0.1",
          port: server.port,
          path: "/health",
          headers: { Origin: "https://allowed.example" },
          timeout: 3000
        },
        (res) => {
          res.resume();
          resolve(res);
        }
      );
      req.on("error", reject);
    });
    assert.equal(allowed.headers["access-control-allow-origin"], "https://allowed.example");
    assert.equal(allowed.headers.vary, "Origin");

    const denied = await new Promise((resolve, reject) => {
      const req = http.get(
        {
          host: "127.0.0.1",
          port: server.port,
          path: "/health",
          headers: { Origin: "https://evil.example" },
          timeout: 3000
        },
        (res) => {
          res.resume();
          resolve(res);
        }
      );
      req.on("error", reject);
    });
    assert.equal(denied.headers["access-control-allow-origin"], undefined);
  } finally {
    await server.stop();
  }
});
