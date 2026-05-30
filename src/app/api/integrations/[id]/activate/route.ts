/**
 * POST /api/integrations/[id]/activate — Activate an integration
 * POST /api/integrations/[id]/activate?deactivate=true — Deactivate
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIntegrationRegistry } from '@/lib/integration-engine/registry';

export async function POST(
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

    const body = await request.json().catch(() => ({}));
    const userId = body.userId || 'system';
    const deactivate = body.deactivate === true;

    if (deactivate) {
      await registry.deactivate(id, userId);
      return NextResponse.json({
        success: true,
        data: { id, status: 'inactive', message: 'Integration deactivated' },
      });
    }

    await registry.activate(id, userId);

    // Run health check after activation
    const health = await registry.checkHealth(id);

    return NextResponse.json({
      success: true,
      data: {
        id,
        status: 'active',
        health,
        message: 'Integration activated successfully',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Activation failed' },
      { status: 500 },
    );
  }
}
