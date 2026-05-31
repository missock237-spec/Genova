FROM node:20-alpine

WORKDIR /app

# Copy package files and server
COPY package.json ./
COPY server.js ./

# Install Ruflo CLI
RUN npm install -g ruflo@latest

# Expose MCP HTTP port
EXPOSE 8190

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8190/health || exit 1

# Start server
CMD ["node", "server.js"]
