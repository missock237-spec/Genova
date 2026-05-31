FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy server
COPY server.js ./

# Create auth directory
RUN mkdir -p /app/auth_info

# Expose port
EXPOSE 8186

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8186/health || exit 1

# Start
CMD ["node", "server.js"]
