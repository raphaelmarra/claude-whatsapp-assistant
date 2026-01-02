# Exemplos de Prompts

Esta pasta contem prompts prontos para diferentes casos de uso.

## Como Usar

1. Escolha o prompt que mais se aproxima do seu caso
2. Copie para `prompts/system-prompt.md`
3. Edite conforme sua necessidade
4. Reinicie o container

```bash
cp examples/prompt-suporte-tecnico.md prompts/system-prompt.md
nano prompts/system-prompt.md  # editar
docker compose restart
```

## Prompts Disponiveis

| Arquivo | Caso de Uso | Descricao |
|---------|-------------|-----------|
| `prompt-suporte-tecnico.md` | Suporte/Helpdesk | Atendimento tecnico com base de conhecimento |
| `prompt-vendas-crm.md` | Vendas/Comercial | Qualificacao de leads, agendamento de demos |
| `prompt-faq-atendimento.md` | SAC/FAQ | Perguntas frequentes, rastreio, trocas |

## Variaveis Disponiveis

Todos os prompts podem usar:

| Variavel | Substituido por |
|----------|-----------------|
| `{{BOT_PREFIX}}` | Valor de BOT_PREFIX (ex: "SUPORTE:") |
| `{{BACKEND_API_URL}}` | URL da sua API backend |
| `{{SERVICE_NAME}}` | Nome do servico |

## Dicas

1. **Seja especifico** - Quanto mais detalhado o prompt, melhor as respostas
2. **Inclua exemplos** - Claude aprende com exemplos de conversas
3. **Defina limites** - Diga o que o bot NAO deve fazer
4. **Teste iterativamente** - Ajuste o prompt baseado nas respostas reais
