#!/usr/bin/env node
/**
 * Genova Service Manager — Persistent Process Manager
 *
 * Starts and monitors all microservices for Genova AgentOS.
 * Runs as a daemon that keeps all services alive.
 *
 * Usage: node service-manager.js [start|stop|status]
 */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const PID_FILE = '/tmp/genova-services.pid';
const LOG_DIR = '/tmp/genova-logs';
const BASE_DIR = '/home/z/my-project';

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ============================================================
// Service Definitions
// ============================================================

const SERVICES = [
  {
    id: 'baileys',
    name: 'Baileys WhatsApp',
    port: 8186,
    command: 'node',
    args: ['server.js'],
    cwd: `${BASE_DIR}/services/baileys`,
    healthPath: '/health',
    autoRestart: true,
    maxRestarts: 10,
    restartDelay: 5000,
  },
  {
    id: 'ruflo',
    name: 'Ruflo MCP Orchestrator',
    port: 8190,
    command: 'node',
    args: ['server.mjs'],
    cwd: `${BASE_DIR}/services/ruflo`,
    healthPath: '/health',
    autoRestart: true,
    maxRestarts: 10,
    restartDelay: 5000,
  },
  {
    id: 'n8n',
    name: 'n8n Workflow Automation',
    port: 5678,
    command: process.env.HOME + '/.npm-global/bin/n8n',
    args: ['start'],
    cwd: `${BASE_DIR}/services`,
    healthPath: '/healthz',
    autoRestart: true,
    maxRestarts: 5,
    restartDelay: 10000,
    env: {
      N8N_BASIC_AUTH_ACTIVE: 'true',
      N8N_BASIC_AUTH_USER: 'admin',
      N8N_BASIC_AUTH_PASSWORD: 'genova_admin',
      N8N_HOST: 'localhost',
      N8N_PORT: '5678',
      N8N_PROTOCOL: 'http',
      WEBHOOK_URL: 'http://localhost:5678/',
      GENERIC_TIMEZONE: 'Africa/Douala',
      TZ: 'Africa/Douala',
    },
  },
  {
    id: 'pocketbase',
    name: 'PocketBase Backend',
    port: 8090,
    command: `${BASE_DIR}/services/pocketbase/pocketbase`,
    args: ['serve', '--http=0.0.0.0:8090'],
    cwd: `${BASE_DIR}/services/pocketbase`,
    healthPath: '/api/health',
    autoRestart: true,
    maxRestarts: 5,
    restartDelay: 5000,
  },
  {
    id: 'speechbrain',
    name: 'SpeechBrain ASR',
    port: 8187,
    command: 'python3',
    args: [`${BASE_DIR}/services/speechbrain_api_server.py`],
    cwd: `${BASE_DIR}/services`,
    healthPath: '/health',
    autoRestart: true,
    maxRestarts: 5,
    restartDelay: 10000,
  },
];

// ============================================================
// Process Manager
// ============================================================

const processes = new Map();
const restartCounts = new Map();

function startService(service) {
  const logFd = fs.openSync(`${LOG_DIR}/${service.id}.log`, 'a');
  const errFd = fs.openSync(`${LOG_DIR}/${service.id}-error.log`, 'a');

  const env = { ...process.env, PORT: String(service.port), ...(service.env || {}) };

  const proc = spawn(service.command, service.args, {
    cwd: service.cwd,
    env,
    stdio: ['ignore', logFd, errFd],
    detached: false,
  });

  proc.on('exit', (code, signal) => {
    const timestamp = new Date().toISOString();
    try {
      fs.appendFileSync(`${LOG_DIR}/${service.id}.log`, `\n[${timestamp}] Process exited with code=${code} signal=${signal}\n`);
    } catch { /* ignore */ }

    processes.delete(service.id);

    if (service.autoRestart) {
      const count = (restartCounts.get(service.id) || 0) + 1;
      restartCounts.set(service.id, count);

      if (count <= service.maxRestarts) {
        console.log(`[${service.id}] Restarting (attempt ${count}/${service.maxRestarts}) in ${service.restartDelay}ms...`);
        setTimeout(() => startService(service), service.restartDelay);
      } else {
        console.log(`[${service.id}] Max restarts (${service.maxRestarts}) reached. Giving up.`);
      }
    }
  });

  processes.set(service.id, { proc, service });
  console.log(`[${service.id}] Started ${service.name} on port ${service.port} (PID: ${proc.pid})`);

  return proc;
}

function stopService(id) {
  const entry = processes.get(id);
  if (!entry) return;

  const { proc } = entry;
  proc.kill('SIGTERM');
  setTimeout(() => {
    if (!proc.killed) proc.kill('SIGKILL');
  }, 5000);
  processes.delete(id);
  console.log(`[${id}] Stopped`);
}

function stopAll() {
  for (const id of processes.keys()) {
    stopService(id);
  }
}

async function checkServiceHealth(service) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${service.port}${service.healthPath}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ healthy: true, data: JSON.parse(body), port: service.port });
        } catch {
          resolve({ healthy: true, data: body, port: service.port });
        }
      });
    });
    req.on('error', () => resolve({ healthy: false, error: 'Not reachable', port: service.port }));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ healthy: false, error: 'Timeout', port: service.port });
    });
  });
}

// ============================================================
// Commands
// ============================================================

async function cmdStart() {
  console.log('=============================================');
  console.log(' Genova AgentOS — Service Manager');
  console.log('=============================================\n');

  // Write PID file
  fs.writeFileSync(PID_FILE, String(process.pid));

  // Start all services
  for (const service of SERVICES) {
    const health = await checkServiceHealth(service);
    if (health.healthy) {
      console.log(`[${service.id}] Already running on port ${service.port}`);
      continue;
    }
    startService(service);
    restartCounts.set(service.id, 0);
    // Stagger service starts to avoid resource contention
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Wait for services to initialize
  await new Promise(resolve => setTimeout(resolve, 5000));
  await cmdStatus();

  // Keep process alive
  console.log('\nService manager running. Press Ctrl+C to stop all services.');
  process.on('SIGTERM', () => { stopAll(); process.exit(0); });
  process.on('SIGINT', () => { stopAll(); process.exit(0); });
}

async function cmdStop() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
    process.kill(pid, 'SIGTERM');
    console.log('Sent SIGTERM to service manager');
  } catch {
    console.log('No service manager running');
  }
}

async function cmdStatus() {
  console.log('\nService Status:');
  console.log('-'.repeat(70));

  for (const service of SERVICES) {
    const health = await checkServiceHealth(service);
    const running = processes.has(service.id);
    const status = health.healthy ? 'HEALTHY' : (running ? 'STARTING' : 'DOWN');
    const icon = health.healthy ? '[OK]' : (running ? '[..]' : '[XX]');
    console.log(`  ${icon} ${service.name.padEnd(30)} port:${service.port}`);
  }

  console.log('-'.repeat(70));
}

// ============================================================
// Main
// ============================================================

const command = process.argv[2] || 'start';

switch (command) {
  case 'start':
    cmdStart();
    break;
  case 'stop':
    cmdStop();
    break;
  case 'status':
    cmdStatus();
    break;
  default:
    console.log('Usage: node service-manager.js [start|stop|status]');
    process.exit(1);
}
