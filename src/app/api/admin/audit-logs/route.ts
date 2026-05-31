/**
 * Admin: Audit Logs API
 * Requires admin role to access.
 * GET: List audit logs with filtering
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    requireRole: 'admin',
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);
    const action = searchParams.get('action') || undefined;
    const severity = searchParams.get('severity') || undefined;
    const filterUserId = searchParams.get('userId') || undefined;

    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (severity) where.severity = severity;
    if (filterUserId) where.userId = filterUserId;

    // Super_admin can see all logs; admin sees all too
    if (auth.role !== 'super_admin' && auth.role !== 'admin' && !filterUserId) {
      where.userId = auth.userId;
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.auditLog.count({ where }),
    ]);

    const res = NextResponse.json({ logs, total, limit, offset });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
