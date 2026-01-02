// ============================================================================
// CNPJ ASSISTANT v4.2.0 - Redis Session + Claude CLI --resume + Auto CSV Detection
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
  version: "4.2.0",
  evolutionUrl: process.env.EVOLUTION_API_URL || "https://evolutionapi2.sdebot.top",
  evolutionKey: process.env.EVOLUTION_API_KEY || "",
  evolutionInstance: process.env.EVOLUTION_INSTANCE || "R",
  groupId: process.env.WHATSAPP_GROUP_ID || "",
  botPrefix: process.env.BOT_PREFIX || "CLAUDE:",
  backendUrl: process.env.BACKEND_API_URL || "http://cnpj-cli:3015",
  claudeTimeout: parseInt(process.env.CLAUDE_TIMEOUT_MS) || 300000,
  redisUrl: process.env.REDIS_URL || "redis://redis:6379",
  sessionTtl: parseInt(process.env.SESSION_TTL_SECONDS) || 1800,
  promptFile: process.env.PROMPT_FILE || "prompts/system-prompt.md",
};

const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
redis.on("connect", () => console.log("[Redis] Conectado"));
redis.on("error", (err) => console.error("[Redis] Erro:", err.message));

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

function getSessionKey(groupId) { return "cnpj:session:" + groupId; }

async function getSessionId(groupId) {
  try { return await redis.get(getSessionKey(groupId)); }
  catch (e) { return null; }
}

async function saveSessionId(groupId, sessionId) {
  try { await redis.setex(getSessionKey(groupId), config.sessionTtl, sessionId); return true; }
  catch (e) { return false; }
}

async function clearSession(groupId) {
  try { await redis.del(getSessionKey(groupId)); return true; }
  catch (e) { return false; }
}

async function sendToClaude(groupId, message) {
  return new Promise(async (resolve) => {
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

    const claude = spawn("claude", args);
    let stdout = "", stderr = "", killed = false;

    const timeoutId = setTimeout(() => {
      if (!killed) {
        killed = true;
        claude.kill("SIGTERM");
        resolve({ text: config.botPrefix + " Timeout.", error: true });
      }
    }, config.claudeTimeout);

    claude.stdout.on("data", (d) => { stdout += d.toString(); });
    claude.stderr.on("data", (d) => { stderr += d.toString(); });

    claude.on("close", async (code) => {
      clearTimeout(timeoutId);
      if (killed) return;
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      if (code !== 0) {
        console.error("[Claude] Erro code " + code + ": " + stderr.slice(0, 200));
        if (stderr.includes("session") || stderr.includes("conversation")) {
          await clearSession(groupId);
          console.log("[Claude] Sessao limpa por erro");
        }
        resolve({ text: config.botPrefix + " Erro. Tente novamente.", error: true });
        return;
      }

      try {
        const lines = stdout.trim().split("\n");
        const result = JSON.parse(lines[lines.length - 1]);
        if (result.session_id) {
          await saveSessionId(groupId, result.session_id);
          console.log("[Claude] Session salva: " + result.session_id.slice(0, 8) + "...");
        }
        let response = result.result || "";
        if (!response.startsWith(config.botPrefix)) {
          response = config.botPrefix + " " + response;
        }
        console.log("[Claude] (" + duration + "s): " + response.slice(0, 80) + "...");
        resolve({ text: response, sessionId: result.session_id, duration: duration });
      } catch (e) {
        console.error("[Claude] Parse error: " + e.message);
        let response = stdout.trim();
        if (!response.startsWith(config.botPrefix)) {
          response = config.botPrefix + " " + response;
        }
        resolve({ text: response });
      }
    });

    claude.on("error", (err) => {
      clearTimeout(timeoutId);
      console.error("[Claude] Spawn error: " + err.message);
      resolve({ text: config.botPrefix + " Erro interno.", error: true });
    });

    claude.stdin.write(fullPrompt);
    claude.stdin.end();
  });
}

// Enviar documento via Evolution API
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

// Detectar blocos CSV na resposta: [CSV:arquivo.csv]conteudo[/CSV]
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

// Buscar arquivos CSV criados pelo Claude em /app
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
      fs.unlinkSync(filePath); // Remove após enviar
      console.log("[CSV] Arquivo enviado e removido: " + csvFile);
      sent.push(csvFile);
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error("[CSV] Erro ao processar " + csvFile + ": " + e.message);
    }
  }
  return sent;
}

// Enviar resposta com suporte a documentos
async function sendResponse(to, response) {
  // 1. Verificar arquivos CSV criados pelo Claude
  const csvFilesSent = await findAndSendCSVFiles(to);

  // 2. Verificar formato especial [CSV:arquivo.csv]...[/CSV]
  const parsed = parseResponseForDocuments(response);

  // Enviar documentos do formato especial
  for (const doc of parsed.documents) {
    console.log("[Response] Enviando documento inline: " + doc.filename);
    await sendWhatsAppDocument(to, doc.content, doc.filename, "Arquivo exportado");
    await new Promise(r => setTimeout(r, 500));
  }

  // Limpar menções a arquivos locais na resposta
  let cleanResponse = parsed.text;
  if (csvFilesSent.length > 0) {
    // Remove menções a paths de arquivos salvos
    cleanResponse = cleanResponse.replace(/`\/app\/[^`]+\.csv`/g, "");
    cleanResponse = cleanResponse.replace(/CSV gerado com sucesso:[^\n]+/g, "");
    cleanResponse = cleanResponse.trim();
  }

  // Enviar texto restante
  const totalDocs = csvFilesSent.length + parsed.documents.length;
  if (cleanResponse && cleanResponse.length > 0) {
    await sendWhatsApp(to, cleanResponse);
  } else if (totalDocs > 0) {
    await sendWhatsApp(to, config.botPrefix + " Arquivo(s) enviado(s)!");
  }
}

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

  console.log("[Webhook] " + msg.pushName + ": \"" + msg.text.slice(0, 50) + "...\"");
  res.json({ status: "processing" });

  (async () => {
    try {
      const r = await sendToClaude(msg.from, msg.text);
      await sendResponse(msg.from, r.text);
      console.log("[Webhook] Processado em " + (Date.now() - start) + "ms");
    } catch (e) {
      console.error("[Webhook] Erro: " + e.message);
      await sendWhatsApp(msg.from, config.botPrefix + " Erro. Tente novamente.");
    }
  })();
});

app.get("/health", async (req, res) => {
  let rok = false;
  try { await redis.ping(); rok = true; } catch (e) {}
  res.json({
    status: "ok",
    service: config.serviceName,
    version: config.version,
    architecture: "Claude --resume + Redis + Documents",
    redis: rok ? "connected" : "disconnected",
    uptime: process.uptime(),
    sessionTtl: config.sessionTtl
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

app.get("/", (req, res) => {
  res.json({
    name: config.serviceName,
    version: config.version,
    description: "CNPJ Assistant com memoria via Claude --resume + Redis + CSV Documents",
    commands: ["/reset - limpa contexto", "/sessao - info da sessao"]
  });
});

(async () => {
  try { await redis.connect(); } catch (e) {
    console.error("[Redis] Conexao falhou: " + e.message);
  }
  app.listen(config.port, () => {
    console.log("============================================");
    console.log("  CNPJ-ASSISTANT v" + config.version);
    console.log("  Claude --resume + Redis + Documents");
    console.log("============================================");
    console.log("  Porta: " + config.port);
    console.log("  Grupo: " + (config.groupId || "(todos)"));
    console.log("  Redis: " + config.redisUrl);
    console.log("  TTL Sessao: " + config.sessionTtl + "s");
    console.log("============================================");
  });
})();
