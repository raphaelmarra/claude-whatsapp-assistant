# Claude WhatsApp Assistant v4.2.0

Assistente WhatsApp com **memoria de contexto** usando Claude CLI + Redis.
Suporte a **envio de arquivos CSV** como documentos.

## Arquitetura

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  WhatsApp   │────▶│ Evolution API│────▶│  Este Sistema   │
│  (Usuario)  │◀────│  (Webhook)   │◀────│  (Node.js)      │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
                    │                             ▼                             │
                    │  ┌─────────┐    ┌───────────────────┐    ┌─────────────┐ │
                    │  │  Redis  │◀──▶│    Claude CLI     │───▶│  Backend    │ │
                    │  │(sessoes)│    │ (--resume + JSON) │    │  API        │ │
                    │  └─────────┘    └───────────────────┘    └─────────────┘ │
                    │                             │                             │
                    │                             ▼                             │
                    │                    ┌─────────────────┐                    │
                    │                    │  CSV Detection  │                    │
                    │                    │  (auto-send)    │                    │
                    │                    └─────────────────┘                    │
                    └───────────────────────────────────────────────────────────┘
```

## Features

- **Memoria de Contexto:** Claude lembra conversas anteriores (30 min TTL)
- **Envio de CSV:** Arquivos CSV sao enviados automaticamente como documentos
- **Comandos WhatsApp:** /reset, /sessao
- **Hot Reload:** Recarrega prompt sem reiniciar

## Quick Start

```bash
# 1. Clone
git clone https://github.com/raphaelmarra/claude-whatsapp-assistant.git
cd claude-whatsapp-assistant

# 2. Configure
cp docker-compose.yml.example docker-compose.yml
# Edite as variaveis de ambiente

# 3. Crie seu prompt
nano prompts/system-prompt.md

# 4. Deploy
docker compose up -d
```

## Comandos WhatsApp

| Comando | Funcao |
|---------|--------|
| `/reset` | Limpa sessao e contexto |
| `/sessao` | Mostra info da sessao ativa |

## Variaveis de Ambiente

| Variavel | Obrigatoria | Descricao |
|----------|-------------|-----------|
| EVOLUTION_API_URL | Sim | URL do Evolution API |
| EVOLUTION_API_KEY | Sim | API Key do Evolution |
| EVOLUTION_INSTANCE | Sim | Nome da instancia |
| WHATSAPP_GROUP_ID | Nao | Filtrar por grupo (vazio = todos) |
| REDIS_URL | Sim | URL do Redis |
| SESSION_TTL_SECONDS | Nao | TTL sessao (default: 1800) |
| BACKEND_API_URL | Sim | URL da API de backend |
| BOT_PREFIX | Nao | Prefixo das respostas (default: CLAUDE:) |
| PROMPT_FILE | Nao | Caminho do prompt (default: prompts/system-prompt.md) |

## Estrutura

```
claude-whatsapp-assistant/
├── index.js              # Logica principal
├── package.json          # Dependencias (express, ioredis)
├── Dockerfile            # Node 20 Alpine + Claude CLI
├── docker-compose.yml    # Configuracao
├── prompts/
│   └── system-prompt.md  # SEU PROMPT AQUI
├── README.md             # Este arquivo
├── AI-CONTEXT.md         # Contexto para IAs
└── CLAUDE.md             # Instrucoes de manutencao
```

## Como Replicar para Outro Sistema

Veja `AI-CONTEXT.md` para instrucoes detalhadas de como adaptar
este sistema para qualquer outro caso de uso.

## Endpoints HTTP

| Metodo | Path | Descricao |
|--------|------|-----------|
| POST | /webhook | Recebe mensagens do Evolution API |
| GET | /health | Health check com status do Redis |
| POST | /reload-prompt | Recarrega prompt sem reiniciar |
| POST | /clear-session/:gid | Limpa sessao de um grupo |
| GET | / | Info do servico |

## Requisitos

- Docker + Docker Compose
- Redis
- Evolution API configurado
- Claude CLI autenticado no host (`/root/.claude`)

## Changelog

### v4.2.0
- Auto-deteccao e envio de CSV como documentos
- Limpeza automatica de arquivos apos envio

### v4.1.0
- Suporte a formato [CSV:arquivo.csv]...[/CSV]
- Funcao sendWhatsAppDocument

### v4.0.0
- Memoria de contexto via Claude --resume + Redis
- Reducao de ~78% no consumo de tokens

---
**MIT License** | [Repositorio](https://github.com/raphaelmarra/claude-whatsapp-assistant)
