// ============================================================================
// CNPJ ASSISTANT v4.3.0 - Redis Session + Claude CLI --resume + Bug Fixes
// ============================================================================

const express = require("express");
const { spawn } = require("child_process");
const Redis = require("ioredis");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json({ limit: "10mb" }));

const config = {
  port: process.env.PORT || 3025,
  serviceName: process.env.SERVICE_NAME || "cnpj-assistant",
  version: "4.3.0",
  evolutionUrl: process.env.EVOLUTION_API_URL || "https://evolutionapi2.sdebot.top",
  evolutionKey: process.env.EVOLUTION_API_KEY || "",
  evolutionInstance: process.env.EVOLUTION_INSTANCE || "R",
  groupId: process.env.WHATSAPP_GROUP_ID || "",
  botPrefix: process.env.BOT_PREFIX || "CLAUDE:",
  backendUrl: process.env.BACKEND_API_URL || "http://cnpj-cli:3015",
  claudeTimeout: parseInt(process.env.CLAUDE_TIMEOUT_MS) || 180000,
  redisUrl: process.env.REDIS_URL || "redis://redis:6379",
  sessionTtl: parseInt(process.env.SESSION_TTL_SECONDS) || 1800,
  promptFile: process.env.PROMPT_FILE || "prompts/system-prompt.md",
};

// ============================================================================
// BUG FIX #2: Lock por groupId para evitar race condition em sessoes
// ============================================================================
const sessionLocks = new Map();

async function acquireLock(groupId, timeoutMs = 310000) {
  const start = Date.now();
  while (sessionLocks.has(groupId)) {
    if (Date.now() - start > timeoutMs) {
      console.warn("[Lock] Timeout aguardando lock para " + groupId);
      return false;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  sessionLocks.set(groupId, Date.now());
  return true;
}

function releaseLock(groupId) {
  sessionLocks.delete(groupId);
}
// ============================================================================
// TIER 2: Rate Limiting por grupo (5 req/min)
// ============================================================================
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 5;

function checkRateLimit(groupId) {
  const now = Date.now();
  const key = groupId;
  
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }
  
  const entry = rateLimitMap.get(key);
  
  // Reset window if expired
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.count = 1;
    entry.windowStart = now;
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }
  
  // Check limit
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    const waitTime = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)) / 1000);
    return { allowed: false, remaining: 0, waitTime };
  }
  
  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count };
}


// ============================================================================
// BUG FIX #6: Validacao de UUID para session IDs
// ============================================================================
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidSessionId(sessionId) {
  return sessionId && UUID_REGEX.test(sessionId);
}

// ============================================================================
// Redis Connection
// ============================================================================
const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  retryDelayOnFailover: 100,
  enableReadyCheck: true
});

redis.on("connect", () => console.log("[Redis] Conectado"));
redis.on("error", (err) => console.error("[Redis] Erro:", err.message));
redis.on("close", () => console.warn("[Redis] Conexao fechada"));

// ============================================================================
// Prompt Loading
// ============================================================================
function loadPrompt() {
  const promptPath = path.join(__dirname, config.promptFile);
  if (!fs.existsSync(promptPath)) return "Voce e um assistente.";
  let prompt = fs.readFileSync(promptPath, "utf-8");
  prompt = prompt
    .replace(/\{\{CNPJ_CLI_URL\}\}/g, config.backendUrl)
    .replace(/\{\{BACKEND_API_URL\}\}/g, config.backendUrl)
    .replace(/\{\{BOT_PREFIX\}\}/g, config.botPrefix)
    .replace(/\{\{SERVICE_NAME\}\}/g, config.serviceName);
  console.log("[Config] Prompt: " + promptPath + " (" + prompt.length + " chars)");
  return prompt;
}

let SYSTEM_PROMPT = loadPrompt();

// ============================================================================
// Session Management
// ============================================================================
function getSessionKey(groupId) { return "cnpj:session:" + groupId; }

async function getSessionId(groupId) {
  try {
    const sessionId = await redis.get(getSessionKey(groupId));
    // BUG FIX #6: Validar UUID antes de retornar
    if (sessionId && !isValidSessionId(sessionId)) {
      console.warn("[Session] ID invalido encontrado, limpando: " + sessionId);
      await clearSession(groupId);
      return null;
    }
    return sessionId;
  } catch (e) {
    console.error("[Session] Erro ao buscar: " + e.message);
    return null;
  }
}

async function saveSessionId(groupId, sessionId) {
  try {
    // BUG FIX #6: Validar UUID antes de salvar
    if (!isValidSessionId(sessionId)) {
      console.warn("[Session] Tentativa de salvar ID invalido: " + sessionId);
      return false;
    }
    await redis.setex(getSessionKey(groupId), config.sessionTtl, sessionId);
    return true;
  } catch (e) {
    console.error("[Session] Erro ao salvar: " + e.message);
    return false;
  }
}

async function clearSession(groupId) {
  try {
    await redis.del(getSessionKey(groupId));
    console.log("[Session] Limpa para " + groupId.slice(0, 15) + "...");
    return true;
  } catch (e) {
    console.error("[Session] Erro ao limpar: " + e.message);
    return false;
  }
}

// ============================================================================
// BUG FIX #4: Lista especifica de erros que invalidam sessao
// ============================================================================
const SESSION_INVALIDATING_ERRORS = [
  "session not found",
  "session expired",
  "invalid session",
  "conversation id not found",
  "conversation not found",
  "resume failed",
  "could not resume"
];

function shouldClearSession(stderr) {
  const lower = stderr.toLowerCase();
  return SESSION_INVALIDATING_ERRORS.some(err => lower.includes(err));
}

// ============================================================================
// Claude CLI Integration - COM TODOS OS BUG FIXES
// ============================================================================
async function sendToClaude(groupId, message) {
  // BUG FIX #2: Adquirir lock antes de processar
  const lockAcquired = await acquireLock(groupId);
  if (!lockAcquired) {
    return {
      text: config.botPrefix + " Sistema ocupado. Aguarde e tente novamente.",
      error: true
    };
  }

  try {
    return await new Promise(async (resolve) => {
      const startTime = Date.now();
      const sessionId = await getSessionId(groupId);
      const fullPrompt = sessionId ? message : SYSTEM_PROMPT + "\n\nMensagem:\n" + message;
      const args = ["-p", "--output-format", "json", "--dangerously-skip-permissions"];

      if (sessionId) {
        args.unshift("--resume", sessionId);
        console.log("[Claude] Resumindo: " + sessionId.slice(0, 8) + "...");
      } else {
        console.log("[Claude] Nova sessao");
      }

      const claude = spawn("claude", args, {
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"]
      });

      let stdout = "", stderr = "", killed = false, resolved = false;

      // Helper para resolver apenas uma vez
      const safeResolve = (result) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      };

      // BUG FIX #1: SIGKILL + cleanup de processos zombie
      const timeoutId = setTimeout(async () => {
        if (!killed && !resolved) {
          killed = true;
          console.warn("[Claude] Timeout atingido (" + config.claudeTimeout + "ms), matando processo...");

          // Tentar SIGTERM primeiro
          claude.kill("SIGTERM");

          // Se nao morrer em 5s, usar SIGKILL
          setTimeout(() => {
            try {
              claude.kill("SIGKILL");
            } catch (e) {
              // Processo ja morreu
            }
          }, 5000);

          // Limpar sessao em timeout para evitar estado corrompido
          await clearSession(groupId);

          safeResolve({
            text: config.botPrefix + " Timeout na consulta. Tente uma pergunta mais especifica.",
            error: true
          });
        }
      }, config.claudeTimeout);

      claude.stdout.on("data", (d) => { stdout += d.toString(); });
      claude.stderr.on("data", (d) => { stderr += d.toString(); });

      claude.on("close", async (code, signal) => {
        clearTimeout(timeoutId);

        if (killed || resolved) {
          console.log("[Claude] Processo encerrado (killed=" + killed + ", signal=" + signal + ")");
          return;
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        if (code !== 0) {
          console.error("[Claude] Erro code " + code + ": " + stderr.slice(0, 300));

          // BUG FIX #4: Limpeza especifica de sessao
          if (shouldClearSession(stderr)) {
            await clearSession(groupId);
            console.log("[Claude] Sessao limpa por erro especifico de sessao");
          }

          safeResolve({
            text: config.botPrefix + " Erro ao processar. Tente novamente.",
            error: true
          });
          return;
        }

        try {
          const lines = stdout.trim().split("\n");
          const result = JSON.parse(lines[lines.length - 1]);

          if (result.session_id) {
            const saved = await saveSessionId(groupId, result.session_id);
            if (saved) {
              console.log("[Claude] Session salva: " + result.session_id.slice(0, 8) + "...");
            }
          }

          let response = result.result || "";
          if (!response.startsWith(config.botPrefix)) {
            response = config.botPrefix + " " + response;
          }

          console.log("[Claude] (" + duration + "s): " + response.slice(0, 80) + "...");
          safeResolve({
            text: response,
            sessionId: result.session_id,
            duration: duration
          });
        } catch (e) {
          console.error("[Claude] Parse error: " + e.message);
          let response = stdout.trim();
          if (!response.startsWith(config.botPrefix)) {
            response = config.botPrefix + " " + response;
          }
          safeResolve({ text: response });
        }
      });

      claude.on("error", (err) => {
        clearTimeout(timeoutId);
        console.error("[Claude] Spawn error: " + err.message);
        safeResolve({
          text: config.botPrefix + " Erro interno do sistema.",
          error: true
        });
      });

      claude.stdin.write(fullPrompt);
      claude.stdin.end();
    });
  } finally {
    // BUG FIX #2: Sempre liberar lock
    releaseLock(groupId);
  }
}

// ============================================================================
// WhatsApp Integration via Evolution API
// ============================================================================
async function sendWhatsAppDocument(to, content, filename, caption) {
  try {
    const base64Content = Buffer.from(content, "utf-8").toString("base64");
    const mimetype = filename.endsWith(".csv") ? "text/csv" : "application/octet-stream";

    const r = await fetch(config.evolutionUrl + "/message/sendMedia/" + config.evolutionInstance, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.evolutionKey },
      body: JSON.stringify({
        number: to,
        mediatype: "document",
        mimetype: mimetype,
        caption: caption || "",
        media: base64Content,
        fileName: filename
      })
    });
    console.log("[Evolution] Documento enviado: " + filename);
    return r.json();
  } catch (err) {
    console.error("[Evolution] Erro documento: " + err.message);
    throw err;
  }
}

function parseResponseForDocuments(response) {
  const csvRegex = /\[CSV:([^\]]+)\]\n([\s\S]*?)\n\[\/CSV\]/g;
  const documents = [];
  let textResponse = response;

  let match;
  while ((match = csvRegex.exec(response)) !== null) {
    documents.push({
      filename: match[1],
      content: match[2].trim()
    });
    textResponse = textResponse.replace(match[0], "");
  }

  return {
    text: textResponse.trim(),
    documents: documents
  };
}

async function sendWhatsApp(to, text) {
  const MAX = 60000;
  if (text.length <= MAX) return sendWhatsAppSingle(to, text);

  const chunks = [];
  let rem = text;
  while (rem.length > 0) {
    if (rem.length <= MAX) { chunks.push(rem); break; }
    let cut = rem.lastIndexOf("\n", MAX);
    if (cut < MAX * 0.5) cut = MAX;
    chunks.push(rem.substring(0, cut));
    rem = rem.substring(cut).trim();
  }

  console.log("[Evolution] Dividindo em " + chunks.length + " partes");
  for (let i = 0; i < chunks.length; i++) {
    const pre = chunks.length > 1 ? "[" + (i+1) + "/" + chunks.length + "] " : "";
    await sendWhatsAppSingle(to, pre + chunks[i]);
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
  }
}

async function sendWhatsAppSingle(to, text) {
  try {
    const r = await fetch(config.evolutionUrl + "/message/sendText/" + config.evolutionInstance, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.evolutionKey },
      body: JSON.stringify({ number: to, text: text })
    });
    console.log("[Evolution] Enviado");
    return r.json();
  } catch (err) {
    console.error("[Evolution] Erro: " + err.message);
    throw err;
  }
}

async function findAndSendCSVFiles(to) {
  const appDir = "/app";
  let csvFiles = [];

  try {
    const files = fs.readdirSync(appDir);
    csvFiles = files.filter(f => f.endsWith(".csv"));
  } catch (e) {
    return [];
  }

  const sent = [];
  for (const csvFile of csvFiles) {
    const filePath = path.join(appDir, csvFile);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      console.log("[CSV] Encontrado arquivo: " + csvFile + " (" + content.length + " bytes)");
      await sendWhatsAppDocument(to, content, csvFile, "Dados exportados");
      fs.unlinkSync(filePath);
      console.log("[CSV] Arquivo enviado e removido: " + csvFile);
      sent.push(csvFile);
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error("[CSV] Erro ao processar " + csvFile + ": " + e.message);
    }
  }
  return sent;
}

async function sendResponse(to, response) {
  const csvFilesSent = await findAndSendCSVFiles(to);
  const parsed = parseResponseForDocuments(response);

  for (const doc of parsed.documents) {
    console.log("[Response] Enviando documento inline: " + doc.filename);
    await sendWhatsAppDocument(to, doc.content, doc.filename, "Arquivo exportado");
    await new Promise(r => setTimeout(r, 500));
  }

  let cleanResponse = parsed.text;
  if (csvFilesSent.length > 0) {
    cleanResponse = cleanResponse.replace(/`\/app\/[^`]+\.csv`/g, "");
    cleanResponse = cleanResponse.replace(/CSV gerado com sucesso:[^\n]+/g, "");
    cleanResponse = cleanResponse.trim();
  }

  const totalDocs = csvFilesSent.length + parsed.documents.length;
  if (cleanResponse && cleanResponse.length > 0) {
    await sendWhatsApp(to, cleanResponse);
  } else if (totalDocs > 0) {
    await sendWhatsApp(to, config.botPrefix + " Arquivo(s) enviado(s)!");
  }
}

// ============================================================================
// Webhook Handler
// ============================================================================
function parseWebhook(p) {
  try {
    const d = p.data || {};
    const k = d.key || {};
    const m = d.message || {};
    const txt = m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text) || "";
    return {
      from: k.remoteJid || "",
      text: txt,
      fromMe: k.fromMe || false,
      pushName: d.pushName || ""
    };
  } catch (e) { return null; }
}

app.post("/webhook", async (req, res) => {
  const start = Date.now();
  const p = req.body;

  if (p.event !== "messages.upsert") return res.json({ status: "ignored" });

  const msg = parseWebhook(p);
  if (!msg || !msg.text) return res.json({ status: "ignored" });
  if (config.groupId && msg.from !== config.groupId) return res.json({ status: "ignored" });
  if (msg.text.startsWith(config.botPrefix)) return res.json({ status: "ignored" });

  const cmd = msg.text.toLowerCase().trim();

  if (cmd === "/reset" || cmd === "/limpar") {
    await clearSession(msg.from);
    res.json({ status: "cleared" });
    await sendWhatsApp(msg.from, config.botPrefix + " Sessao limpa! Contexto reiniciado.");
    return;
  }

  if (cmd === "/sessao" || cmd === "/status") {
    const sid = await getSessionId(msg.from);
    const ttl = sid ? await redis.ttl(getSessionKey(msg.from)) : -1;
    res.json({ status: "info", sid: sid ? sid.slice(0,8) : null, ttl: ttl });
    if (sid) {
      await sendWhatsApp(msg.from, config.botPrefix + " Sessao ativa: " + sid.slice(0,8) + "... (expira em " + Math.floor(ttl/60) + " min)");
    } else {
      await sendWhatsApp(msg.from, config.botPrefix + " Nenhuma sessao ativa.");
    }
    return;
  }

  if (cmd === "/locks") {
    const locks = Array.from(sessionLocks.entries()).map(([k, v]) => ({
      group: k.slice(0, 15) + "...",
      since: Math.floor((Date.now() - v) / 1000) + "s"
    }));
    res.json({ locks: locks });
    return;
  }


  // TIER 2: Rate limiting
  const rateLimit = checkRateLimit(msg.from);
  if (!rateLimit.allowed) {
    res.json({ status: "rate_limited" });
    await sendWhatsApp(msg.from, config.botPrefix + " Limite de mensagens atingido. Aguarde " + rateLimit.waitTime + " segundos.");
    return;
  }

  console.log("[Webhook] " + msg.pushName + ": \"" + msg.text.slice(0, 50) + "...\"");
  res.json({ status: "processing" });

  // BUG FIX #7: Catch duplo para garantir log de erros
  (async () => {
    try {
      const r = await sendToClaude(msg.from, msg.text);
      await sendResponse(msg.from, r.text);
      console.log("[Webhook] Processado em " + (Date.now() - start) + "ms");
    } catch (e) {
      console.error("[Webhook] Erro principal: " + e.message);
      console.error("[Webhook] Stack: " + e.stack);
      try {
        await sendWhatsApp(msg.from, config.botPrefix + " Erro. Tente novamente.");
      } catch (sendError) {
        console.error("[Webhook] Falha ao enviar erro: " + sendError.message);
      }
    }
  })().catch(err => {
    console.error("[Webhook] Erro nao capturado: " + err.message);
    console.error("[Webhook] Stack: " + err.stack);
  });
});

// ============================================================================
// Health & Admin Endpoints
// ============================================================================
app.get("/health", async (req, res) => {
  let rok = false;
  try { await redis.ping(); rok = true; } catch (e) {}

  res.json({
    status: "ok",
    service: config.serviceName,
    version: config.version,
    architecture: "Claude --resume + Redis + Bug Fixes",
    redis: rok ? "connected" : "disconnected",
    activeLocks: sessionLocks.size,
    uptime: Math.floor(process.uptime()),
    sessionTtl: config.sessionTtl,
    memory: {
      heapUsedMB: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
      rssMB: Math.floor(process.memoryUsage().rss / 1024 / 1024)
    }
  });
});

app.post("/reload-prompt", (req, res) => {
  SYSTEM_PROMPT = loadPrompt();
  res.json({ ok: true, size: SYSTEM_PROMPT.length });
});

app.post("/clear-session/:gid", async (req, res) => {
  const ok = await clearSession(req.params.gid);
  res.json({ ok: ok });
});

app.post("/clear-all-sessions", async (req, res) => {
  try {
    const keys = await redis.keys("cnpj:session:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    res.json({ ok: true, cleared: keys.length });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get("/", (req, res) => {
  res.json({
    name: config.serviceName,
    version: config.version,
    description: "CNPJ Assistant v4.3 - com bug fixes para timeout e sessoes",
    commands: [
      "/reset - limpa contexto",
      "/sessao - info da sessao",
      "/locks - mostra locks ativos"
    ],
    fixes: [
      "SIGKILL para processos zombie",
      "Lock por grupo para race condition",
      "Validacao UUID de sessao",
      "Limpeza especifica de erros de sessao",
      "Catch duplo para erros async"
    ]
  });
});

// ============================================================================
// Graceful Shutdown
// ============================================================================
process.on("SIGTERM", async () => {
  console.log("[Shutdown] Recebido SIGTERM, encerrando...");
  try {
    await redis.quit();
  } catch (e) {}
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Shutdown] Recebido SIGINT, encerrando...");
  try {
    await redis.quit();
  } catch (e) {}
  process.exit(0);
});

// ============================================================================
// Startup
// ============================================================================
(async () => {
  try {
    await redis.connect();
  } catch (e) {
    console.error("[Redis] Conexao falhou: " + e.message);
  }

  app.listen(config.port, () => {
    console.log("============================================");
    console.log("  CNPJ-ASSISTANT v" + config.version);
    console.log("  Claude --resume + Redis + Bug Fixes");
    console.log("============================================");
    console.log("  Porta: " + config.port);
    console.log("  Grupo: " + (config.groupId || "(todos)"));
    console.log("  Redis: " + config.redisUrl);
    console.log("  TTL Sessao: " + config.sessionTtl + "s");
    console.log("  Timeout Claude: " + config.claudeTimeout + "ms");
    console.log("============================================");
    console.log("  FIXES APLICADOS:");
    console.log("  - Bug #1: SIGKILL para zombie processes");
    console.log("  - Bug #2: Lock por grupo (race condition)");
    console.log("  - Bug #4: Limpeza especifica de sessao");
    console.log("  - Bug #6: Validacao UUID sessao");
    console.log("  - Bug #7: Catch duplo async");
    console.log("============================================");
  });
})();
