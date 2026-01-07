# CNPJ Assistant v4.3.0

> Bot WhatsApp com memoria de contexto para consultas CNPJ usando Claude CLI + Redis

## Quick Start

```bash
cd /root/cnpj-assistant
docker compose up -d
curl http://localhost:3025/health
```

## Arquitetura

```
[WhatsApp]
     |
     v
[Evolution API] -----> [webhook-router:3020]
                              |
                              v
                    +-------------------+
                    |  cnpj-assistant   |
                    |      :3025        |
                    +--------+----------+
                             |
          +------------------+------------------+
          |                  |                  |
          v                  v                  v
     [Redis]          [Claude CLI]       [Evolution API]
    (sessoes)         (--resume)          (resposta)
          |                  |
          v                  v
    TTL 30min          [cnpj-cli:3015]
                         (API CNPJ)
```

## Endpoints (6)

| Metodo | Path                | Descricao                    |
|--------|---------------------|------------------------------|
| GET    | /                   | Info do servico              |
| GET    | /health             | Health check + Redis status  |
| POST   | /webhook            | Recebe msgs Evolution API    |
| POST   | /reload-prompt      | Recarrega prompt sem restart |
| POST   | /clear-session/:gid | Limpa sessao de um grupo     |
| POST   | /clear-all-sessions | Limpa todas as sessoes       |

## Filtro de Mencao

**O bot SO responde se a mensagem contiver:**
- `jarvis` (qualquer posicao)
- `@jarvis` (com arroba)

Mensagens sem mencao sao ignoradas silenciosamente.

## Comandos WhatsApp

| Comando            | Alias    | Funcao                     |
|--------------------|----------|----------------------------|
| /reset             | /limpar  | Limpa sessao e contexto    |
| /sessao            | /status  | Info da sessao ativa       |
| /locks             | -        | Debug de locks ativos      |

## Variaveis de Ambiente (12)

| Variavel             | Default (codigo)                 | Producao (docker-compose)        |
|----------------------|----------------------------------|----------------------------------|
| PORT                 | 3025                             | 3025                             |
| SERVICE_NAME         | cnpj-assistant                   | cnpj-assistant                   |
| EVOLUTION_API_URL    | https://evolutionapi2.sdebot.top | https://evolutionapi2.sdebot.top |
| EVOLUTION_API_KEY    | (vazio)                          | (via .env)                       |
| EVOLUTION_INSTANCE   | R                                | jarvis                           |
| WHATSAPP_GROUP_ID    | (vazio = todos)                  | 120363423903208895@g.us          |
| BOT_PREFIX           | CLAUDE:                          | CLAUDE:                          |
| BACKEND_API_URL      | http://cnpj-cli:3015             | http://cnpj-cli:3015             |
| CLAUDE_TIMEOUT_MS    | 180000                           | 180000                           |
| REDIS_URL            | redis://redis:6379               | redis://redis:6379               |
| SESSION_TTL_SECONDS  | 1800                             | 1800                             |
| PROMPT_FILE          | prompts/system-prompt.md         | prompts/system-prompt.md         |

**Nota:** Defaults do codigo diferem de producao em EVOLUTION_INSTANCE e WHATSAPP_GROUP_ID

## Funcionalidades v4.3

| Feature              | Descricao                                    |
|----------------------|----------------------------------------------|
| Memoria              | Claude --resume + Redis (TTL 30min)          |
| Filtro @jarvis       | So processa se mencionar jarvis              |
| Rate Limit           | 5 req/min por grupo                          |
| Lock                 | Evita race condition em sessoes              |
| CSV Auto             | Detecta e envia arquivos CSV                 |
| Bug Fixes            | Timeout, zombie processes, UUID validation   |

## Estrutura do Projeto

```
cnpj-assistant/
├── index.js              # Logica principal (23KB)
├── package.json          # express, ioredis
├── Dockerfile            # Node 20 + Tini + Claude CLI
├── docker-compose.yml    # Config producao
├── .env                  # API Key (gitignore)
├── prompts/
│   └── system-prompt.md  # Prompt do Claude
├── README.md             # Este arquivo
├── AI-CONTEXT.md         # Contexto para IAs
├── CLAUDE.md             # Contexto conciso
└── SCALING-GUIDE.md      # Como replicar
```

## Stack

- **Runtime:** Node.js 20 Alpine
- **Framework:** Express.js
- **CLI:** Claude Code (--resume)
- **Cache:** Redis (ioredis)
- **Init:** Tini (PID 1)
- **Porta:** 3025
- **Rede:** easypanel

## Comandos Uteis

```bash
# Ver logs
docker logs cnpj-assistant --tail 50

# Health check
curl -s http://localhost:3025/health | jq

# Restart
docker compose restart

# Rebuild completo
docker compose build --no-cache && docker compose up -d

# Testar Claude CLI
docker exec cnpj-assistant claude --version

# Limpar sessao de um grupo
curl -X POST http://localhost:3025/clear-session/GRUPO_ID

# Limpar todas sessoes
curl -X POST http://localhost:3025/clear-all-sessions

# Recarregar prompt
curl -X POST http://localhost:3025/reload-prompt
```

## Integracao com webhook-router

O cnpj-assistant recebe mensagens do webhook-router:

```
Grupo CNPJ (120363423903208895@g.us)
    -> webhook-router:3020
    -> cnpj-assistant:3025/webhook
```

## Linhas de Codigo Importantes

| Funcionalidade    | Arquivo   | Linha |
|-------------------|-----------|-------|
| Config object     | index.js  | 13-28 |
| Filtro mencao     | index.js  | 509   |
| Cmd /reset        | index.js  | 515   |
| Cmd /sessao       | index.js  | 522   |
| Cmd /locks        | index.js  | 534   |
| POST /webhook     | index.js  | 499   |
| GET /health       | index.js  | 579   |

## Como Replicar

Ver **SCALING-GUIDE.md** para criar um novo assistant baseado neste.

---
**Gerado automaticamente:** 2026-01-05
**Extraido de:** index.js v4.3.0 (auditado linha por linha)
