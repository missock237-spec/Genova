/**
 * GET /api/integrations/[id] — Get integration details
 * PATCH /api/integrations/[id] — Update integration configuration
 * DELETE /api/integrations/[id] — Remove an integration
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

    // Include health check result if available
    const health = registry.getHealthCheck(id);

    return NextResponse.json({
      success: true,
      data: {
        ...integration,
        health,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get integration' },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

    await registry.unregister(id);

    return NextResponse.json({
      success: true,
      data: { message: `Integration ${id} removed` },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to remove integration' },
      { status: 500 },
    );
  }
}
