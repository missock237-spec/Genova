#!/bin/bash
# n8n Workflow Engine for Genova AgentOS
# Runs on port 5678 with data stored locally

export N8N_PORT=5678
export N8N_PROTOCOL=http
export N8N_HOST=localhost
export N8N_EDITOR_BASE_URL=http://localhost:5678
export N8N_USER_FOLDER=/home/z/my-project/services/n8n
export N8N_CUSTOM_EXTENSIONS=/home/z/my-project/services/n8n/extensions
export WEBHOOK_URL=http://localhost:5678/

cd /home/z/my-project
npx n8n start
