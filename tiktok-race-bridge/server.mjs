import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TikTokLiveClient,
  EventType,
  GiftStreakTracker
} from "piratetok-live-js";
import { WebSocketServer, WebSocket } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = __dirname;

const USERNAME = String(process.env.TIKTOK_USERNAME || "itshugoverse")
  .replace(/^@/, "")
  .trim();
const PORT = Number(process.env.PORT || 10000);
const RECONNECT_DELAY = 15000;

let tikTokConnected = false;
let connecting = false;
let shuttingDown = false;
let sequence = 0;
let reconnectTimer = null;

const giftTracker = new GiftStreakTracker();

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function usernameFrom(data) {
  return (
    data?.user?.uniqueId ||
    data?.user?.nickname ||
    data?.uniqueId ||
    data?.nickname ||
    "@viewer"
  );
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.error(`[HTTP] Não foi possível servir ${filePath}:`, err.message);
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const requestPath = new URL(req.url || "/", "http://localhost").pathname;

  if (requestPath === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: true,
      tiktokConnected: tikTokConnected,
      username: USERNAME,
      websocketClients: wss.clients.size
    }));
    return;
  }

  if (requestPath === "/" || requestPath === "/index.html") {
    serveFile(res, path.join(PUBLIC_DIR, "index.html"), "text/html; charset=utf-8");
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const wss = new WebSocketServer({ server });

function broadcast(payload) {
  const body = JSON.stringify(payload);

  for (const socket of wss.clients) {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(body);
      } catch (err) {
        console.warn("[GAME] Falha ao enviar WebSocket:", err?.message || err);
      }
    }
  }

  console.log(
    `[OUT] ${payload.type}`,
    payload.username || "",
    payload.comment || payload.giftName || payload.count || ""
  );
}

function broadcastStatus() {
  broadcast({
    id: nextId("status"),
    type: "bridgeStatus",
    connected: tikTokConnected,
    username: USERNAME
  });
}

wss.on("connection", (socket) => {
  console.log("[GAME] Jogo ligado ao WebSocket.");
  socket.send(JSON.stringify({
    id: nextId("status"),
    type: "bridgeStatus",
    connected: tikTokConnected,
    username: USERNAME
  }));

  socket.on("close", () => console.log("[GAME] Jogo desligado."));
  socket.on("error", (err) => {
    console.warn("[GAME] WebSocket error:", err?.message || err);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("=============================================");
  console.log(" HUGOVERSE TikTok Race Bridge");
  console.log("=============================================");
  console.log(`TikTok: @${USERNAME}`);
  console.log(`HTTP/WebSocket port: ${PORT}`);
  console.log("Game: /");
  console.log("Health: /health");
  console.log("=============================================\n");
});

const client = new TikTokLiveClient(USERNAME)
  .cdnEU()
  .timeout(15000)
  .maxRetries(20)
  .staleTimeout(90000)
  .language("pt")
  .region("PT");

client.on(EventType.chat, (data) => {
  broadcast({
    id: nextId("chat"),
    type: "comment",
    username: usernameFrom(data),
    comment: String(data?.content || "")
  });
});

client.on(EventType.like, (data) => {
  const username = usernameFrom(data);

  const count = Math.max(
    1,
    Number(data?.likeCount ?? data?.count ?? 1) || 1
  );

  broadcast({
    id: nextId("like"),
    type: "like",
    username,
    count,
    totalLikeCount: Number(data?.totalLikeCount ?? data?.total ?? 0) || 0
  });
});

client.on(EventType.follow, (data) => {
  broadcast({
    id: nextId("follow"),
    type: "follow",
    username: usernameFrom(data)
  });
});

client.on(EventType.share, (data) => {
  broadcast({
    id: nextId("share"),
    type: "share",
    username: usernameFrom(data)
  });
});

client.on(EventType.gift, (data) => {
  const username = usernameFrom(data);

  try {
    const streak = giftTracker.process(data);
    const repeatCount = Math.max(
      1,
      Number(streak?.eventGiftCount ?? data?.repeatCount ?? 1) || 1
    );
    const diamondCount = Math.max(
      1,
      Number(data?.gift?.diamondCount ?? 1) || 1
    );

    broadcast({
      id: nextId("gift"),
      type: "gift",
      username,
      giftName: String(data?.gift?.name || "Gift"),
      giftId: data?.gift?.id ?? null,
      diamondCount,
      repeatCount,
      totalDiamonds: diamondCount * repeatCount,
      isFinal: Boolean(streak?.isFinal)
    });
  } catch (err) {
    console.warn("[GIFT] fallback:", err?.message || err);
    const diamondCount = Math.max(
      1,
      Number(data?.gift?.diamondCount ?? 1) || 1
    );
    const repeatCount = Math.max(1, Number(data?.repeatCount ?? 1) || 1);

    broadcast({
      id: nextId("gift"),
      type: "gift",
      username,
      giftName: String(data?.gift?.name || "Gift"),
      giftId: data?.gift?.id ?? null,
      diamondCount,
      repeatCount,
      totalDiamonds: diamondCount * repeatCount
    });
  }
});

client.on(EventType.liveEnded, () => {
  tikTokConnected = false;
  console.log("[TIKTOK] LIVE terminou ou deixou de estar disponível.");
  broadcast({
    id: nextId("live-ended"),
    type: "liveEnded",
    username: USERNAME
  });
  broadcastStatus();
  scheduleReconnect(RECONNECT_DELAY);
});

function scheduleReconnect(delay = RECONNECT_DELAY) {
  if (shuttingDown || reconnectTimer) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectTikTok();
  }, delay);
}

async function connectTikTok() {
  if (shuttingDown || tikTokConnected || connecting) return;

  connecting = true;
  console.log(`[TIKTOK] A ligar a @${USERNAME}...`);

  try {
    await client.connect();
    tikTokConnected = true;
    console.log(`[TIKTOK] Ligado com sucesso a @${USERNAME}.`);
    broadcastStatus();
  } catch (err) {
    tikTokConnected = false;
    console.error(
      "[TIKTOK] Ligação falhou (normal se a conta não estiver LIVE):",
      err?.message || err
    );
    scheduleReconnect(RECONNECT_DELAY);
  } finally {
    connecting = false;
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);

  console.log(`[APP] ${signal} recebido; a desligar.`);
  try {
    await client.disconnect?.();
  } catch (err) {
    console.warn("[TIKTOK] Erro ao desligar:", err?.message || err);
  }

  wss.close();
  server.close(() => process.exit(0));
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

void connectTikTok();
