/**
 * Fluro.IA Model Management API
 *
 * GET  /api/fluro/models — List all available models on Fluro (Ollama)
 * POST /api/fluro/models — Pull/delete a model on the Fluro server
 *
 * This allows the SaaS to manage AI models available through Fluro.IA.
 */

import { NextRequest, NextResponse } from 'next/server';
import { listFluroModels, pullFluroModel, deleteFluroModel, isFluroHealthy } from '@/lib/fluro-client';
import { applySecurity } from '@/lib/security';
import { createLogger } from '@/lib/logger';

const log = createLogger('fluro-models');

// ---------------------------------------------------------------------------
// GET /api/fluro/models — List available models
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    // Check if Fluro (Ollama) is running
    const healthy = await isFluroHealthy();
    if (!healthy) {
      return NextResponse.json({
        success: false,
        error: 'Fluro.IA (Ollama) server is not running. Start it first.',
        data: {
          models: [],
          serverStatus: 'offline',
        },
      }, { status: 503 });
    }

    const models = await listFluroModels();

    return NextResponse.json({
      success: true,
      data: {
        models: models.map((m) => ({
          name: m.name,
          family: m.family,
          size: m.size,
          sizeFormatted: formatBytes(m.size),
          quantization: m.quantization,
        })),
        total: models.length,
        serverStatus: 'online',
      },
    });
  } catch (error) {
    log.error('Failed to list Fluro models', { error });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list models',
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/fluro/models — Pull or delete a model
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
    const { action, modelName } = body;

    if (!action || !modelName) {
      return NextResponse.json(
        { success: false, error: 'action and modelName are required' },
        { status: 400 },
      );
    }

    if (!['pull', 'delete'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Action must be pull or delete' },
        { status: 400 },
      );
    }

    // Check if Fluro is running
    const healthy = await isFluroHealthy();
    if (!healthy) {
      return NextResponse.json({
        success: false,
        error: 'Fluro.IA (Ollama) server is not running',
      }, { status: 503 });
    }

    if (action === 'pull') {
      log.info('Pulling Fluro model', { modelName });

      const success = await pullFluroModel(modelName, (status, completed, total) => {
        log.info('Model pull progress', { modelName, status, completed, total });
      });

      return NextResponse.json({
        success,
        data: {
          modelName,
          action: 'pull',
          message: success
            ? `Model ${modelName} pulled successfully to Fluro.IA`
            : `Failed to pull model ${modelName}`,
        },
      });
    }

    if (action === 'delete') {
      log.info('Deleting Fluro model', { modelName });

      const success = await deleteFluroModel(modelName);

      return NextResponse.json({
        success,
        data: {
          modelName,
          action: 'delete',
          message: success
            ? `Model ${modelName} deleted from Fluro.IA`
            : `Failed to delete model ${modelName}`,
        },
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    log.error('Failed to manage Fluro model', { error });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to manage model',
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
