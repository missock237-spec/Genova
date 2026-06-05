import { NextResponse } from 'next/server';
import { getServiceManager } from '@/lib/service-manager';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/services/:id/stop
 * Stop a specific service.
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const manager = getServiceManager();

    const success = await manager.stopService(id);

    if (!success) {
      return NextResponse.json(
        { error: `Failed to stop service: ${id}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Service ${id} stopped`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
