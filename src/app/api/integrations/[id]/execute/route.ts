/**
 * POST /api/integrations/[id]/execute — Execute an integration function
 *
 * Executes a specific function from an integration with parameters.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIntegrationExecutor } from '@/lib/integration-engine/executor';
import { getIntegrationRegistry } from '@/lib/integration-engine/registry';
import type { ExecutionRequest } from '@/lib/integration-engine/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { functionId, params: execParams, userId, timeoutMs, priority, fallbackIds } = body;

    if (!functionId) {
      return NextResponse.json(
        { success: false, error: 'functionId is required' },
        { status: 400 },
      );
    }

    const registry = getIntegrationRegistry();
    const integration = registry.getById(id);

    if (!integration) {
      return NextResponse.json(
        { success: false, error: `Integration not found: ${id}` },
        { status: 404 },
      );
    }

    const executor = getIntegrationExecutor();

    const executionRequest: ExecutionRequest = {
      integrationId: id,
      functionId,
      params: execParams || {},
      userId: userId || 'anonymous',
      timeoutMs: timeoutMs || undefined,
      priority: priority || 'normal',
    };

    let result;

    if (fallbackIds && Array.isArray(fallbackIds) && fallbackIds.length > 0) {
      result = await executor.executeWithFallback(executionRequest, fallbackIds);
    } else {
      result = await executor.execute(executionRequest);
    }

    const statusCode = result.success ? 200 : 422;

    return NextResponse.json({
      success: result.success,
      data: result.success ? result.data : undefined,
      error: result.success ? undefined : result.error,
      meta: {
        executionTimeMs: result.executionTimeMs,
        provider: result.provider,
        costUsd: result.costUsd,
        metadata: result.metadata,
      },
    }, { status: statusCode });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Execution failed' },
      { status: 500 },
    );
  }
}
