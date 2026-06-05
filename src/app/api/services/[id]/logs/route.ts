import { NextRequest, NextResponse } from 'next/server';
import { getServiceManager } from '@/lib/service-manager';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/services/:id/logs
 * Get recent log lines for a specific service.
 * Query params: ?lines=100 (default 100, max 1000)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const manager = getServiceManager();

    // Validate service exists
    const runtime = manager.getRuntime(id);
    if (!runtime) {
      return NextResponse.json(
        { error: `Service not found: ${id}` },
        { status: 404 }
      );
    }

    const linesParam = request.nextUrl.searchParams.get('lines');
    const lines = Math.min(Math.max(parseInt(linesParam || '100', 10) || 100, 1), 1000);

    const logs = manager.getServiceLogs(id, lines);

    return NextResponse.json({
      serviceId: id,
      lines: logs.length,
      logs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
