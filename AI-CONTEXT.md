# AI Context - CNPJ Assistant v4.8.0

**Objetivo:** Documentacao completa para replicacao por outra IA
**Atualizado:** 2026-01-07
**Auditado:** Codigo fonte (index.js) linha por linha

---

## RESUMO

Bot WhatsApp que usa **Claude CLI** para consultas de CNPJ.
Mantém memoria de contexto via `--resume` + Redis.
So responde quando mencionado (jarvis) ou em reply a mensagem do bot.

---

## ARQUITETURA

```
[WhatsApp] --> [Evolution API] --> [webhook-router:3020]
                                          |
                                          v
                                   [cnpj-assistant:3025]
                                          |
                     +--------------------+--------------------+
                     |                    |                    |
                     v                    v                    v
              [Claude CLI]          [Redis:6379]        [cnpj-cli:3015]
              (--resume)            (sessoes)           (dados CNPJ)
```

---

## STACK

| Componente | Tecnologia | Versao |
|------------|------------|--------|
| Runtime | Node.js Alpine | 20.x |
| Framework | Express.js | 4.21.0 |
| Cache | Redis (ioredis) | 5.4.1 |
| IA | Claude CLI | latest |
| Init | Tini | built-in |
| Container | Docker | - |

---

## ARQUIVOS DO PROJETO

| Arquivo | Funcao |
|---------|--------|
| index.js | Codigo principal (700+ linhas) |
| Dockerfile | Build da imagem |
| docker-compose.yml | Orquestracao |
| package.json | Dependencias |
| prompts/system-prompt.md | Prompt do Claude |
| CLAUDE.md | Contexto da API (lido pelo Claude) |
| .env | Variaveis sensiveis |

---

## VARIAVEIS DE AMBIENTE

| Variavel | Default | Producao | Descricao |
|----------|---------|----------|-----------|
| PORT | 3025 | 3025 | Porta HTTP |
| SERVICE_NAME | cnpj-assistant | cnpj-assistant | Nome do servico |
| EVOLUTION_API_URL | evolutionapi2.sdebot.top | https://evolutionapi2.sdebot.top | URL Evolution API |
| EVOLUTION_API_KEY | "" | (via .env) | API Key Evolution |
| EVOLUTION_INSTANCE | R | jarvis | Nome da instancia WhatsApp |
| WHATSAPP_GROUP_ID | "" | 120363423903208895@g.us | Grupo permitido |
| BOT_PREFIX | CLAUDE: | CNPJ: | Prefixo das respostas |
| BACKEND_API_URL | cnpj-cli:3015 | http://cnpj-cli:3015 | URL API CNPJ |
| CLAUDE_TIMEOUT_MS | 180000 | 180000 | Timeout Claude (3min) |
| REDIS_URL | redis:6379 | redis://redis:6379 | URL Redis |
| SESSION_TTL_SECONDS | 1800 | 1800 | TTL sessao (30min) |
| PROMPT_FILE | system-prompt.md | prompts/system-prompt.md | Arquivo do prompt |
| BOT_LID | 206850607837224 | 206850607837224 | LID do bot (Evolution) |

---

## ENDPOINTS DO SERVICO

| Metodo | Path | Descricao |
|--------|------|-----------|
| POST | /webhook | Recebe mensagens Evolution API |
| GET | /health | Health check + status Redis |
| POST | /reload-prompt | Recarrega prompt sem restart |
| POST | /clear-session/:gid | Limpa sessao de um grupo |
| POST | /clear-all-sessions | Limpa todas as sessoes |
| GET | / | Info do servico |

---

## COMANDOS WHATSAPP

| Comando | Alias | Funcao |
|---------|-------|--------|
| /reset | /limpar | Limpa sessao e contexto |
| /sessao | /status | Mostra info da sessao ativa |
| /locks | - | Debug: mostra locks ativos |

---

## TRIGGERS (quando responde)

O bot SO processa mensagens que:

1. **Contem "jarvis" ou "@jarvis"** no texto
2. **OU sao reply** a uma mensagem anterior do bot

Mensagens que nao atendem esses criterios sao ignoradas silenciosamente.

---

## FLUXO DE PROCESSAMENTO

```
1. Evolution API envia POST /webhook
2. parseWebhook() extrai: from, text, pushName, isReplyToBot
3. shouldProcessMessage() verifica trigger (jarvis ou reply)
4. Deduplicacao por messageId (evita processar 2x)
5. Rate limit check (5 req/min por grupo)
6. Acquire lock (evita race condition)
7. getSessionId() busca sessao no Redis
8. sendToClaude():
   - SEM sessao: claude -p "PROMPT+msg" --output-format json
   - COM sessao: claude --resume <session_id> -p "msg"
9. saveSessionId() salva no Redis (TTL 1800s)
10. findAndSendCSVFiles() detecta CSVs em /app e /tmp
11. sendResponse():
    - Envia CSVs como documento
    - Envia texto como mensagem
12. Release lock
```

---

## SESSOES REDIS

| Campo | Valor |
|-------|-------|
| Key Pattern | cnpj:session:{groupId} |
| TTL | 1800s (30 min) |
| Valor | UUID da sessao Claude |

**Comandos Redis uteis:**
```bash
# Ver sessoes ativas
redis-cli KEYS "cnpj:session:*"

# Ver TTL de uma sessao
redis-cli TTL "cnpj:session:120363423903208895@g.us"

# Limpar sessao
redis-cli DEL "cnpj:session:120363423903208895@g.us"
```

---

## BUG FIXES IMPLEMENTADOS

| Fix | Problema | Solucao |
|-----|----------|---------|
| #1 SIGKILL | Processos zombie do Claude | Mata com SIGKILL apos timeout |
| #2 Lock | Race condition em sessoes | sessionLocks Map por grupo |
| #4 Session | Limpeza incorreta de sessao | Lista especifica de erros |
| #6 UUID | Session IDs invalidos | Regex validation |
| #7 Catch | Erros async nao tratados | Try-catch duplo |
| #8 Dedup | Mensagens duplicadas | Map por messageId (60s TTL) |
| v4.5 Reply | Reply detection quebrado | LID ao inves de JID |
| v4.7 Order | Dedup antes de trigger | Ordem corrigida |
| v4.8 CSV | CSV em /tmp nao detectado | Busca em /app + /tmp |

---

## ENVIO DE CSV

O sistema detecta e envia CSVs automaticamente:

1. **Arquivos em disco:** Busca em /app e /tmp
2. **Inline no texto:** Formato `[CSV:nome.csv]\nconteudo\n[/CSV]`

Apos envio, arquivos sao removidos automaticamente.

---

## RATE LIMITING

| Parametro | Valor |
|-----------|-------|
| Janela | 60 segundos |
| Max requests | 5 por grupo |
| Resposta | Mensagem de espera |

---

## COMO REPLICAR

### 1. Criar estrutura de arquivos

```
meu-assistant/
├── index.js           # Copiar codigo
├── Dockerfile         # Copiar dockerfile
├── docker-compose.yml # Adaptar para seu ambiente
├── package.json       # Copiar package.json
├── .env               # Criar com suas credenciais
└── prompts/
    └── system-prompt.md  # Criar seu prompt
```

### 2. Configurar .env

```env
EVOLUTION_API_KEY=sua_api_key
EVOLUTION_INSTANCE=sua_instancia
WHATSAPP_GROUP_ID=seu_grupo@g.us
BOT_LID=seu_bot_lid
```

### 3. Adaptar o prompt

Editar `prompts/system-prompt.md` com instrucoes especificas.
O prompt e injetado na primeira mensagem da sessao.

### 4. Build e deploy

```bash
docker compose build --no-cache
docker compose up -d
```

### 5. Configurar webhook Evolution

```bash
curl -X POST "https://evolution-api/webhook/set/INSTANCIA" \
  -H "apikey: API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "http://meu-assistant:3025/webhook",
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

---

## DEPENDENCIAS EXTERNAS

| Servico | Porta | Funcao |
|---------|-------|--------|
| Redis | 6379 | Sessoes |
| Evolution API | 8080 | WhatsApp |
| cnpj-cli | 3015 | Dados CNPJ |
| webhook-router | 3020 | Roteamento |

---

## TROUBLESHOOTING

### Bot nao responde

1. Verificar se menciona "jarvis" ou responde mensagem do bot
2. Verificar logs: `docker logs cnpj-assistant`
3. Verificar webhook: `curl http://localhost:3025/health`

### Timeout frequente

1. Aumentar CLAUDE_TIMEOUT_MS
2. Orientar usuarios a fazer perguntas mais especificas
3. Limpar sessao: `POST /clear-session/{groupId}`

### CSV nao enviado

1. Verificar se arquivo existe: `docker exec cnpj-assistant ls /tmp/*.csv`
2. Verificar logs de [CSV]
3. Verificar permissoes do arquivo

### Sessao perdida

1. Verificar TTL: `redis-cli TTL "cnpj:session:..."`
2. Aumentar SESSION_TTL_SECONDS se necessario

---

## DOCKER-COMPOSE EXEMPLO

```yaml
services:
  cnpj-assistant:
    build: .
    container_name: cnpj-assistant
    restart: unless-stopped
    init: true
    env_file:
      - .env
    environment:
      SERVICE_NAME: cnpj-assistant
      PORT: "3025"
      EVOLUTION_API_URL: https://evolution-api.exemplo.com
      EVOLUTION_INSTANCE: minha-instancia
      WHATSAPP_GROUP_ID: 120363...@g.us
      BOT_PREFIX: "MEU-BOT:"
      BACKEND_API_URL: http://minha-api:3015
      CLAUDE_TIMEOUT_MS: "180000"
      REDIS_URL: redis://redis:6379
      SESSION_TTL_SECONDS: "1800"
      PROMPT_FILE: prompts/system-prompt.md
    volumes:
      - ./prompts:/app/prompts:ro
      - ./CLAUDE.md:/app/CLAUDE.md:ro
      - ~/.claude:/home/cnpjapp/.claude
    networks:
      - minha-rede
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3025/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  minha-rede:
    external: true
```

---

## CODIGO FONTE PRINCIPAL (index.js)

O codigo completo esta em `/root/cnpj-assistant/index.js` (~700 linhas).

### Funcoes Principais

| Funcao | Linha | Descricao |
|--------|-------|-----------|
| acquireLock/releaseLock | 44-58 | Lock por grupo |
| checkRateLimit | 64-88 | Rate limiting |
| isMessageProcessed/markMessageProcessed | 94-117 | Deduplicacao |
| isValidSessionId | 123-125 | Validacao UUID |
| loadPrompt | 145-157 | Carrega prompt |
| getSessionId/saveSessionId/clearSession | 163-206 | Gestao de sessao |
| shouldClearSession | 212-218 | Erros que invalidam sessao |
| sendToClaude | 224-330 | Integracao Claude CLI |
| sendWhatsAppDocument | 337-358 | Envia documento |
| parseResponseForDocuments | 360-377 | Detecta CSV inline |
| sendWhatsApp/sendWhatsAppSingle | 379-420 | Envia mensagem |
| findAndSendCSVFiles | 422-453 | Detecta CSV em disco |
| sendResponse | 455-477 | Orquestra envio |
| parseWebhook | 483-540 | Parse Evolution API |
| shouldProcessMessage | 543-558 | Verifica trigger |
| /webhook handler | 560-620 | Endpoint principal |

---

## NOTAS IMPORTANTES

1. **Claude CLI precisa estar autenticado** - Volume ~/.claude montado
2. **Redis obrigatorio** - Sem Redis, sessoes nao persistem
3. **Tini como init** - Evita processos zombie
4. **User non-root** - Seguranca (cnpjapp:nodejs)
5. **Healthcheck ativo** - Reinicia automaticamente se falhar
6. **CSVs em /tmp e /app** - Ambos diretorios sao verificados

---

**Gerado:** 2026-01-07
**Fonte:** Codigo auditado + testes em producao
