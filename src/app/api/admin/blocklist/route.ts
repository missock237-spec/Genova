import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import {
  getBlockedDomains,
  addBlockedDomain,
  removeBlockedDomain,
} from '@/lib/url-safety';
import { db } from '@/lib/db';

// Admin rate limiting — stricter than normal
const ADMIN_RATE_LIMIT = { limit: 50, windowMs: 60 * 1000 }; // 50 req/min

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

// ============================================================
// Helper — Verify admin access
// ============================================================

async function verifyAdmin(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  // Admin = users with 'admin' or 'enterprise' plan
  return user?.plan === 'admin' || user?.plan === 'enterprise';
}

// ============================================================
// GET /api/admin/blocklist — List blocked domains
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, {
      requireAuth: true,
      rateLimit: ADMIN_RATE_LIMIT,
    });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    // Verify admin access
    const isAdmin = await verifyAdmin(auth.userId);
    if (!isAdmin) {
      return secureResponse(
        NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
        request
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const threatType = searchParams.get('threatType') || undefined;
    const severity = searchParams.get('severity') || undefined;
    const activeOnly = searchParams.get('activeOnly') !== 'false'; // default true

    // Validate filter params
    if (threatType && !['malware', 'phishing', 'spam', 'scam', 'suspicious'].includes(threatType)) {
      return secureResponse(
        NextResponse.json(
          { error: 'Invalid threatType. Allowed: malware, phishing, spam, scam, suspicious' },
          { status: 400 }
        ),
        request
      );
    }

    if (severity && !['low', 'medium', 'high', 'critical'].includes(severity)) {
      return secureResponse(
        NextResponse.json(
          { error: 'Invalid severity. Allowed: low, medium, high, critical' },
          { status: 400 }
        ),
        request
      );
    }

    const result = await getBlockedDomains({
      limit,
      offset,
      threatType,
      severity,
      activeOnly,
    });

    return secureResponse(
      NextResponse.json(result),
      request
    );
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Failed to fetch blocklist' }, { status: 500 }),
      request
    );
  }
}

// ============================================================
// POST /api/admin/blocklist — Add a domain to blocklist
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, {
      requireAuth: true,
      rateLimit: ADMIN_RATE_LIMIT,
    });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    // Verify admin access
    const isAdmin = await verifyAdmin(auth.userId);
    if (!isAdmin) {
      return secureResponse(
        NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
        request
      );
    }

    const body = await request.json();
    const { domain, reason, threatType, severity } = body;

    // Validate required fields
    if (!domain || typeof domain !== 'string' || domain.trim().length === 0) {
      return secureResponse(
        NextResponse.json({ error: 'Domain is required' }, { status: 400 }),
        request
      );
    }

    if (domain.length > 500) {
      return secureResponse(
        NextResponse.json({ error: 'Domain must be at most 500 characters' }, { status: 400 }),
        request
      );
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return secureResponse(
        NextResponse.json({ error: 'Reason is required' }, { status: 400 }),
        request
      );
    }

    if (reason.length > 1000) {
      return secureResponse(
        NextResponse.json({ error: 'Reason must be at most 1000 characters' }, { status: 400 }),
        request
      );
    }

    try {
      const entry = await addBlockedDomain(
        domain.trim(),
        reason.trim(),
        threatType || 'malware',
        severity || 'high'
      );

      // Log the admin action
      await db.activityLog.create({
        data: {
          action: 'Blocklist domain added',
          details: JSON.stringify({ domain: entry.domain, reason: entry.reason, threatType, severity }),
          category: 'security',
          userId: auth.userId,
        },
      });

      return secureResponse(
        NextResponse.json(entry, { status: 201 }),
        request
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add domain';
      return secureResponse(
        NextResponse.json({ error: message }, { status: 400 }),
        request
      );
    }
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Failed to add domain to blocklist' }, { status: 500 }),
      request
    );
  }
}

// ============================================================
// DELETE /api/admin/blocklist — Remove a domain from blocklist
// ============================================================

export async function DELETE(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, {
      requireAuth: true,
      rateLimit: ADMIN_RATE_LIMIT,
    });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    // Verify admin access
    const isAdmin = await verifyAdmin(auth.userId);
    if (!isAdmin) {
      return secureResponse(
        NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
        request
      );
    }

    const body = await request.json();
    const { domain } = body;

    if (!domain || typeof domain !== 'string' || domain.trim().length === 0) {
      return secureResponse(
        NextResponse.json({ error: 'Domain is required' }, { status: 400 }),
        request
      );
    }

    const removed = await removeBlockedDomain(domain.trim());

    if (!removed) {
      return secureResponse(
        NextResponse.json({ error: 'Domain not found in blocklist' }, { status: 404 }),
        request
      );
    }

    // Log the admin action
    await db.activityLog.create({
      data: {
        action: 'Blocklist domain removed',
        details: JSON.stringify({ domain: domain.trim() }),
        category: 'security',
        userId: auth.userId,
      },
    });

    return secureResponse(
      NextResponse.json({ success: true, message: 'Domain removed from blocklist' }),
      request
    );
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Failed to remove domain from blocklist' }, { status: 500 }),
      request
    );
  }
}
