# AI Context - CNPJ Assistant v4.0.0

**Publico-alvo:** IA/LLMs/Agentes
**Atualizado:** 2026-01-02

## Resumo

Bot WhatsApp que usa Claude CLI com **memoria de contexto via Redis**.
Acessa CNPJ-CLI (95 endpoints) para consultas de empresas.

## Arquitetura v4.0.0

```
MSG 1 → claude -p --output-format json → session_id → Redis
MSG 2 → claude --resume <sid> -p → contexto mantido!
```

## Fluxo

1. Webhook recebe mensagem do Evolution API
2. Busca `session_id` no Redis (`cnpj:session:{groupId}`)
3. Se existe: `claude --resume <sid> -p "msg"`
4. Se nao existe: `claude -p "prompt + msg"`
5. Salva novo `session_id` no Redis (TTL 30 min)
6. Envia resposta via Evolution API

## Comandos WhatsApp

- `/reset` - Limpa sessao
- `/sessao` - Info da sessao

## Endpoints

| Endpoint | Metodo | Descricao |
|----------|--------|-----------|
| POST /webhook | Recebe msgs WhatsApp |
| GET /health | Status + Redis |
| POST /clear-session/:gid | Limpa sessao |

## Variaveis de Ambiente

```
REDIS_URL=redis://redis:6379
SESSION_TTL_SECONDS=1800
BOT_PREFIX=CLAUDE:
WHATSAPP_GROUP_ID=120363423903208895@g.us
BACKEND_API_URL=http://cnpj-cli:3015
```

## Dependencias

| Servico | URL |
|---------|-----|
| Redis | redis://redis:6379 |
| CNPJ-CLI | http://cnpj-cli:3015 |
| Evolution API | https://evolutionapi2.sdebot.top |

## Mudancas v3 → v4

| Antes (v3) | Agora (v4) |
|------------|------------|
| Spawn novo a cada msg | --resume com session_id |
| Sem memoria | Redis sessions (30 min) |
| Prompt repetido | Prompt so na 1a msg |
