# AI Context - Claude WhatsApp Assistant v4.2.0

**Publico-alvo:** IAs, LLMs, Agentes Autonomos
**Proposito:** Permitir que uma IA replique/adapte este sistema para qualquer caso de uso

---

## O QUE E ESTE SISTEMA

Um template de bot WhatsApp que:
1. Recebe mensagens via webhook (Evolution API)
2. Processa com Claude CLI mantendo contexto (--resume)
3. Armazena sessoes no Redis (TTL 30 min)
4. Envia respostas e arquivos via WhatsApp

## ARQUITETURA CORE

```
[WhatsApp] -> [Evolution API] -> [POST /webhook]
                                      |
                                      v
                            +------------------+
                            | parseWebhook()   | Extrai: from, text, pushName
                            +--------+---------+
                                     |
                                     v
                            +------------------+
                            | getSessionId()   | Redis: cnpj:session:{groupId}
                            +--------+---------+
                                     |
                    +----------------+----------------+
                    |                                 |
                    v                                 v
           [SEM SESSAO]                        [COM SESSAO]
      claude -p "PROMPT+msg"              claude --resume <sid> -p "msg"
           --output-format json                --output-format json
                    |                                 |
                    +----------------+----------------+
                                     |
                                     v
                            +------------------+
                            | saveSessionId()  | Redis SETEX (TTL 1800s)
                            +--------+---------+
                                     |
                                     v
                            +------------------+
                            | sendResponse()   |
                            +--------+---------+
                                     |
                    +----------------+----------------+
                    |                                 |
                    v                                 v
        findAndSendCSVFiles()              parseResponseForDocuments()
        (detecta /app/*.csv)               (detecta [CSV:x.csv]...[/CSV])
                    |                                 |
                    +----------------+----------------+
                                     |
                                     v
                    +----------------------------------+
                    | sendWhatsAppDocument() ou        |
                    | sendWhatsApp()                   |
                    +----------------------------------+
```

---

## COMO ADAPTAR PARA OUTRO SISTEMA

### Passo 1: Definir o Dominio

Substitua "CNPJ" pelo seu dominio. Exemplos:
- Suporte tecnico
- Vendas/CRM
- Agendamentos
- FAQ automatizado
- Consulta de estoque

### Passo 2: Criar o Prompt

Edite `prompts/system-prompt.md`:

```markdown
# Assistente [SEU DOMINIO]

Voce e um assistente especializado em [DESCRICAO].
Responda sempre em portugues, de forma concisa.
Prefixe TODAS as respostas com: {{BOT_PREFIX}}

## API Disponivel (se houver)

Base URL: {{BACKEND_API_URL}}

### Endpoints
- GET /endpoint1 - Descricao
- POST /endpoint2 - Descricao

## Exemplos de Interacao

Usuario: [pergunta tipica]
Voce: [resposta esperada]

## Regras

1. SEMPRE prefixe com {{BOT_PREFIX}}
2. [outras regras do seu dominio]

## Para exportar CSV

Use o formato:
[CSV:nome-arquivo.csv]
coluna1,coluna2
dado1,dado2
[/CSV]
```

### Passo 3: Configurar Variaveis

No `docker-compose.yml`:

```yaml
environment:
  - SERVICE_NAME=meu-assistente        # Nome do servico
  - BOT_PREFIX=MEUBOT:                 # Prefixo das respostas
  - BACKEND_API_URL=http://minha-api   # Sua API (ou remover se nao tiver)
  - WHATSAPP_GROUP_ID=123@g.us         # Grupo especifico (ou vazio para todos)
  - SESSION_TTL_SECONDS=1800           # Tempo de memoria (30 min)
```

### Passo 4: Adaptar Backend (Opcional)

Se seu sistema precisa de uma API backend:

1. Crie os endpoints necessarios
2. Documente no prompt
3. Configure BACKEND_API_URL

Se NAO precisa de backend (ex: FAQ puro):
- Remova BACKEND_API_URL
- O Claude usara apenas o conhecimento do prompt

### Passo 5: Deploy

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
docker logs -f meu-assistente
```

---

## ARQUIVOS CRITICOS

| Arquivo | Funcao | Quando Editar |
|---------|--------|---------------|
| `prompts/system-prompt.md` | Comportamento do Claude | SEMPRE - define o dominio |
| `docker-compose.yml` | Configuracao | Variaveis de ambiente |
| `index.js` | Logica core | Raramente - apenas para features novas |
| `Dockerfile` | Build | Raramente - dependencias extras |

---

## VARIAVEIS DO PROMPT

O sistema substitui automaticamente:

| Variavel | Valor |
|----------|-------|
| `{{BOT_PREFIX}}` | Valor de BOT_PREFIX |
| `{{BACKEND_API_URL}}` | Valor de BACKEND_API_URL |
| `{{CNPJ_CLI_URL}}` | Alias para BACKEND_API_URL |
| `{{SERVICE_NAME}}` | Valor de SERVICE_NAME |

---

## FUNCOES PRINCIPAIS (index.js)

| Funcao | Descricao |
|--------|-----------|
| `loadPrompt()` | Carrega e processa o prompt |
| `getSessionId()` | Busca sessao no Redis |
| `saveSessionId()` | Salva sessao no Redis |
| `sendToClaude()` | Executa Claude CLI |
| `sendWhatsAppDocument()` | Envia arquivo via Evolution |
| `findAndSendCSVFiles()` | Detecta CSVs em /app/ |
| `sendResponse()` | Orquestra envio de resposta |
| `parseWebhook()` | Extrai dados do webhook |

---

## FLUXO DE MEMORIA

```
MSG 1: "Ola"
  -> Redis: GET cnpj:session:123@g.us -> null
  -> Claude: claude -p "PROMPT + Ola" --output-format json
  -> Response: {session_id: "abc123", result: "Ola!"}
  -> Redis: SETEX cnpj:session:123@g.us 1800 "abc123"

MSG 2: "Qual meu nome?"
  -> Redis: GET cnpj:session:123@g.us -> "abc123"
  -> Claude: claude --resume abc123 -p "Qual meu nome?"
  -> Claude LEMBRA o contexto da MSG 1!

MSG 3 (apos 31 min): "Ola de novo"
  -> Redis: GET -> null (expirou)
  -> Inicia nova sessao (sem memoria)
```

---

## ENVIO DE CSV

### Metodo 1: Claude cria arquivo (automatico)

Se Claude usar a ferramenta Write para criar um .csv em /app/:
1. `findAndSendCSVFiles()` detecta o arquivo
2. Converte para base64
3. Envia via `sendWhatsAppDocument()`
4. Remove o arquivo

### Metodo 2: Formato inline no prompt

Se Claude usar o formato especial:
```
[CSV:dados.csv]
col1,col2
val1,val2
[/CSV]
```

O sistema extrai e envia como documento.

---

## TROUBLESHOOTING

| Sintoma | Causa Provavel | Solucao |
|---------|----------------|---------|
| Sem memoria | Redis desconectado | Verificar REDIS_URL |
| Erro permissao | Volume :ro | Remover :ro do volume .claude |
| Timeout | Consulta longa | Aumentar CLAUDE_TIMEOUT_MS |
| Loop infinito | Bot respondendo a si | Verificar BOT_PREFIX |
| CSV nao enviado | Arquivo nao criado | Verificar logs |

---

## EXEMPLO: Adaptar para Suporte Tecnico

1. **Prompt** (`prompts/system-prompt.md`):
```markdown
# Assistente de Suporte Tecnico

Voce e um assistente de suporte da Empresa X.
Prefixe TODAS as respostas com: {{BOT_PREFIX}}

## Produtos
- Produto A: [solucoes comuns]
- Produto B: [solucoes comuns]

## Regras
1. Seja cordial
2. Nunca invente informacoes
3. Se nao souber, escale para humano
```

2. **docker-compose.yml**:
```yaml
environment:
  - SERVICE_NAME=suporte-tecnico
  - BOT_PREFIX=SUPORTE:
```

3. **Deploy**: `docker compose up -d --build`

---

**Versao:** 4.2.0 | **Atualizado:** 2026-01-02
