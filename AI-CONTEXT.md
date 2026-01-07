# AI Context - CNPJ Assistant v4.3.0

**Publico-alvo:** IA/LLMs/Agentes
**Atualizado:** 2026-01-05
**Versao:** 4.3.0
**Fonte:** Codigo fonte (index.js - auditado linha por linha)

## Resumo

Bot WhatsApp que usa Claude CLI para consultas de CNPJ.
Mantém memoria de contexto via --resume + Redis.
So responde quando mencionado (jarvis ou @jarvis).

## Stack

| Tecnologia     | Valor                 |
|----------------|-----------------------|
| Runtime        | Node.js 20 Alpine     |
| Framework      | Express.js            |
| CLI            | Claude Code           |
| Cache          | Redis (ioredis)       |
| Init           | Tini                  |
| Porta          | 3025                  |
| Container      | cnpj-assistant        |
| Rede           | easypanel             |

## Endpoints (6) - Extraidos do Codigo

| Metodo | Path                | Linha | Descricao                    |
|--------|---------------------|-------|------------------------------|
| POST   | /webhook            | 499   | Recebe msgs Evolution API    |
| GET    | /health             | 579   | Health check + Redis status  |
| POST   | /reload-prompt      | 599   | Recarrega prompt sem restart |
| POST   | /clear-session/:gid | 604   | Limpa sessao de um grupo     |
| POST   | /clear-all-sessions | 609   | Limpa todas as sessoes       |
| GET    | /                   | 621   | Info do servico              |

## Comandos WhatsApp - Extraidos do Codigo

| Comando  | Alias   | Linha | Funcao                           |
|----------|---------|-------|----------------------------------|
| /reset   | /limpar | 515   | Limpa sessao e contexto          |
| /sessao  | /status | 522   | Mostra info da sessao ativa      |
| /locks   | -       | 534   | Debug: mostra locks ativos       |

## Filtro de Mencao (Linha 509)

```javascript
// index.js:509-510
const mentionsJarvis = msg.text.toLowerCase().includes("jarvis") ||
                       msg.text.toLowerCase().includes("@jarvis");
if (!mentionsJarvis) return res.json({ status: "ignored", reason: "no_mention" });
```

O bot SO processa mensagens que contenham "jarvis" ou "@jarvis".

## Config Object (Linhas 13-28)

```javascript
const config = {
  port: process.env.PORT || 3025,
  serviceName: process.env.SERVICE_NAME || "cnpj-assistant",
  version: "4.3.0",
  evolutionUrl: process.env.EVOLUTION_API_URL || "https://evolutionapi2.sdebot.top",
  evolutionKey: process.env.EVOLUTION_API_KEY || "",
  evolutionInstance: process.env.EVOLUTION_INSTANCE || "R",  // Default "R", producao usa "jarvis"
  groupId: process.env.WHATSAPP_GROUP_ID || "",              // Default vazio = todos grupos
  botPrefix: process.env.BOT_PREFIX || "CLAUDE:",
  backendUrl: process.env.BACKEND_API_URL || "http://cnpj-cli:3015",
  claudeTimeout: parseInt(process.env.CLAUDE_TIMEOUT_MS) || 180000,
  redisUrl: process.env.REDIS_URL || "redis://redis:6379",
  sessionTtl: parseInt(process.env.SESSION_TTL_SECONDS) || 1800,
  promptFile: process.env.PROMPT_FILE || "prompts/system-prompt.md",
};
```

## Variaveis de Ambiente (12)

| Variavel             | Default Codigo | Producao                         | Descricao                    |
|----------------------|----------------|----------------------------------|------------------------------|
| PORT                 | 3025           | 3025                             | Porta HTTP                   |
| SERVICE_NAME         | cnpj-assistant | cnpj-assistant                   | Nome do servico              |
| EVOLUTION_API_URL    | evolutionapi2  | evolutionapi2.sdebot.top         | URL Evolution API            |
| EVOLUTION_API_KEY    | ""             | (via .env)                       | API Key Evolution            |
| EVOLUTION_INSTANCE   | **R**          | **jarvis**                       | Nome da instancia WhatsApp   |
| WHATSAPP_GROUP_ID    | **""**         | **120363423903208895@g.us**      | Grupo permitido              |
| BOT_PREFIX           | CLAUDE:        | CLAUDE:                          | Prefixo das respostas        |
| BACKEND_API_URL      | cnpj-cli:3015  | cnpj-cli:3015                    | URL API CNPJ                 |
| CLAUDE_TIMEOUT_MS    | 180000         | 180000                           | Timeout Claude (3min)        |
| REDIS_URL            | redis:6379     | redis:6379                       | URL Redis                    |
| SESSION_TTL_SECONDS  | 1800           | 1800                             | TTL sessao (30min)           |
| PROMPT_FILE          | system-prompt  | system-prompt.md                 | Arquivo do prompt            |

**ATENCAO:** Defaults no codigo diferem de producao em EVOLUTION_INSTANCE e WHATSAPP_GROUP_ID

## Fluxo de Processamento

```
1. Evolution API envia POST /webhook (linha 499)
2. parseWebhook() extrai: from, text, pushName
3. Filtro: ignora se text NAO contem "jarvis" (linha 509)
4. Comandos especiais: /reset|/limpar, /sessao|/status, /locks
5. Rate limit check (5 req/min por grupo)
6. Acquire lock (evita race condition)
7. getSessionId() busca no Redis (prefixo "cnpj:session:")
8. sendToClaude():
   - SEM sessao: claude -p "PROMPT+msg" --output-format json
   - COM sessao: claude --resume <session_id> -p "msg"
9. saveSessionId() salva no Redis (TTL 1800s)
10. sendResponse():
    - findAndSendCSVFiles() detecta /app/*.csv
    - parseResponseForDocuments() detecta [CSV:x]...[/CSV]
    - sendWhatsAppDocument() ou sendWhatsApp()
11. Release lock
```

## Responses dos Endpoints

### GET /

```json
{
  "name": "cnpj-assistant",
  "version": "4.3.0",
  "description": "CNPJ Assistant v4.3 - com bug fixes para timeout e sessoes",
  "commands": ["/reset - limpa contexto", "/sessao - info da sessao", "/locks - mostra locks ativos"],
  "fixes": ["SIGKILL para processos zombie", "Lock por grupo para race condition", "..."]
}
```

### GET /health

```json
{
  "status": "ok",
  "service": "cnpj-assistant",
  "version": "4.3.0",
  "architecture": "Claude --resume + Redis + Bug Fixes",
  "redis": "connected",
  "activeLocks": 0,
  "uptime": 7694,
  "sessionTtl": 1800,
  "memory": {"heapUsedMB": 13, "rssMB": 66}
}
```

### POST /webhook

**Processado:**
```json
{"status": "processing"}
```

**Ignorado (sem mencao):**
```json
{"status": "ignored", "reason": "no_mention"}
```

## Bug Fixes v4.3

| Fix                  | Problema                    | Solucao                         |
|----------------------|-----------------------------|---------------------------------|
| SIGKILL              | Processos zombie do Claude  | Mata com SIGKILL apos timeout   |
| Lock por grupo       | Race condition em sessoes   | sessionLocks Map                |
| Clear especifico     | Limpar so um grupo          | /clear-session/:gid             |
| UUID validation      | Session IDs invalidos       | Regex validation antes de usar  |
| Catch duplo          | Erros async nao tratados    | Try-catch em async functions    |

## Integracao

**Recebe de:**
- webhook-router (http://webhook-router:3020)

**Usa:**
- Redis (redis://redis:6379) - sessoes
- Claude CLI (--resume) - processamento IA
- cnpj-cli (http://cnpj-cli:3015) - dados CNPJ

**Envia para:**
- Evolution API - respostas WhatsApp

## Volumes Docker

```yaml
volumes:
  - ./prompts:/app/prompts:ro          # System prompt
  - ./CLAUDE.md:/app/CLAUDE.md:ro      # Contexto Claude
  - /root/.claude:/home/cnpjapp/.claude # Credenciais Claude
```

## Como Escalar/Replicar

Ver **SCALING-GUIDE.md** para criar novos assistants.

---
**Gerado automaticamente:** 2026-01-05
**Extraido de:** index.js v4.3.0 (auditado linha por linha)
