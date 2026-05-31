/**
 * GET /api/integrations/[id]/status — Health check an integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIntegrationRegistry } from '@/lib/integration-engine/registry';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const registry = getIntegrationRegistry();
    const integration = registry.getById(id);

    if (!integration) {
      return NextResponse.json(
        { success: false, error: `Integration not found: ${id}` },
        { status: 404 },
      );
    }

    const health = await registry.checkHealth(id);

    return NextResponse.json({
      success: true,
      data: {
        id,
        status: integration.status,
        health,
        lastHealthCheck: health.checkedAt,
        functions: integration.functions.length,
        error: integration.error,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Health check failed' },
      { status: 500 },
    );
  }
}
