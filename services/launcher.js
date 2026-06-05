#!/usr/bin/env node
/**
 * Genova Service Launcher — Keeps all services alive
 * This process acts as a persistent parent that monitors and restarts services.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

const LOG_DIR = '/tmp/genova-logs';
const BASE = '/home/z/my-project';
fs.mkdirSync(LOG_DIR, { recursive: true });

const services = [
  {
    id: 'baileys', name: 'Baileys WhatsApp', port: 8186,
    cmd: 'node', args: [`${BASE}/services/baileys/server.js`],
    healthPath: '/health',
  },
  {
    id: 'ruflo', name: 'Ruflo MCP', port: 8190,
    cmd: 'node', args: [`${BASE}/services/ruflo/server.mjs`],
    healthPath: '/health',
  },
  {
    id: 'pocketbase', name: 'PocketBase', port: 8090,
    cmd: `${BASE}/services/pocketbase/pocketbase`,
    args: ['serve', '--http=0.0.0.0:8090'],
    healthPath: '/api/health',
  },
  {
    id: 'n8n', name: 'n8n Workflows', port: 5678,
    cmd: `${process.env.HOME}/.npm-global/bin/n8n`,
    args: ['start'],
    healthPath: '/healthz',
    env: {
      N8N_BASIC_AUTH_ACTIVE: 'true',
      N8N_BASIC_AUTH_USER: 'admin',
      N8N_BASIC_AUTH_PASSWORD: 'genova_admin',
      N8N_PORT: '5678',
      WEBHOOK_URL: 'http://localhost:5678/',
    },
  },
  {
    id: 'speechbrain', name: 'SpeechBrain ASR', port: 8187,
    cmd: 'python3', args: [`${BASE}/services/speechbrain_api_server.py`],
    healthPath: '/health',
  },
];

const procs = {};
const restarts = {};

function startService(svc) {
  if (procs[svc.id]?.pid && !procs[svc.id].killed) {
    console.log(`[${svc.id}] Already running`);
    return;
  }

  const logOut = fs.openSync(`${LOG_DIR}/${svc.id}.log`, 'a');
  const logErr = fs.openSync(`${LOG_DIR}/${svc.id}-err.log`, 'a');

  const env = { ...process.env, ...(svc.env || {}) };
  const proc = spawn(svc.cmd, svc.args, {
    cwd: `${BASE}/services`,
    env,
    stdio: ['ignore', logOut, logErr],
    detached: true,  // Key: detach from parent
  });

  // Unreference so parent doesn't wait for child
  proc.unref();

  proc.on('exit', (code) => {
    console.log(`[${svc.id}] exited with code ${code}`);
    delete procs[svc.id];
    restarts[svc.id] = (restarts[svc.id] || 0) + 1;
    if (restarts[svc.id] < 5) {
      setTimeout(() => startService(svc), 5000);
    }
  });

  procs[svc.id] = proc;
  console.log(`[${svc.id}] Started ${svc.name} on port ${svc.port} (PID: ${proc.pid})`);
}

function checkHealth(port, path) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}${path}`, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

async function startAll() {
  console.log('Starting Genova services...');

  for (const svc of services) {
    const healthy = await checkHealth(svc.port, svc.healthPath);
    if (healthy) {
      console.log(`[${svc.id}] Already healthy on port ${svc.port}`);
      continue;
    }
    startService(svc);
    // Wait between starts to avoid resource contention
    await new Promise(r => setTimeout(r, 2000));
  }

  // Wait for services to initialize
  await new Promise(r => setTimeout(r, 5000));

  // Report status
  console.log('\n=== Service Status ===');
  for (const svc of services) {
    const healthy = await checkHealth(svc.port, svc.healthPath);
    console.log(`  ${healthy ? '[OK]' : '[XX]'} ${svc.name} (port ${svc.port})`);
  }
  console.log('');
}

// Handle commands
const cmd = process.argv[2] || 'start';

if (cmd === 'start') {
  startAll();
  // Keep process alive to prevent children from being orphan-killed
  // But use unref() so this process doesn't block either
  setInterval(() => {
    // Periodic health check every 30s
    for (const svc of services) {
      checkHealth(svc.port, svc.healthPath).then(healthy => {
        if (!healthy && !procs[svc.id]) {
          console.log(`[${svc.id}] Unhealthy and not running, restarting...`);
          restarts[svc.id] = 0;
          startService(svc);
        }
      });
    }
  }, 30000);
} else if (cmd === 'status') {
  (async () => {
    for (const svc of services) {
      const healthy = await checkHealth(svc.port, svc.healthPath);
      console.log(`${healthy ? '[OK]' : '[XX]'} ${svc.name} (port ${svc.port})`);
    }
  })();
} else if (cmd === 'stop') {
  for (const [id, proc] of Object.entries(procs)) {
    proc.kill('SIGTERM');
    console.log(`[${id}] Stopped`);
  }
}
