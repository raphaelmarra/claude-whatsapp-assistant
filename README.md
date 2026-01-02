# CNPJ Assistant v4.0.0

Assistente WhatsApp para consulta de empresas brasileiras com **memoria de contexto**.

## Arquitetura

```
WhatsApp → Webhook → Claude CLI (--resume) → CNPJ-CLI → Resposta
                          ↓
                    Redis (session_id)
```

**Novidade v4.0.0:** Usa `--resume` do Claude CLI + Redis para manter contexto entre mensagens.

## Comandos WhatsApp

| Comando | Funcao |
|---------|--------|
| `/reset` | Limpa sessao e contexto |
| `/sessao` | Mostra info da sessao ativa |

## Configuracao

```bash
# Variaveis de ambiente
REDIS_URL=redis://redis:6379
SESSION_TTL_SECONDS=1800  # 30 min
```

## Como Funciona

1. **Primeira mensagem:** `claude -p "msg" --output-format json` → captura `session_id`
2. **Redis:** Salva `session_id` com TTL de 30 min
3. **Proximas mensagens:** `claude --resume <session_id> -p "msg"` → mantem contexto

## ATENCAO: Volume do .claude

**NUNCA** montar o volume como read-only:

```yaml
# ERRADO - causa erro de permissao
- /root/.claude:/home/cnpjapp/.claude:ro

# CERTO - permite escrita
- /root/.claude:/home/cnpjapp/.claude
```

O Claude CLI precisa escrever arquivos de sessao.

## Endpoints

| Endpoint | Metodo | Descricao |
|----------|--------|-----------|
| `/webhook` | POST | Recebe mensagens do Evolution API |
| `/health` | GET | Health check |
| `/reload-prompt` | POST | Recarrega system prompt |
| `/clear-session/:groupId` | POST | Limpa sessao de um grupo |

## Deploy

```bash
cd /root/cnpj-assistant
docker compose down
docker compose build --no-cache
docker compose up -d
docker logs -f cnpj-assistant
```

## Dependencias

- Redis (sessoes)
- CNPJ-CLI (API de empresas)
- Evolution API (WhatsApp)
- Claude CLI (autenticado)
