import http from "node:http";
import {
  TikTokLiveClient,
  EventType,
  GiftStreakTracker,
  LikeAccumulator
} from "piratetok-live-js";
import { WebSocketServer, WebSocket } from "ws";

const USERNAME = String(process.env.TIKTOK_USERNAME || "itshugoverse")
  .replace(/^@/, "")
  .trim();

const PORT = Number(process.env.PORT || 10000);

let tikTokConnected = false;
let sequence = 0;

const giftTracker = new GiftStreakTracker();
const likeAccumulator = new LikeAccumulator();

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

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      tiktokConnected: tikTokConnected,
      username: USERNAME,
      websocketClients: wss.clients.size
    }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(
    `HUGOVERSE TikTok Race Bridge
TikTok: @${USERNAME}
TikTok connected: ${tikTokConnected}
WebSocket clients: ${wss.clients.size}
`
  );
});

const wss = new WebSocketServer({ server });

function broadcast(payload) {
  const body = JSON.stringify(payload);

  for (const socket of wss.clients) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(body);
    }
  }

  console.log(
    `[OUT] ${payload.type}`,
    payload.username || "",
    payload.comment || payload.giftName || payload.count || ""
  );
}

wss.on("connection", (socket) => {
  console.log("[GAME] Browser/game ligado ao WebSocket.");

  socket.send(JSON.stringify({
    id: nextId("status"),
    type: "bridgeStatus",
    connected: tikTokConnected,
    username: USERNAME
  }));

  socket.on("close", () => {
    console.log("[GAME] Browser/game desligado.");
  });

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

  try {
    const stats = likeAccumulator.process(data);
    const count = Math.max(
      1,
      Number(stats?.accumulatedCount ?? data?.count ?? data?.likeCount ?? 1) || 1
    );

    broadcast({
      id: nextId("like"),
      type: "like",
      username,
      count,
      totalLikeCount: Number(stats?.totalLikeCount ?? data?.total ?? 0) || 0
    });
  } catch (err) {
    console.warn("[LIKE] fallback:", err?.message || err);

    broadcast({
      id: nextId("like"),
      type: "like",
      username,
      count: Math.max(1, Number(data?.count ?? data?.likeCount ?? 1) || 1)
    });
  }
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

    const repeatCount = Math.max(
      1,
      Number(data?.repeatCount ?? 1) || 1
    );

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
  console.log("[TIKTOK] LIVE terminou.");

  broadcast({
    id: nextId("live-ended"),
    type: "liveEnded",
    username: USERNAME
  });

  setTimeout(connectTikTok, 15000);
});

async function connectTikTok() {
  if (tikTokConnected) return;

  console.log(`[TIKTOK] A ligar a @${USERNAME}...`);

  try {
    await client.connect();
    tikTokConnected = true;

    console.log(`[TIKTOK] Ligado com sucesso a @${USERNAME}.`);

    broadcast({
      id: nextId("status"),
      type: "bridgeStatus",
      connected: true,
      username: USERNAME
    });
  } catch (err) {
    tikTokConnected = false;
    console.error("[TIKTOK] Ligação falhou:", err?.message || err);
    console.log("[TIKTOK] Nova tentativa em 15 segundos.");
    setTimeout(connectTikTok, 15000);
  }
}

process.on("SIGTERM", async () => {
  try { await client.disconnect?.(); } catch {}
  server.close(() => process.exit(0));
});

process.on("SIGINT", async () => {
  try { await client.disconnect?.(); } catch {}
  server.close(() => process.exit(0));
});

connectTikTok();
