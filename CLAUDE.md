# CLAUDE.md - Instrucoes para IA v4.2.0

Este arquivo contem instrucoes para IAs que vao fazer manutencao neste sistema.

---

## VISAO GERAL

Bot WhatsApp com memoria de contexto usando:
- **Claude CLI** com `--resume` para manter sessoes
- **Redis** para armazenar session_id (TTL 30 min)
- **Evolution API** para enviar/receber mensagens
- **Auto-deteccao de CSV** para enviar arquivos

---

## ESTRUTURA DO PROJETO

```
claude-whatsapp-assistant/
├── index.js              # Logica principal (NAO EDITAR sem necessidade)
├── package.json          # Dependencias: express, ioredis
├── Dockerfile            # Node 20 + Claude CLI
├── docker-compose.yml    # Variaveis de ambiente
├── prompts/
│   └── system-prompt.md  # EDITAR AQUI para mudar comportamento
├── README.md             # Doc para humanos
├── AI-CONTEXT.md         # Como adaptar o sistema
└── CLAUDE.md             # Este arquivo
```

---

## PARA MUDAR COMPORTAMENTO DO BOT

**SEMPRE edite `prompts/system-prompt.md`**, NAO o index.js.

```bash
# Editar prompt
nano prompts/system-prompt.md

# Recarregar sem reiniciar
curl -X POST http://localhost:3025/reload-prompt

# OU reiniciar
docker compose restart
```

---

## VARIAVEIS DE AMBIENTE

| Variavel | Obrigatoria | Default | Descricao |
|----------|-------------|---------|-----------|
| SERVICE_NAME | Nao | cnpj-assistant | Nome do servico |
| PORT | Nao | 3025 | Porta HTTP |
| EVOLUTION_API_URL | Sim | - | URL do Evolution API |
| EVOLUTION_API_KEY | Sim | - | API Key |
| EVOLUTION_INSTANCE | Sim | - | Nome da instancia |
| WHATSAPP_GROUP_ID | Nao | (todos) | Filtrar por grupo |
| BOT_PREFIX | Nao | CLAUDE: | Prefixo respostas |
| BACKEND_API_URL | Nao | - | URL do backend |
| REDIS_URL | Sim | redis://redis:6379 | Conexao Redis |
| SESSION_TTL_SECONDS | Nao | 1800 | TTL sessao (30min) |
| CLAUDE_TIMEOUT_MS | Nao | 300000 | Timeout (5min) |
| PROMPT_FILE | Nao | prompts/system-prompt.md | Arquivo do prompt |

---

## COMANDOS WHATSAPP

| Comando | Funcao |
|---------|--------|
| `/reset` | Limpa sessao e contexto |
| `/sessao` | Mostra info da sessao ativa |

Para adicionar novos comandos, editar `index.js` no bloco:
```javascript
if (cmd === "/reset" || cmd === "/limpar") { ... }
if (cmd === "/sessao" || cmd === "/status") { ... }
// Adicionar aqui
```

---

## ENDPOINTS HTTP

| Metodo | Path | Descricao |
|--------|------|-----------|
| POST | /webhook | Recebe msgs do Evolution API |
| GET | /health | Status + Redis |
| POST | /reload-prompt | Recarrega prompt |
| POST | /clear-session/:gid | Limpa sessao |
| GET | / | Info do servico |

---

## FLUXO DE DADOS

```
1. Evolution API envia POST /webhook
2. parseWebhook() extrai mensagem
3. Verifica comandos especiais (/reset, /sessao)
4. getSessionId() busca sessao no Redis
5. sendToClaude() executa:
   - SEM sessao: claude -p "PROMPT+msg" --output-format json
   - COM sessao: claude --resume <sid> -p "msg"
6. Captura session_id do JSON
7. saveSessionId() salva no Redis (TTL 30min)
8. sendResponse() processa resposta:
   - findAndSendCSVFiles() detecta CSVs em /app/
   - parseResponseForDocuments() detecta [CSV:x]...[/CSV]
   - Envia documentos via sendWhatsAppDocument()
   - Envia texto via sendWhatsApp()
```

---

## ENVIO DE ARQUIVOS CSV

### Como funciona

1. **Auto-deteccao**: Quando Claude cria arquivos .csv em /app/, o sistema:
   - Detecta automaticamente
   - Converte para base64
   - Envia via Evolution API sendMedia
   - Remove o arquivo

2. **Formato inline**: Se Claude usar:
   ```
   [CSV:arquivo.csv]
   col1,col2
   val1,val2
   [/CSV]
   ```
   O sistema extrai e envia como documento.

### Endpoint Evolution API

```
POST /message/sendMedia/{instance}
{
  "number": "grupo@g.us",
  "mediatype": "document",
  "mimetype": "text/csv",
  "caption": "descricao",
  "media": "base64content",
  "fileName": "arquivo.csv"
}
```

---

## TROUBLESHOOTING

### Erro de permissao no Claude

**Causa:** Volume montado como read-only

**Solucao:**
```yaml
# ERRADO
- /root/.claude:/home/cnpjapp/.claude:ro

# CERTO
- /root/.claude:/home/cnpjapp/.claude
```

### Sem memoria entre mensagens

**Causa:** Redis desconectado

**Verificar:**
```bash
docker exec cnpj-assistant curl localhost:3025/health
# Deve mostrar "redis": "connected"
```

### Timeout

**Causa:** Consulta muito longa

**Solucao:** Aumentar CLAUDE_TIMEOUT_MS no docker-compose.yml

### Loop infinito

**Causa:** Bot respondendo a proprias mensagens

**Verificar:** BOT_PREFIX deve ser unico e consistente

### CSV nao enviado

**Verificar logs:**
```bash
docker logs cnpj-assistant | grep CSV
```

---

## DEPLOY

```bash
cd /root/cnpj-assistant

# Rebuild completo
docker compose down
docker compose build --no-cache
docker compose up -d

# Verificar logs
docker logs -f cnpj-assistant

# Apenas reiniciar
docker compose restart
```

---

## PARA REPLICAR ESTE SISTEMA

Veja `AI-CONTEXT.md` para instrucoes detalhadas de como:
1. Adaptar para outro dominio
2. Criar novo prompt
3. Configurar variaveis
4. Deploy

---

## DEPENDENCIAS EXTERNAS

| Servico | Funcao | Obrigatorio |
|---------|--------|-------------|
| Redis | Armazena sessoes | Sim |
| Evolution API | WhatsApp | Sim |
| Claude CLI | Processamento | Sim (autenticado no host) |
| Backend API | Consultas especificas | Depende do caso |

---

## SEGURANCA

- Claude CLI roda com `--dangerously-skip-permissions`
- Nao expor porta 3025 publicamente
- Usar WHATSAPP_GROUP_ID para restringir acesso
- API keys em variaveis de ambiente (nao no codigo)

---

**Versao:** 4.2.0
**Atualizado:** 2026-01-02
