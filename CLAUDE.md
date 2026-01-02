# WhatsApp Assistant - Arquitetura Modular

Bot WhatsApp generico com Claude Code. Configuravel via ENV e prompt externo.

## Estrutura

```
whatsapp-assistant/
  index.js              # Logica pura (nao editar para mudar comportamento)
  prompts/
    system-prompt.md    # Prompt do Claude (EDITAR AQUI)
  CLAUDE.md             # Este arquivo
  Dockerfile
  docker-compose.yml
```

## Para Modificar Comportamento

**Editar `prompts/system-prompt.md`** - NAO editar index.js

```bash
# Editar prompt
nano prompts/system-prompt.md

# Recarregar sem restart (dev)
curl -X POST http://localhost:3025/reload-prompt

# Ou restart container (producao)
docker compose restart
```

## Para Replicar em Outro Dominio

1. Copiar pasta inteira
2. Editar `prompts/system-prompt.md` com novo dominio
3. Ajustar `docker-compose.yml` com novas ENVs
4. Deploy

**Exemplo: Bot de Saude**
```bash
cp -r cnpj-assistant/ saude-assistant/
cd saude-assistant/
# Editar prompts/system-prompt.md com endpoints de saude
# Ajustar docker-compose.yml
docker compose up -d
```

## Variaveis de Ambiente

| Variavel | Obrigatoria | Default | Descricao |
|----------|-------------|---------|-----------|
| SERVICE_NAME | Nao | whatsapp-assistant | Nome do servico |
| PORT | Nao | 3025 | Porta HTTP |
| EVOLUTION_API_URL | Sim | - | URL Evolution API |
| EVOLUTION_API_KEY | Sim | - | API key Evolution |
| EVOLUTION_INSTANCE | Nao | R | Instancia WhatsApp |
| WHATSAPP_GROUP_ID | Nao | (todos) | Filtrar por grupo |
| BOT_PREFIX | Nao | ASSISTANT: | Prefixo das respostas |
| BACKEND_API_URL | Nao | http://localhost:3015 | URL do backend |
| CLAUDE_TIMEOUT_MS | Nao | 300000 | Timeout Claude (5min) |
| PROMPT_FILE | Nao | prompts/system-prompt.md | Arquivo do prompt |

## Placeholders no Prompt

O prompt suporta placeholders que sao substituidos em runtime:

| Placeholder | Substituido por |
|-------------|-----------------|
| `{{CNPJ_CLI_URL}}` | BACKEND_API_URL |
| `{{BACKEND_API_URL}}` | BACKEND_API_URL |
| `{{BOT_PREFIX}}` | BOT_PREFIX |
| `{{SERVICE_NAME}}` | SERVICE_NAME |

## Endpoints do Servico

| Metodo | Path | Descricao |
|--------|------|-----------|
| POST | /webhook | Recebe mensagens Evolution |
| GET | /health | Status e config |
| POST | /reload-prompt | Recarrega prompt (dev) |
| GET | / | Info da API |

## Deploy

```bash
# Build e start
docker compose up -d --build

# Logs
docker logs [container] -f --since 5m

# Health
curl -s http://localhost:3025/health | jq
```

## Troubleshooting

| Problema | Causa | Solucao |
|----------|-------|---------|
| Prompt vazio | Arquivo nao encontrado | Verificar PROMPT_FILE |
| Sem resposta | Claude timeout | Reduzir complexidade do prompt |
| Grupo errado | WHATSAPP_GROUP_ID | Verificar ID do grupo |
| Loop infinito | BOT_PREFIX incorreto | Verificar prefixo |

## Desenvolvimento Agil

```bash
# 1. Editar prompt localmente
nano prompts/system-prompt.md

# 2. Testar sem rebuild
curl -X POST http://localhost:3025/reload-prompt

# 3. Testar via webhook simulado
curl -X POST http://localhost:3025/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"messages.upsert","data":{"key":{"remoteJid":"test"},"message":{"conversation":"teste"}}}'

# 4. Se OK, commit
git add prompts/
git commit -m "feat: atualizar prompt"
```

## Anti-Patterns

**NAO FAZER:**
- Editar index.js para mudar comportamento do bot
- Hardcodar endpoints no codigo
- Colocar credenciais no codigo

**FAZER:**
- Editar prompts/system-prompt.md
- Usar ENV para configuracao
- Manter index.js generico

---
**Versao:** 3.0.0 | **Arquitetura:** Modular | **Prompt:** Externo
