# Claude WhatsApp Assistant v4.0.0

Bot WhatsApp com **memoria de contexto** usando Claude CLI + Redis.

## Arquitetura

```
Usuario → WhatsApp → Evolution API → Webhook
                                        ↓
                              Redis (session_id)
                                        ↓
                    ┌─────────────────────────────────────┐
                    │ session_id existe?                  │
                    │   SIM → claude --resume <sid> -p    │
                    │   NAO → claude -p (prompt completo) │
                    └─────────────────────────────────────┘
                                        ↓
                              CNPJ-CLI (consultas)
                                        ↓
                              Resposta → WhatsApp
```

## Estrutura

```
claude-whatsapp-assistant/
├── index.js              # Logica principal (v4.0.0)
├── package.json          # express + ioredis
├── Dockerfile            # Node 20 + Claude CLI
├── docker-compose.yml    # Config + Redis + Volume .claude
├── prompts/
│   └── system-prompt.md  # Prompt do Claude (EDITAR AQUI)
├── CLAUDE.md             # Este arquivo (para IA)
├── AI-CONTEXT.md         # Contexto tecnico para IA
└── README.md             # Documentacao geral
```

## Como Funciona a Memoria

1. **Primeira msg:** `claude -p "prompt+msg" --output-format json`
2. **Captura:** `session_id` do JSON response
3. **Redis:** `SETEX cnpj:session:{groupId} 1800 {session_id}`
4. **Proximas msgs:** `claude --resume <session_id> -p "msg"`
5. **Resultado:** Claude lembra contexto anterior!

## Comandos WhatsApp

| Comando | Funcao |
|---------|--------|
| `/reset` | Limpa sessao e contexto |
| `/sessao` | Mostra info da sessao ativa |

## Variaveis de Ambiente

| Variavel | Default | Descricao |
|----------|---------|-----------|
| REDIS_URL | redis://redis:6379 | Conexao Redis |
| SESSION_TTL_SECONDS | 1800 | TTL sessao (30min) |
| BOT_PREFIX | CLAUDE: | Prefixo respostas |
| BACKEND_API_URL | http://cnpj-cli:3015 | API de consultas |
| WHATSAPP_GROUP_ID | - | Filtrar por grupo |
| CLAUDE_TIMEOUT_MS | 300000 | Timeout (5min) |

## ATENCAO: Volume .claude

```yaml
# CERTO - permite escrita
volumes:
  - /root/.claude:/home/cnpjapp/.claude

# ERRADO - causa erro!
volumes:
  - /root/.claude:/home/cnpjapp/.claude:ro  # NAO USAR :ro
```

Claude CLI precisa ESCREVER arquivos de sessao.

## Para Modificar Comportamento

```bash
# Editar prompt (NAO editar index.js)
nano prompts/system-prompt.md

# Recarregar sem restart
curl -X POST http://localhost:3025/reload-prompt

# Ou restart
docker compose restart
```

## Para Adicionar Features

1. **Nova consulta:** Editar `prompts/system-prompt.md` com novos endpoints
2. **Novo comando:** Editar `index.js` no bloco de comandos especiais
3. **Mudar TTL:** Ajustar `SESSION_TTL_SECONDS` no docker-compose

## Endpoints HTTP

| Metodo | Path | Descricao |
|--------|------|-----------|
| POST | /webhook | Recebe msgs Evolution |
| GET | /health | Status + Redis |
| POST | /reload-prompt | Recarrega prompt |
| POST | /clear-session/:gid | Limpa sessao |

## Deploy

```bash
cd /root/cnpj-assistant
docker compose down
docker compose build --no-cache
docker compose up -d
docker logs -f cnpj-assistant
```

## Troubleshooting

| Problema | Causa | Solucao |
|----------|-------|---------|
| Erro permissao | Volume :ro | Remover :ro do volume |
| Sem contexto | Redis desconectado | Verificar REDIS_URL |
| Timeout | Consulta pesada | Aumentar CLAUDE_TIMEOUT_MS |
| Loop | Prefixo errado | Verificar BOT_PREFIX |

---
**v4.0.0** | Redis Sessions | Claude --resume
