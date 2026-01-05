# ============================================================================
# CNPJ-ASSISTANT v4.3.1 - Dockerfile com Tini + Claude CLI
# ============================================================================

FROM node:20-alpine

# Instalar dependencias + Tini para init system
RUN apk add --no-cache bash git curl jq tini

# Instalar Claude Code CLI globalmente
RUN npm install -g @anthropic-ai/claude-code

# Criar usuario non-root
RUN addgroup -g 1001 -S nodejs &&     adduser -S cnpjapp -u 1001 -G nodejs

WORKDIR /app

# Copiar package.json primeiro (cache layer)
COPY package*.json ./

# Instalar dependencias
RUN npm install --omit=dev && npm cache clean --force

# Copiar codigo
COPY --chown=cnpjapp:nodejs index.js ./
COPY --chown=cnpjapp:nodejs prompts ./prompts

# Criar diretorios necessarios
RUN mkdir -p /home/cnpjapp/.claude &&     chown -R cnpjapp:nodejs /home/cnpjapp

# Variaveis de ambiente
ENV NODE_ENV=production
ENV PORT=3025

# Expor porta
EXPOSE 3025

# Usar usuario non-root
USER cnpjapp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3   CMD wget --no-verbose --tries=1 --spider http://localhost:3025/health || exit 1

# Iniciar com Tini como init (PID 1)
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]
