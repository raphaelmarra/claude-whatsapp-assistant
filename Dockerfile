FROM node:20-alpine

# Instalar dependencias do sistema
RUN apk add --no-cache bash git curl jq

WORKDIR /app

# Instalar Claude Code CLI globalmente
RUN npm install -g @anthropic-ai/claude-code

# Criar usuario nao-root
RUN addgroup -g 1001 -S cnpjapp && \
    adduser -S cnpjapp -u 1001 -G cnpjapp && \
    mkdir -p /home/cnpjapp/.claude && \
    chown -R cnpjapp:cnpjapp /home/cnpjapp /app

# Copiar package.json e instalar deps
COPY --chown=cnpjapp:cnpjapp package.json ./
RUN npm install --production

# Copiar codigo
COPY --chown=cnpjapp:cnpjapp index.js ./

# Mudar para usuario nao-root
USER cnpjapp
ENV HOME=/home/cnpjapp

EXPOSE 3025

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3025/health || exit 1

CMD ["node", "index.js"]
