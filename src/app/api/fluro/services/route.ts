/**
 * Fluro.IA Services Management API
 *
 * GET  /api/fluro/services — Get status of all Fluro sub-services
 * POST /api/fluro/services — Start/stop/restart a Fluro sub-service
 *
 * This API allows the SaaS frontend and admin panel to monitor and
 * manage the Fluro.IA orchestration stack:
 *   - Ollama (chat/text inference)
 *   - ComfyUI (image generation)
 *   - VideoCrafter (video generation)
 *   - Baileys (WhatsApp integration)
 *   - SpeechBrain (speech recognition)
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkFluroHealth, type FluroHealthReport } from '@/lib/fluro-ai-client';
import { isFluroHealthy, checkFluroHealth as checkOllamaHealth, listFluroModels } from '@/lib/fluro-client';
import { checkComfyUIHealth } from '@/lib/comfyui-client';
import { applySecurity, secureResponse } from '@/lib/security';
import { createLogger } from '@/lib/logger';

const log = createLogger('fluro-services');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceStatus {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'starting' | 'error';
  url: string;
  port: number;
  responseTimeMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Service check functions
// ---------------------------------------------------------------------------

async function checkOllamaService(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const healthy = await isFluroHealthy();
    if (healthy) {
      const details = await checkOllamaHealth();
      const models = await listFluroModels();
      return {
        id: 'ollama',
        name: 'Fluro.IA (Ollama)',
        status: 'online',
        url: process.env.FLURO_API_URL || 'http://127.0.0.1:11434',
        port: 11434,
        responseTimeMs: Date.now() - start,
        metadata: {
          version: details.version,
          modelCount: models.length,
          models: models.map((m) => ({ name: m.name, family: m.family, size: m.size })),
        },
      };
    }
    return {
      id: 'ollama',
      name: 'Fluro.IA (Ollama)',
      status: 'offline',
      url: process.env.FLURO_API_URL || 'http://127.0.0.1:11434',
      port: 11434,
      responseTimeMs: Date.now() - start,
      error: 'Ollama server not responding',
    };
  } catch (error) {
    return {
      id: 'ollama',
      name: 'Fluro.IA (Ollama)',
      status: 'error',
      url: process.env.FLURO_API_URL || 'http://127.0.0.1:11434',
      port: 11434,
      responseTimeMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkComfyUIService(): Promise<ServiceStatus> {
  const start = Date.now();
  const url = process.env.COMFYUI_API_URL || 'http://localhost:8188';
  try {
    const healthy = await checkComfyUIHealth();
    return {
      id: 'comfyui',
      name: 'ComfyUI (Image Gen)',
      status: healthy ? 'online' : 'offline',
      url,
      port: 8188,
      responseTimeMs: Date.now() - start,
      error: healthy ? undefined : 'ComfyUI not responding',
    };
  } catch (error) {
    return {
      id: 'comfyui',
      name: 'ComfyUI (Image Gen)',
      status: 'error',
      url,
      port: 8188,
      responseTimeMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkVideoService(): Promise<ServiceStatus> {
  const start = Date.now();
  const url = process.env.VIDEO_API_URL || 'http://localhost:8189';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      return {
        id: 'video',
        name: 'VideoCrafter',
        status: 'online',
        url,
        port: 8189,
        responseTimeMs: Date.now() - start,
        metadata: {
          cudaAvailable: data.cuda_available,
          device: data.device,
          videocrafterLoaded: data.videocrafter_loaded,
          generationCount: data.generation_count,
        },
      };
    }
    return {
      id: 'video',
      name: 'VideoCrafter',
      status: 'offline',
      url,
      port: 8189,
      responseTimeMs: Date.now() - start,
      error: `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      id: 'video',
      name: 'VideoCrafter',
      status: 'offline',
      url,
      port: 8189,
      responseTimeMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unreachable',
    };
  }
}

async function checkBaileysService(): Promise<ServiceStatus> {
  const start = Date.now();
  const url = process.env.BAILEYS_API_URL || 'http://localhost:8186';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      return {
        id: 'baileys',
        name: 'Baileys (WhatsApp)',
        status: data.connection === 'connected' ? 'online' : data.connection === 'connecting' ? 'starting' : 'offline',
        url,
        port: 8186,
        responseTimeMs: Date.now() - start,
        metadata: {
          connection: data.connection,
          phoneNumber: data.phoneNumber,
          uptime: data.uptime,
        },
      };
    }
    return {
      id: 'baileys',
      name: 'Baileys (WhatsApp)',
      status: 'offline',
      url,
      port: 8186,
      responseTimeMs: Date.now() - start,
      error: `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      id: 'baileys',
      name: 'Baileys (WhatsApp)',
      status: 'offline',
      url,
      port: 8186,
      responseTimeMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unreachable',
    };
  }
}

async function checkSpeechBrainService(): Promise<ServiceStatus> {
  const start = Date.now();
  const url = process.env.SPEECHBRAIN_API_URL || 'http://localhost:8187';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timer);

    return {
      id: 'speechbrain',
      name: 'SpeechBrain (ASR)',
      status: res.ok ? 'online' : 'offline',
      url,
      port: 8187,
      responseTimeMs: Date.now() - start,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      id: 'speechbrain',
      name: 'SpeechBrain (ASR)',
      status: 'offline',
      url,
      port: 8187,
      responseTimeMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unreachable',
    };
  }
}

// ---------------------------------------------------------------------------
// GET /api/fluro/services — Get all service statuses
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const [ollama, comfyui, video, baileys, speechbrain, fluroHealth] = await Promise.all([
      checkOllamaService(),
      checkComfyUIService(),
      checkVideoService(),
      checkBaileysService(),
      checkSpeechBrainService(),
      checkFluroHealth().catch(() => null),
    ]);

    const services = [ollama, comfyui, video, baileys, speechbrain];
    const onlineCount = services.filter((s) => s.status === 'online').length;

    return NextResponse.json({
      success: true,
      data: {
        overall: onlineCount === services.length
          ? 'online'
          : onlineCount >= 2
            ? 'degraded'
            : 'offline',
        services,
        fluroOrchestrator: fluroHealth
          ? {
              overall: fluroHealth.overall,
              chat: fluroHealth.chat,
              details: fluroHealth.details,
            }
          : null,
        summary: {
          total: services.length,
          online: onlineCount,
          offline: services.filter((s) => s.status === 'offline').length,
          error: services.filter((s) => s.status === 'error').length,
        },
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    log.error('Failed to check Fluro services', { error });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check services',
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/fluro/services — Start/stop/restart a service
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    requireRole: 'admin',
  });
  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { serviceId, action } = body;

    if (!serviceId || !action) {
      return NextResponse.json(
        { success: false, error: 'serviceId and action are required' },
        { status: 400 },
      );
    }

    if (!['start', 'stop', 'restart'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Action must be start, stop, or restart' },
        { status: 400 },
      );
    }

    const validServices = ['ollama', 'comfyui', 'video', 'baileys', 'speechbrain'];
    if (!validServices.includes(serviceId)) {
      return NextResponse.json(
        { success: false, error: `Invalid service. Valid: ${validServices.join(', ')}` },
        { status: 400 },
      );
    }

    // Service management is done via the process manager (pm2)
    // The SaaS communicates service commands through this API
    const serviceCommands: Record<string, Record<string, string>> = {
      ollama: {
        start: 'OLLAMA_HOST=0.0.0.0:11434 OLLAMA_MODELS=/home/z/my-project/data/ollama-models /home/z/.local/bin/ollama serve',
        stop: 'pkill -f "ollama serve" || true',
        restart: 'pkill -f "ollama serve" || true; sleep 2; OLLAMA_HOST=0.0.0.0:11434 OLLAMA_MODELS=/home/z/my-project/data/ollama-models nohup /home/z/.local/bin/ollama serve > /tmp/fluro-server.log 2>&1 &',
      },
      comfyui: {
        start: 'cd /tmp/my-project/services/comfyui && source venv/bin/activate && nohup python main.py --listen 0.0.0.0 --port 8188 --cpu --disable-xformers > /tmp/comfyui-server.log 2>&1 &',
        stop: 'pkill -f "main.py.*8188" || true',
        restart: 'pkill -f "main.py.*8188" || true; sleep 2; cd /tmp/my-project/services/comfyui && source venv/bin/activate && nohup python main.py --listen 0.0.0.0 --port 8188 --cpu --disable-xformers > /tmp/comfyui-server.log 2>&1 &',
      },
      video: {
        start: 'cd /tmp/my-project/services/video-api && nohup python3 server.py --port 8189 > /tmp/video-server.log 2>&1 &',
        stop: 'pkill -f "server.py.*8189" || true',
        restart: 'pkill -f "server.py.*8189" || true; sleep 2; cd /tmp/my-project/services/video-api && nohup python3 server.py --port 8189 > /tmp/video-server.log 2>&1 &',
      },
      baileys: {
        start: 'pm2 start /home/z/my-project/services/baileys/server.js --name baileys-whatsapp',
        stop: 'pm2 stop baileys-whatsapp',
        restart: 'pm2 restart baileys-whatsapp',
      },
      speechbrain: {
        start: 'nohup python3 /tmp/my-project/services/speechbrain_api_server.py --port 8187 > /tmp/speechbrain-server.log 2>&1 &',
        stop: 'pkill -f "speechbrain.*8187" || true',
        restart: 'pkill -f "speechbrain.*8187" || true; sleep 2; nohup python3 /tmp/my-project/services/speechbrain_api_server.py --port 8187 > /tmp/speechbrain-server.log 2>&1 &',
      },
    };

    const command = serviceCommands[serviceId]?.[action];
    if (!command) {
      return NextResponse.json(
        { success: false, error: `Unknown action ${action} for service ${serviceId}` },
        { status: 400 },
      );
    }

    // Execute the command using child_process
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
      log.info(`Service ${serviceId} ${action} executed`, { stdout: stdout.slice(0, 200), stderr: stderr.slice(0, 200) });
    } catch (execError) {
      // Even if the command "fails" (e.g., pkill returns non-zero when no process found),
      // the action might still have succeeded. Log and continue.
      log.warn(`Service ${serviceId} ${action} command returned non-zero`, {
        error: execError instanceof Error ? execError.message : String(execError),
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        serviceId,
        action,
        command: command.split(' ')[0] + ' ...', // Don't expose full command
        message: `Service ${serviceId} ${action} command executed`,
        note: 'Service may take a few seconds to fully start/stop. Check status with GET /api/fluro/services',
      },
    });
  } catch (error) {
    log.error('Failed to manage Fluro service', { error });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to manage service',
      },
      { status: 500 },
    );
  }
}
