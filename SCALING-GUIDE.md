# SCALING-GUIDE.md - Como Replicar o CNPJ-Assistant

**Publico:** Desenvolvedores, IAs, Agentes
**Versao:** 1.0
**Data:** 2026-01-05

---

## Visao Geral

Este guia explica como criar um novo assistant baseado no CNPJ-Assistant.
O sistema e modular e pode ser adaptado para diferentes dominios.

## Arquitetura Base

```
[WhatsApp] -> [Evolution API] -> [webhook-router] -> [POST /webhook]
                                                           |
                                                           v
                                                   +---------------+
                                                   |  assistant    |
                                                   +-------+-------+
                                                           |
                    +----------------+---------------------+
                    |                |                     |
                    v                v                     v
              [Redis]        [Claude CLI]          [Evolution API]
           (sessoes)       (--resume)            (resposta)
```

## Componentes Necessarios

1. **webhook-router** - Roteia mensagens por grupo
2. **Redis** - Armazena sessoes (contexto)
3. **Evolution API** - WhatsApp
4. **Claude CLI** - Processamento com IA
5. **API Backend** (opcional) - Dados especificos do dominio

---

## Passo a Passo: Criar Novo Assistant

### ETAPA 1: Copiar Estrutura Base

```bash
# Na VPS
cd /root
cp -r cnpj-assistant novo-assistant
cd novo-assistant

# Limpar arquivos desnecessarios
rm -f *.bak* index.js.bak*
rm -rf .git
```

### ETAPA 2: Configurar Identidade

Edite `package.json`:

```json
{
  "name": "novo-assistant",
  "version": "1.0.0",
  "description": "Novo Assistant - [Descricao do dominio]",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "ioredis": "^5.4.1"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### ETAPA 3: Configurar docker-compose.yml

```yaml
services:
  novo-assistant:
    build: .
    container_name: novo-assistant
    restart: unless-stopped
    init: true
    env_file:
      - .env
    environment:
      SERVICE_NAME: novo-assistant
      PORT: "3026"  # PORTA UNICA
      EVOLUTION_API_URL: https://evolutionapi2.sdebot.top
      EVOLUTION_INSTANCE: jarvis
      WHATSAPP_GROUP_ID: "NOVO_GRUPO_ID@g.us"  # ID DO GRUPO
      BOT_PREFIX: "NOVO:"  # PREFIXO UNICO
      BACKEND_API_URL: http://novo-backend:3000  # API DO DOMINIO (opcional)
      CLAUDE_TIMEOUT_MS: "180000"
      REDIS_URL: redis://redis:6379
      SESSION_TTL_SECONDS: "1800"
      PROMPT_FILE: prompts/system-prompt.md
    volumes:
      - ./prompts:/app/prompts:ro
      - ./CLAUDE.md:/app/CLAUDE.md:ro
      - /root/.claude:/home/novoapp/.claude  # USUARIO UNICO
    networks:
      - easypanel
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3026/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s

networks:
  easypanel:
    external: true
```

### ETAPA 4: Configurar .env

```bash
# Criar .env com API Key
echo "EVOLUTION_API_KEY=429683C4C977415CAAFCCE10F7D57E11" > .env
```

### ETAPA 5: Ajustar Dockerfile

Edite `Dockerfile` - altere o nome do usuario:

```dockerfile
# Criar usuario non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S novoapp -u 1001 -G nodejs

# ...

# Criar diretorios necessarios
RUN mkdir -p /home/novoapp/.claude && \
    chown -R novoapp:nodejs /home/novoapp

# ...

# Usar usuario non-root
USER novoapp
```

### ETAPA 6: Ajustar index.js

Pontos criticos para modificar:

**6.1 Configuracao (linha ~15):**

```javascript
const config = {
  port: process.env.PORT || 3026,  // PORTA UNICA
  serviceName: process.env.SERVICE_NAME || "novo-assistant",
  version: "1.0.0",
  // ... resto igual
};
```

**6.2 Filtro de mencao (linha ~509):**

```javascript
// Mudar de "jarvis" para o nome do novo bot
const mentionsBot = msg.text.toLowerCase().includes("novo") ||
                    msg.text.toLowerCase().includes("@novo");
if (!mentionsBot) return res.json({ status: "ignored", reason: "no_mention" });
```

**6.3 Redis key prefix (linha ~133):**

```javascript
function getSessionKey(groupId) {
  return "novo:session:" + groupId;  // PREFIXO UNICO
}
```

### ETAPA 7: Criar System Prompt

Edite `prompts/system-prompt.md`:

```markdown
# Assistente [NOVO] - [Descricao]

Voce e um assistente especializado em [DOMINIO].
Responda sempre em portugues, de forma concisa.
Prefixe TODAS as respostas com: {{BOT_PREFIX}}

## Funcionalidades

[Descrever o que o bot faz]

## API Disponivel (se houver)

[Documentar endpoints que o Claude pode usar]

## Regras

1. SEMPRE prefixe com {{BOT_PREFIX}}
2. [Regras especificas do dominio]
3. Limite respostas a 3500 caracteres
```

### ETAPA 8: Atualizar webhook-router

Ver `SCALING-GUIDE.md` do webhook-router para adicionar o novo grupo.

Resumo:
1. Adicionar `NOVO_GROUP_ID` no index.js do router
2. Adicionar `NOVO_ASSISTANT_URL` no index.js do router
3. Adicionar variaveis no docker-compose.yml do router
4. Rebuild do router

### ETAPA 9: Build e Deploy

```bash
cd /root/novo-assistant

# Build
docker compose build --no-cache

# Deploy
docker compose up -d

# Verificar
docker logs novo-assistant --tail 20
curl http://localhost:3026/health
```

### ETAPA 10: Testar

```bash
# Simular webhook
curl -X POST http://localhost:3026/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "instance": "jarvis",
    "data": {
      "key": {
        "remoteJid": "NOVO_GRUPO_ID@g.us",
        "fromMe": false,
        "id": "TEST"
      },
      "message": {"conversation": "@novo ola"},
      "pushName": "Teste"
    }
  }'
```

---

## Checklist de Replicacao

- [ ] Copiar estrutura base
- [ ] Definir porta unica (ex: 3026, 3027...)
- [ ] Definir prefixo unico (ex: NOVO:, VENDAS:...)
- [ ] Definir filtro de mencao (ex: @novo, @vendas...)
- [ ] Definir prefixo Redis (ex: novo:session:, vendas:session:...)
- [ ] Criar usuario Docker unico
- [ ] Criar system-prompt.md especifico
- [ ] Obter ID do grupo WhatsApp
- [ ] Atualizar webhook-router
- [ ] Build e deploy
- [ ] Testar filtro de mencao
- [ ] Testar memoria (sessao)

---

## Variaveis que DEVEM ser Unicas

| Variavel           | Exemplo CNPJ        | Exemplo Novo       |
|--------------------|---------------------|--------------------|
| SERVICE_NAME       | cnpj-assistant      | vendas-assistant   |
| PORT               | 3025                | 3026               |
| BOT_PREFIX         | CLAUDE:             | VENDAS:            |
| Redis key prefix   | cnpj:session:       | vendas:session:    |
| Docker user        | cnpjapp             | vendasapp          |
| Container name     | cnpj-assistant      | vendas-assistant   |
| Filtro mencao      | jarvis              | vendas             |

---

## Assistants Existentes (Referencia)

| Nome             | Porta | Prefixo  | Mencao    | Grupo                       |
|------------------|-------|----------|-----------|------------------------------|
| health-assistant | 3000  | HEALTH:  | (sem)     | 120363406835475336@g.us      |
| cnpj-assistant   | 3025  | CLAUDE:  | jarvis    | 120363423903208895@g.us      |
| crm-assistant    | 3021  | CRM:     | jarvis    | 120363424505532648@g.us      |
| jarvis-assistant | 3025  | JARVIS:  | jarvis    | 120363041280068242@g.us      |

---

## Troubleshooting

### Bot nao responde

```bash
# Verificar se container esta rodando
docker ps | grep novo-assistant

# Verificar logs
docker logs novo-assistant --tail 50

# Verificar se mencao esta correta
docker logs novo-assistant | grep "no_mention"
```

### Sessao nao mantem contexto

```bash
# Verificar Redis
docker exec novo-assistant redis-cli -h redis KEYS "novo:session:*"

# Verificar se sessao esta sendo salva
docker logs novo-assistant | grep "Session salva"
```

### Webhook nao chega

```bash
# Verificar webhook-router
docker logs webhook-router | grep "NOVO_GROUP"

# Verificar se grupo esta configurado
curl http://localhost:3020/health | jq '.groups'
```

---

## Template de Arquivos

### docker-compose.yml (Template)

```yaml
services:
  NOME-assistant:
    build: .
    container_name: NOME-assistant
    restart: unless-stopped
    init: true
    env_file:
      - .env
    environment:
      SERVICE_NAME: NOME-assistant
      PORT: "PORTA"
      EVOLUTION_API_URL: https://evolutionapi2.sdebot.top
      EVOLUTION_INSTANCE: jarvis
      WHATSAPP_GROUP_ID: "GRUPO_ID@g.us"
      BOT_PREFIX: "PREFIXO:"
      BACKEND_API_URL: http://BACKEND:PORTA
      CLAUDE_TIMEOUT_MS: "180000"
      REDIS_URL: redis://redis:6379
      SESSION_TTL_SECONDS: "1800"
      PROMPT_FILE: prompts/system-prompt.md
    volumes:
      - ./prompts:/app/prompts:ro
      - ./CLAUDE.md:/app/CLAUDE.md:ro
      - /root/.claude:/home/NOMEapp/.claude
    networks:
      - easypanel
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:PORTA/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s

networks:
  easypanel:
    external: true
```

---

**Versao:** 1.0
**Data:** 2026-01-05
**Baseado em:** cnpj-assistant v4.3.0
