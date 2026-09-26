import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  TikTokLiveClient,
  EventType,
  GiftStreakTracker
} from "piratetok-live-js";
import { WebSocketServer, WebSocket } from "ws";
import { handleTtsWelcome, handleTtsStatus, prewarmTts, closeTts } from "./welcome-tts.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = __dirname;

// ---------------------------------------------------------------------------
// Configuração de segurança (env opcional; defaults conservadores)
// ---------------------------------------------------------------------------
const WS_PATH = "/ws";

function readIntEnv(name, fallback, min = 1) {
  const raw = process.env[name];
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

function readNonNegativeIntEnv(name, fallback) {
  const raw = process.env[name];
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function readBoolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return !["0", "false", "off", "no"].includes(String(raw).trim().toLowerCase());
}

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function parseAllowedOrigins(raw) {
  const origins = new Set();
  const hosts = new Set();
  const tokens = String(raw || "")
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (token === "*") {
      console.warn("[SEC] ALLOWED_ORIGINS contém '*' — wildcard ignorado.");
      continue;
    }
    if (token.includes("://")) {
      const normalized = normalizeOrigin(token);
      if (normalized) origins.add(normalized);
      else console.warn(`[SEC] ALLOWED_ORIGINS inválido ignorado: ${token}`);
      continue;
    }
    hosts.add(token.toLowerCase().replace(/\/+$/, ""));
  }

  return { origins, hosts };
}

function readVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
    return String(pkg.version || "0.0.0");
  } catch {
    return "0.0.0";
  }
}

function readGitCommit() {
  const envCommit =
    process.env.RENDER_GIT_COMMIT ||
    process.env.GIT_COMMIT ||
    process.env.COMMIT_SHA;
  if (envCommit) return String(envCommit).trim();

  try {
    let dir = __dirname;
    for (let depth = 0; depth < 6; depth += 1) {
      const gitPath = path.join(dir, ".git");
      if (!fs.existsSync(gitPath)) {
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
        continue;
      }

      let gitDir = gitPath;
      if (fs.statSync(gitPath).isFile()) {
        const link = fs.readFileSync(gitPath, "utf8").trim();
        const match = link.match(/^gitdir:\s*(.+)$/);
        if (!match) return null;
        gitDir = path.resolve(dir, match[1].trim());
      }

      const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
      if (head.startsWith("ref:")) {
        const ref = head.slice(4).trim();
        const refFile = path.join(gitDir, ref);
        if (fs.existsSync(refFile)) {
          return fs.readFileSync(refFile, "utf8").trim().slice(0, 40);
        }
        const packed = path.join(gitDir, "packed-refs");
        if (fs.existsSync(packed)) {
          const line = fs
            .readFileSync(packed, "utf8")
            .split(/\r?\n/)
            .find((entry) => entry.endsWith(` ${ref}`));
          if (line) return line.split(" ")[0].slice(0, 40);
        }
        return null;
      }
      return head.slice(0, 40);
    }
  } catch {
    return null;
  }
  return null;
}

const USERNAME = String(process.env.TIKTOK_USERNAME || "itshugoverse")
  .replace(/^@/, "")
  .trim();
const PORT = readIntEnv("PORT", 10000);
const RECONNECT_DELAY = 15000;

const MAX_WS_CLIENTS = readIntEnv("MAX_WS_CLIENTS", 10);
const WS_MAX_PAYLOAD_BYTES = readIntEnv("WS_MAX_PAYLOAD_BYTES", 64 * 1024);
const WS_BACKPRESSURE_BYTES = readIntEnv("WS_BACKPRESSURE_BYTES", 256 * 1024);
const WS_MAX_BUFFERED_BYTES = readIntEnv("WS_MAX_BUFFERED_BYTES", 1024 * 1024);
const WS_UPGRADE_RATE_LIMIT = readNonNegativeIntEnv("WS_UPGRADE_RATE_LIMIT", 30);
const WS_UPGRADE_RATE_WINDOW_MS = readIntEnv("WS_UPGRADE_RATE_WINDOW_MS", 60000);
const BRIDGE_TOKEN =
  typeof process.env.BRIDGE_TOKEN === "string" && process.env.BRIDGE_TOKEN.trim()
    ? process.env.BRIDGE_TOKEN.trim()
    : null;
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const TIKTOK_ENABLED = readBoolEnv("TIKTOK_ENABLED", true);
const WS_TEST_HOOKS = readBoolEnv("WS_TEST_HOOKS", false);

const VERSION = readVersion();
const COMMIT = readGitCommit();
const STARTED_AT = Date.now();

let tikTokConnected = false;
let connectionState = "disconnected";
let connecting = false;
let shuttingDown = false;
let sequence = 0;
let reconnectTimer = null;
let pendingHandshakes = 0;

const upgradeRateBuckets = new Map();
const wsStats = {
  droppedMessages: 0,
  backpressureClosures: 0,
  rejectedUpgrades: 0
};

const giftTracker = new GiftStreakTracker();

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function setConnectionState(next) {
  if (connectionState === next) return;
  connectionState = next;
  console.log(`[STATE] ${next}`);
}

function setTikTokConnected(connected, state = connected ? "connected" : "disconnected") {
  if (shuttingDown && state !== "shuttingDown") return;
  tikTokConnected = Boolean(connected);
  setConnectionState(shuttingDown ? "shuttingDown" : state);
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

// ---------------------------------------------------------------------------
// CORS / Origin policy
// ---------------------------------------------------------------------------
function isOriginAllowed(origin, req) {
  // Clientes não-browser (connectors Node) podem não enviar Origin.
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (ALLOWED_ORIGINS.origins.has(normalized)) return true;

  let originUrl;
  try {
    originUrl = new URL(normalized);
  } catch {
    return false;
  }

  const hostHeader = String(req.headers.host || "").toLowerCase();
  if (hostHeader && originUrl.host.toLowerCase() === hostHeader) return true;

  const originHost = originUrl.host.toLowerCase();
  const originHostname = originUrl.hostname.toLowerCase();
  if (ALLOWED_ORIGINS.hosts.has(originHost)) return true;
  if (ALLOWED_ORIGINS.hosts.has(originHostname)) return true;

  return ["localhost", "127.0.0.1", "::1"].includes(originHostname);
}

function applyCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (!origin || !isOriginAllowed(origin, req)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Bridge-Token");
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
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

function healthPayload() {
  const state = shuttingDown ? "shuttingDown" : connectionState;
  return {
    ok: true,
    status: state,
    state,
    tiktokConnected: tikTokConnected && !shuttingDown,
    tikTokConnected: tikTokConnected && !shuttingDown,
    websocketClients: wss.clients.size,
    maxWsClients: MAX_WS_CLIENTS,
    username: USERNAME,
    wsPath: WS_PATH,
    uptime: Math.floor(process.uptime()),
    uptimeSeconds: Math.floor(process.uptime()),
    version: VERSION,
    commit: COMMIT,
    startedAt: new Date(STARTED_AT).toISOString(),
    wsDroppedMessages: wsStats.droppedMessages,
    wsBackpressureClosures: wsStats.backpressureClosures
  };
}

const server = http.createServer((req, res) => {
  applyCorsHeaders(req, res);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestPath = new URL(req.url || "/", "http://localhost").pathname;

  if (requestPath === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(healthPayload()));
    return;
  }

  if (requestPath === "/favicon.ico") {
    res.writeHead(204, { "Content-Type": "image/x-icon" });
    res.end();
    return;
  }

  // -------------------------------------------------------------------------
  // FASE 6B FINAL — Welcome TTS em portugues NATIVO (nunca en-*)
  //   GET /tts/status            -> estado do motor
  //   GET /tts/welcome?name=X    -> audio/wav com "Bem-vindo, X."
  // Se o motor nao estiver instalado responde 503 e o jogo fica em
  // silencio — nunca faz fallback para uma voz inglesa.
  // -------------------------------------------------------------------------
  if (requestPath === "/tts/welcome") {
    handleTtsWelcome(req, res, new URL(req.url || "/", "http://localhost"));
    return;
  }
  if (requestPath === "/tts/status") {
    handleTtsStatus(res);
    return;
  }

  if (requestPath === "/" || requestPath === "/index.html") {
    serveFile(res, path.join(PUBLIC_DIR, "index.html"), "text/html; charset=utf-8");
    return;
  }

  const staticAssets = {
    "/race-logic.js": ["race-logic.js", "text/javascript; charset=utf-8"],
    "/track-geometry.js": ["track-geometry.js", "text/javascript; charset=utf-8"],
    "/app.js": ["app.js", "text/javascript; charset=utf-8"],
    "/assets/neon-world.jpg": ["public/neon-world.jpg", "image/jpeg"],
    "/assets/neon-kart.png": ["public/neon-kart.png", "image/png"],
    "/assets/kart-team-0.png": ["public/kart-team-0.png", "image/png"],
    "/assets/kart-team-1.png": ["public/kart-team-1.png", "image/png"],
    "/assets/kart-team-2.png": ["public/kart-team-2.png", "image/png"],
    "/assets/kart-team-3.png": ["public/kart-team-3.png", "image/png"],
    "/assets/neon-funk.wav": ["public/neon-funk.wav", "audio/wav"],
    "/assets/live-track.mp3": ["public/live-track.mp3", "audio/mpeg"],
    "/assets/host-avatar.mp4": ["public/host-avatar.mp4", "video/mp4"],
    "/assets/host-poster.jpg": ["public/host-poster.jpg", "image/jpeg"],
    "/assets/psyfunk.mp3": ["public/psyfunk.mp3", "audio/mpeg"],
    "/assets/neon-rush-official.mp3": ["public/neon-rush-official.mp3", "audio/mpeg"],
    "/neon-rush.css": ["neon-rush.css", "text/css; charset=utf-8"]
  };
  if (Object.hasOwn(staticAssets, requestPath)) {
    const [file, mime] = staticAssets[requestPath];
    serveFile(res, path.join(PUBLIC_DIR, file), mime);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: WS_MAX_PAYLOAD_BYTES,
  perMessageDeflate: false
});

function safeSend(socket, body) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;

  const buffered = Number(socket.bufferedAmount) || 0;
  if (buffered > WS_MAX_BUFFERED_BYTES) {
    wsStats.backpressureClosures += 1;
    console.warn(
      `[WS] Backpressure crítica (${buffered} bytes) — a fechar cliente.`
    );
    try {
      socket.close(1013, "Backpressure");
    } catch {
      try {
        socket.terminate();
      } catch {
        /* noop */
      }
    }
    return false;
  }

  if (buffered > WS_BACKPRESSURE_BYTES) {
    wsStats.droppedMessages += 1;
    return false;
  }

  try {
    socket.send(body);
    return true;
  } catch (err) {
    console.warn("[WS] Falha ao enviar:", err?.message || err);
    try {
      socket.close(1011, "Send failed");
    } catch {
      try {
        socket.terminate();
      } catch {
        /* noop */
      }
    }
    return false;
  }
}

function broadcast(payload) {
  const body = JSON.stringify(payload);

  for (const socket of wss.clients) {
    safeSend(socket, body);
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
    connected: tikTokConnected && !shuttingDown,
    username: USERNAME
  });
}

function abortUpgrade(socket, code, message) {
  if (!socket || socket.destroyed) return;
  const statusText = http.STATUS_CODES[code] || "Error";
  const body = message ? `${message}\n` : "";
  const payload =
    `HTTP/1.1 ${code} ${statusText}\r\n` +
    "Connection: close\r\n" +
    "Content-Type: text/plain; charset=utf-8\r\n" +
    `Content-Length: ${Buffer.byteLength(body)}\r\n` +
    "\r\n" +
    body;

  try {
    socket.end(payload, () => {
      if (!socket.destroyed) socket.destroy();
    });
  } catch {
    try {
      socket.destroy();
    } catch {
      /* noop */
    }
  }
}

function rejectUpgrade(socket, code, reason, message) {
  wsStats.rejectedUpgrades += 1;
  console.warn(`[SEC] Upgrade rejeitado (${code} ${reason}): ${message}`);
  abortUpgrade(socket, code, message);
}

function clientIp(req) {
  return req.socket?.remoteAddress || "unknown";
}

function allowUpgradeRate(ip, now = Date.now()) {
  if (WS_UPGRADE_RATE_LIMIT <= 0) return true;

  let bucket = upgradeRateBuckets.get(ip);
  if (!bucket) {
    bucket = [];
    upgradeRateBuckets.set(ip, bucket);
  }

  while (bucket.length && now - bucket[0] > WS_UPGRADE_RATE_WINDOW_MS) {
    bucket.shift();
  }

  if (bucket.length >= WS_UPGRADE_RATE_LIMIT) return false;
  bucket.push(now);

  if (upgradeRateBuckets.size > 5000) {
    for (const [key, entries] of upgradeRateBuckets) {
      if (!entries.length) upgradeRateBuckets.delete(key);
    }
  }
  return true;
}

function extractProvidedToken(req) {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const queryToken = url.searchParams.get("token") || url.searchParams.get("bridge_token");
    if (queryToken) return queryToken;
  } catch {
    /* noop */
  }

  const headerToken = req.headers["x-bridge-token"];
  if (typeof headerToken === "string" && headerToken) return headerToken;

  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && /^Bearer\s+/i.test(authorization)) {
    return authorization.replace(/^Bearer\s+/i, "").trim() || null;
  }

  return null;
}

function bridgeTokenValid(provided) {
  if (!BRIDGE_TOKEN) return true;
  if (typeof provided !== "string" || !provided) return false;

  const left = crypto.createHash("sha256").update(provided).digest();
  const right = crypto.createHash("sha256").update(BRIDGE_TOKEN).digest();
  return crypto.timingSafeEqual(left, right);
}

server.on("upgrade", (req, socket, head) => {
  const ip = clientIp(req);

  if (shuttingDown) {
    rejectUpgrade(socket, 503, "Service Unavailable", "Server shutting down");
    return;
  }

  let pathname = null;
  try {
    pathname = new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    pathname = null;
  }

  if (pathname !== WS_PATH) {
    rejectUpgrade(socket, 400, "Bad Request", "WebSocket path must be /ws");
    return;
  }

  if (req.method !== "GET") {
    rejectUpgrade(socket, 405, "Method Not Allowed", "Invalid HTTP method");
    return;
  }

  if (!allowUpgradeRate(ip)) {
    rejectUpgrade(socket, 429, "Too Many Requests", "Too many upgrade requests");
    return;
  }

  if (!isOriginAllowed(req.headers.origin, req)) {
    rejectUpgrade(socket, 403, "Forbidden", `Origin not allowed: ${req.headers.origin}`);
    return;
  }

  if (!bridgeTokenValid(extractProvidedToken(req))) {
    rejectUpgrade(socket, 401, "Unauthorized", "Invalid bridge token");
    return;
  }

  if (wss.clients.size + pendingHandshakes >= MAX_WS_CLIENTS) {
    rejectUpgrade(
      socket,
      429,
      "Too Many Requests",
      `Too many WebSocket clients (max ${MAX_WS_CLIENTS})`
    );
    return;
  }

  let settled = false;
  const settlePending = () => {
    if (settled) return;
    settled = true;
    pendingHandshakes = Math.max(0, pendingHandshakes - 1);
  };

  pendingHandshakes += 1;
  socket.once("close", settlePending);

  try {
    wss.handleUpgrade(req, socket, head, (ws, request) => {
      settlePending();
      wss.emit("connection", ws, request);
    });
  } catch (err) {
    settlePending();
    rejectUpgrade(socket, 500, "Internal Server Error", "WebSocket upgrade failed");
    console.warn("[WS] Upgrade falhou:", err?.message || err);
  }
});

wss.on("connection", (socket, req) => {
  if (shuttingDown) {
    try {
      socket.close(1001, "Server shutting down");
    } catch {
      try {
        socket.terminate();
      } catch {
        /* noop */
      }
    }
    return;
  }

  if (wss.clients.size > MAX_WS_CLIENTS) {
    console.warn("[WS] Limite de clientes excedido após handshake; a fechar extra.");
    try {
      socket.close(1013, "Too many clients");
    } catch {
      try {
        socket.terminate();
      } catch {
        /* noop */
      }
    }
    return;
  }

  console.log(`[GAME] Jogo ligado ao WebSocket (${clientIp(req)}).`);
  safeSend(
    socket,
    JSON.stringify({
      id: nextId("status"),
      type: "bridgeStatus",
      connected: tikTokConnected && !shuttingDown,
      username: USERNAME
    })
  );

  socket.on("message", () => {
    // Mensagens do cliente são ignoradas (bridge é broadcast-only).
  });
  socket.on("close", () => console.log("[GAME] Jogo desligado."));
  socket.on("error", (err) => {
    console.warn("[GAME] WebSocket error:", err?.message || err);
  });
});

// ---------------------------------------------------------------------------
// TikTok client + estado de ligação
// ---------------------------------------------------------------------------
const client = new TikTokLiveClient(USERNAME)
  .cdnEU()
  .timeout(15000)
  .maxRetries(20)
  .staleTimeout(90000)
  .language("pt")
  .region("PT");

client.on(EventType.connected, () => {
  if (shuttingDown) return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  setTikTokConnected(true, "connected");
  console.log(`[TIKTOK] Ligado com sucesso a @${USERNAME}.`);
  broadcastStatus();
});

client.on(EventType.reconnecting, (data) => {
  if (shuttingDown) return;
  setTikTokConnected(false, "reconnecting");
  if (data?.attempt) {
    console.log(`[TIKTOK] Reconexão interna #${data.attempt}...`);
  }
  broadcastStatus();
});

client.on(EventType.disconnected, () => {
  if (shuttingDown) return;
  setTikTokConnected(false, "disconnected");
  console.log("[TIKTOK] Cliente TikTok desligado.");
  broadcastStatus();
  scheduleReconnect(RECONNECT_DELAY);
});

client.on("error", (err) => {
  console.warn("[TIKTOK] Erro do cliente:", err?.message || err);
});

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

client.on(EventType.join, (data) => {
  // FASE 5.8 — join é exclusivamente social: apenas encaminha para o jogo.
  broadcast({
    id: nextId("join"),
    type: "join",
    username: usernameFrom(data),
    userId: data?.user?.id != null ? String(data.user.id) : null,
    uniqueId: data?.user?.uniqueId ?? null
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
  if (shuttingDown) return;
  setTikTokConnected(false, "disconnected");
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

  setTikTokConnected(false, "reconnecting");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectTikTok();
  }, delay);
}

async function connectTikTok() {
  if (shuttingDown || tikTokConnected || connecting) return;

  connecting = true;
  setConnectionState("connecting");
  console.log(`[TIKTOK] A ligar a @${USERNAME}...`);

  try {
    // connect() resolve quando o loop de streaming termina (disconnect/erro).
    await client.connect();
    if (!shuttingDown) {
      setTikTokConnected(
        false,
        reconnectTimer ? "reconnecting" : "disconnected"
      );
      console.log("[TIKTOK] Ligação TikTok terminada.");
      scheduleReconnect(RECONNECT_DELAY);
    }
  } catch (err) {
    if (!shuttingDown) {
      setTikTokConnected(
        false,
        reconnectTimer ? "reconnecting" : "disconnected"
      );
      console.error(
        "[TIKTOK] Ligação falhou (normal se a conta não estiver LIVE):",
        err?.message || err
      );
      scheduleReconnect(RECONNECT_DELAY);
    }
  } finally {
    connecting = false;
    if (!shuttingDown && !tikTokConnected && !reconnectTimer) {
      setConnectionState("disconnected");
    }
  }
}

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------
function closeWebSocketServer() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const forceTimer = setTimeout(() => {
      for (const socket of [...wss.clients]) {
        try {
          socket.terminate();
        } catch {
          /* noop */
        }
      }
      finish();
    }, 1500);

    try {
      wss.close(() => {
        clearTimeout(forceTimer);
        finish();
      });
    } catch {
      clearTimeout(forceTimer);
      finish();
    }
  });
}

function closeHttpServer() {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const forceTimer = setTimeout(() => {
      if (typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      }
      finish();
    }, 1500);

    server.close(() => {
      clearTimeout(forceTimer);
      finish();
    });

    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
  });
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  tikTokConnected = false;
  setConnectionState("shuttingDown");

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  console.log(`[APP] ${signal} recebido; a desligar.`);
  closeTts();

  for (const socket of [...wss.clients]) {
    try {
      socket.close(1001, "Server shutting down");
    } catch {
      try {
        socket.terminate();
      } catch {
        /* noop */
      }
    }
  }

  try {
    client.disconnect?.();
  } catch (err) {
    console.warn("[TIKTOK] Erro ao desligar:", err?.message || err);
  }

  await closeWebSocketServer();
  await closeHttpServer();
  console.log("[APP] Desligado com sucesso.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Hooks de teste (apenas quando WS_TEST_HOOKS=1; nunca em produção)
// ---------------------------------------------------------------------------
if (WS_TEST_HOOKS && typeof process.send === "function") {
  process.on("message", (msg) => {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "broadcast") {
      const count = Math.min(200, Math.max(1, Number(msg.count) || 1));
      const size = Math.min(1024 * 1024, Math.max(1, Number(msg.size) || 1024));
      const data = "x".repeat(size);
      for (let index = 0; index < count; index += 1) {
        broadcast({
          id: nextId("test"),
          type: "testBroadcast",
          data
        });
      }
      return;
    }

    if (msg.type === "mark-tiktok-connected") {
      if (!shuttingDown) setTikTokConnected(true, "connected");
      return;
    }

    if (msg.type === "join") {
      broadcast({
        id: nextId("join"),
        type: "join",
        username: String(msg.username || "@viewer"),
        userId: msg.userId != null ? String(msg.userId) : null,
        uniqueId: msg.uniqueId ?? null
      });
      return;
    }

    if (msg.type === "tiktok-disconnect") {
      try {
        client.disconnect?.();
      } catch (err) {
        console.warn("[TEST] disconnect falhou:", err?.message || err);
      }
      if (!shuttingDown) setTikTokConnected(false, "disconnected");
      return;
    }

    if (msg.type === "shutdown") {
      void shutdown(String(msg.signal || "TEST"));
    }
  });
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
server.listen(PORT, "0.0.0.0", () => {
  console.log("=============================================");
  console.log(" HUGOVERSE TikTok Race Bridge");
  console.log("=============================================");
  console.log(`TikTok: @${USERNAME}`);
  console.log(`HTTP/WebSocket port: ${PORT}`);
  console.log(`Game: /`);
  console.log(`WebSocket: ${WS_PATH}`);
  console.log(`Health: /health`);
  console.log(`Max WS clients: ${MAX_WS_CLIENTS}`);
  console.log(`Max WS payload: ${WS_MAX_PAYLOAD_BYTES} bytes`);
  console.log(`Origins: same-host + localhost + ${ALLOWED_ORIGINS.origins.size + ALLOWED_ORIGINS.hosts.size} explícitos`);
  if (BRIDGE_TOKEN) {
    console.log("BRIDGE_TOKEN: ativo (handshake exigido)");
  } else {
    console.warn(
      "[SEC] BRIDGE_TOKEN não definido — handshake WS sem token (compatibilidade local/dev). Definir BRIDGE_TOKEN em produção."
    );
  }
  if (!TIKTOK_ENABLED) {
    console.log("[TIKTOK] TIKTOK_ENABLED=0 — ligação TikTok desativada.");
  }
  console.log("=============================================\n");
  if (!WS_TEST_HOOKS && readBoolEnv("TTS_PREWARM", true)) prewarmTts();
});

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

if (TIKTOK_ENABLED) {
  void connectTikTok();
} else {
  setConnectionState("disconnected");
}
