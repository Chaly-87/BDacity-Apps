/* ============================================================================
   FASE 7 — Welcome TTS em português de Portugal
   ----------------------------------------------------------------------------
   OBJETIVO: dizer "Bem-vindo, {nome}." com uma voz pt-PT real.
   PROIBIDO: qualquer voz en-*, en-US, en-GB, ou depender so de utter.lang.

   Motor local: Piper pt_PT-tugão-medium (MIT). Sem fallback pt-BR/inglês.

   ARQUITETURA (servidor):
     GET /tts/welcome?name=Hugo  ->  audio/wav  (a frase ja sintetizada)
     O browser pede o WAV, toca-o num <audio>/AudioBuffer, e a musica faz
     duck para ~24% enquanto a fala toca (ver MUSIC_LEVELS.welcome no jogo).

   PORQUE SERVIDOR e NAO O BROWSER:
     - O modelo pt-PT corre no servidor e não exige G2P no browser.
     - No servidor corre o binario oficial (mesmo G2P, voz nativa).
     - O browser fica leve: nao carrega 40 MB de modelo nem 14 MB de WASM.
     - Sem custo: MIT, offline depois do 1.o download do modelo.

   SEGURANCA:
     - So aceita a frase de boas-vindas (nada mais). Whitelist de caracteres.
     - Cache LRU em memoria (o mesmo nome nao e re-sintetizado).
     - Concorrencia limitada (1 sintese de cada vez) para nao saturar a CPU.
     - Nao toca em nada da corrida: zero efeito competitivo.

   Se o motor nao estiver instalado, /tts/welcome responde 503 e o jogo
   fica em silencio (comportamento correto, nunca ingles).
   ========================================================================== */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TTS_ENABLED = !["0", "false", "off", "no"].includes(
  String(process.env.TTS_ENABLED ?? "1").trim().toLowerCase()
);

// Onde procurar o binário Piper e o modelo pt-PT.
const TTS_BIN_CANDIDATES = [
  process.env.TTS_PIPER_BIN,
  path.join(__dirname, "tts", process.platform === "win32" ? "PiperPlus.Cli.exe" : "piper-plus"),
  path.join(process.cwd(), "tts", process.platform === "win32" ? "PiperPlus.Cli.exe" : "piper-plus"),
  path.join(os.homedir(), ".local", "share", "piper-plus", "piper-plus")
].filter(Boolean);

const TTS_MODEL_CANDIDATES = [
  process.env.TTS_MODEL,
  path.join(__dirname, "tts", "pt_PT-tugao-medium.onnx"),
  path.join(process.cwd(), "tts", "pt_PT-tugao-medium.onnx")
].filter(Boolean);

const TTS_CACHE_MAX = 64;
const TTS_MAX_CONCURRENT = 2;
const TTS_TIMEOUT_MS = 12000;

let ttsReady = null;                 // memoizado
let ttsInFlight = 0;
let ttsQueueTail = Promise.resolve(); // serializa (o motor a quente e 1 processo)
const ttsCache = new Map();          // chave -> Buffer (LRU por ordem de insercao)

function firstExisting(list) {
  for (const p of list) {
    try { if (p && fs.existsSync(p)) return p; } catch { /* noop */ }
  }
  return null;
}

function firstPtPtModel() {
  for (const model of TTS_MODEL_CANDIDATES) {
    try {
      const config = JSON.parse(fs.readFileSync(model + ".json", "utf8"));
      if (fs.existsSync(model) && config?.language?.code === "pt_PT") return model;
    } catch { /* modelo ausente ou de outro idioma */ }
  }
  return null;
}

function ttsStatus() {
  const bin = firstExisting(TTS_BIN_CANDIDATES);
  const model = firstPtPtModel();
  return {
    enabled: TTS_ENABLED,
    ready: !!(bin && model),
    bin: bin ? path.basename(bin) : null,
    model: model ? path.basename(model) : null,
    voice: model ? "pt_PT-tugão-medium" : null,
    language: model ? "pt-PT" : null,
    provider: model ? "Piper TTS (MIT) — sintese neural local" : null,
    cached: ttsCache.size,
    inflight: ttsInFlight
  };
}

/* --------------------------------------------------------------------------
   Normalizacao do nome.
   A frase e FIXA: "Bem-vindo, {nome}." — nao ha CTA, nao ha "segue",
   nao ha "comenta", nao ha "obrigado". So o nome muda.

   IMPORTANTE: os ACENTOS PORTUGUESES TEM DE SER PRESERVADOS.
   "Joao" em vez de "Joao" faz a voz dizer "Joao" com o "a" aberto
   (estrangeiro); "Mencia" em vez de "Mencia" perde a nasalacao.
   Por isso: filtramos por categoria Unicode (L*), nao por um intervalo
   ASCII, e so removemos o que e realmente perigoso/ilegivel.
   -------------------------------------------------------------------------- */
function normalizeTtsName(raw) {
  let s = String(raw ?? "").trim();
  s = s.replace(/^@+/, "");
  // remove controlo/invisiveis
  s = s.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, "");
  // underscores/hifens/pontos VIRAM ESPACO ANTES do filtro, senao o filtro
  // apaga-os e "ana_luiza" ficava "analuiza" (uma palavra so).
  s = s.replace(/[_\-.]+/g, " ");
  // permite letras (com acento), numeros, espaco e apostrofo
  s = s.replace(/[^\p{L}\p{N} 'À-ſ]/gu, "");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 24) s = s.slice(0, 24).trim();
  return s;
}

function welcomePhrase(name) {
  const n = normalizeTtsName(name);
  // nome vazio/invalido -> nao fala. (o jogo trata do caso "amigo")
  if (!n || n.length < 2) return null;
  return `Bem-vindo, ${n}.`;
}

/* --------------------------------------------------------------------------
   Ganho de saida.
   O Piper devolve o WAV a 0 dBFS (pico cheio). Numa LIVE a fala vai
   somada a musica: sem margem, qualquer soma estoura (clipping).
   Aplicamos -3 dB e, se ainda assim o pico passar de -1 dBFS, normalizamos
   para -1 dBFS. Tudo in-place no Buffer, sem dependencias.
   -------------------------------------------------------------------------- */
function applyWavHeadroom(buf, targetDbfs = -3, ceilingDbfs = -1) {
  if (!Buffer.isBuffer(buf) || buf.length < 44) return buf;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return buf;

  // localiza o chunk "data"
  let pos = 12, dataStart = -1, dataLen = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === "data") { dataStart = pos + 8; dataLen = Math.min(size, buf.length - dataStart); break; }
    pos += 8 + size + (size & 1);
  }
  if (dataStart < 0 || dataLen < 2) return buf;

  let peak = 0;
  const n = dataLen >> 1;
  for (let i = 0; i < n; i++) {
    const v = Math.abs(buf.readInt16LE(dataStart + i * 2));
    if (v > peak) peak = v;
  }
  if (peak === 0) return buf;

  const target = Math.round(32767 * Math.pow(10, targetDbfs / 20));
  const ceiling = Math.round(32767 * Math.pow(10, ceilingDbfs / 20));
  let g = target / peak;
  if (peak * g > ceiling) g = ceiling / peak;      // nunca acima do tecto
  if (Math.abs(g - 1) < 0.01) return buf;          // ja esta bom

  for (let i = 0; i < n; i++) {
    const v = buf.readInt16LE(dataStart + i * 2);
    let out = Math.round(v * g);
    if (out > 32767) out = 32767;
    if (out < -32768) out = -32768;
    buf.writeInt16LE(out, dataStart + i * 2);
  }
  return buf;
}

/* Piper JSONL em processo persistente. --output_file - envia um WAV RIFF por
   frase para stdout; o tamanho RIFF delimita cada resposta sem sondar ficheiros. */
let piperWorker = null;
let piperBytes = Buffer.alloc(0);
let piperPending = null;
let piperError = "";

function stopPiperWorker(error) {
  const worker = piperWorker;
  piperWorker = null;
  piperBytes = Buffer.alloc(0);
  if (piperPending) {
    clearTimeout(piperPending.timer);
    piperPending.reject(error);
    piperPending = null;
  }
  if (worker && !worker.killed) worker.kill();
}

function readPiperWavs() {
  while (piperBytes.length >= 12) {
    if (piperBytes.toString("ascii", 0, 4) !== "RIFF" ||
        piperBytes.toString("ascii", 8, 12) !== "WAVE") {
      stopPiperWorker(new Error("Piper devolveu audio invalido"));
      return;
    }
    const size = piperBytes.readUInt32LE(4) + 8;
    if (size < 44 || size > 10_000_000) {
      stopPiperWorker(new Error("Piper devolveu tamanho WAV invalido"));
      return;
    }
    if (piperBytes.length < size) return;
    const wav = piperBytes.subarray(0, size);
    piperBytes = piperBytes.subarray(size);
    if (!piperPending) {
      stopPiperWorker(new Error("Resposta Piper sem pedido"));
      return;
    }
    const pending = piperPending;
    piperPending = null;
    clearTimeout(pending.timer);
    pending.resolve(wav);
  }
}

function ensurePiperWorker() {
  if (piperWorker) return piperWorker;
  const bin = firstExisting(TTS_BIN_CANDIDATES);
  const model = firstPtPtModel();
  if (!bin || !model) throw new Error("TTS indisponivel (binario ou modelo em falta)");
  piperError = "";
  const worker = spawn(bin, [
    "--model", model, "--language", "pt", "--json-input",
    "--output_file", "-", "--length_scale", "1.1",
    "--sentence_silence", "0.3", "--quiet"
  ], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  piperWorker = worker;
  worker.stdout.on("data", (chunk) => {
    piperBytes = Buffer.concat([piperBytes, chunk]);
    readPiperWavs();
  });
  worker.stderr.on("data", (chunk) => { piperError = (piperError + chunk).slice(-500); });
  worker.on("error", (err) => stopPiperWorker(err));
  worker.on("close", (code) => {
    if (piperWorker === worker) stopPiperWorker(new Error(`Piper saiu com codigo ${code}: ${piperError}`));
  });
  return worker;
}

function runPiper(text) {
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = ensurePiperWorker(); } catch (error) { reject(error); return; }
    if (piperPending) { reject(new Error("Piper ocupado")); return; }
    const timer = setTimeout(() => stopPiperWorker(new Error("TTS timeout")), TTS_TIMEOUT_MS);
    piperPending = { resolve, reject, timer };
    worker.stdin.write(JSON.stringify({ text }) + "\n", (error) => {
      if (error) stopPiperWorker(error);
    });
  });
}

function prewarmTts() {
  if (!TTS_ENABLED || !ttsStatus().ready) return;
  synthWelcome("Hugo").catch((error) => console.warn("[TTS] prewarm falhou:", error.message));
}

function closeTts() {
  stopPiperWorker(new Error("Servidor a desligar"));
}

async function synthWelcome(name) {
  const text = welcomePhrase(name);
  if (!text) return null;
  const key = crypto.createHash("sha1").update(text).digest("hex");
  if (ttsCache.has(key)) {
    const hit = ttsCache.get(key);
    ttsCache.delete(key); ttsCache.set(key, hit);   // LRU touch
    return { wav: hit, text, cached: true };
  }
  if (ttsInFlight >= TTS_MAX_CONCURRENT) throw new Error("TTS sobrecarregado");
  // o motor a quente e UM processo: serializa para nunca intercalar pedidos
  const run = ttsQueueTail.then(async () => {
    ttsInFlight += 1;
    try {
      const raw = await runPiper(text);
      const wav = applyWavHeadroom(raw, -3, -1);
      ttsCache.set(key, wav);
      while (ttsCache.size > TTS_CACHE_MAX) {
        const oldest = ttsCache.keys().next().value;
        ttsCache.delete(oldest);
      }
      return { wav, text, cached: false };
    } finally {
      ttsInFlight -= 1;
    }
  });
  ttsQueueTail = run.then(() => {}, () => {});
  return run;
}

function handleTtsWelcome(req, res, requestUrl) {
  const name = requestUrl.searchParams.get("name") || "";
  const phrase = welcomePhrase(name);

  if (!TTS_ENABLED) {
    res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, reason: "TTS desativado" }));
    return;
  }
  if (!phrase) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, reason: "nome invalido" }));
    return;
  }
  const status = ttsStatus();
  if (!status.ready) {
    res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, reason: "motor TTS nao instalado", status }));
    return;
  }

  const t0 = Date.now();
  synthWelcome(name)
    .then((out) => {
      if (!out) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, reason: "nome invalido" }));
        return;
      }
      res.writeHead(200, {
        "Content-Type": "audio/wav",
        "Content-Length": out.wav.length,
        "Cache-Control": "no-store",
        "X-TTS-Provider": "piper",
        "X-TTS-Voice": "pt_PT-tugão-medium",
        "X-TTS-Language": "pt-PT",
        "X-TTS-Text": encodeURIComponent(out.text),
        "X-TTS-Synth-Ms": String(Date.now() - t0),
        "X-TTS-Cached": out.cached ? "1" : "0"
      });
      res.end(out.wav);
    })
    .catch((err) => {
      console.warn("[TTS] falha:", err?.message || err);
      res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, reason: String(err?.message || err) }));
    });
}

function handleTtsStatus(res) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(ttsStatus(), null, 2));
}

export {
  handleTtsWelcome, handleTtsStatus, ttsStatus,
  normalizeTtsName, welcomePhrase, applyWavHeadroom, prewarmTts, closeTts
};
