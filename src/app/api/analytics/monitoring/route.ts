import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const userId = auth.userId;
    const severity = request.nextUrl.searchParams.get('severity');
    const resolvedParam = request.nextUrl.searchParams.get('resolved');
    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = Math.min(Math.max(parseInt(limitParam || '50', 10) || 50, 1), 200);

    const whereClause: Record<string, unknown> = { userId };

    if (severity) {
      whereClause.severity = severity;
    }

    if (resolvedParam !== null) {
      whereClause.resolved = resolvedParam === 'true';
    }

    const events = await db.monitoringEvent.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Get summary counts
    const [totalEvents, unresolvedCount, criticalCount] = await Promise.all([
      db.monitoringEvent.count({ where: { userId } }),
      db.monitoringEvent.count({ where: { userId, resolved: false } }),
      db.monitoringEvent.count({ where: { userId, severity: 'critical', resolved: false } }),
    ]);

    return secureResponse(
      NextResponse.json({
        events,
        summary: {
          total: totalEvents,
          unresolved: unresolvedCount,
          critical: criticalCount,
        },
      }),
      request
    );
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }),
      request
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const userId = auth.userId;
    const body = await request.json();
    const { eventType, source, message, details, severity } = body;

    if (!eventType || !source || !message) {
      return secureResponse(
        NextResponse.json(
          { error: 'eventType, source, and message are required' },
          { status: 400 }
        ),
        request
      );
    }

    // Validate eventType
    const validEventTypes = ['error', 'warning', 'info', 'performance'];
    if (!validEventTypes.includes(eventType)) {
      return secureResponse(
        NextResponse.json(
          { error: `eventType must be one of: ${validEventTypes.join(', ')}` },
          { status: 400 }
        ),
        request
      );
    }

    // Validate source
    const validSources = ['agent', 'ai', 'workflow', 'browser', 'social', 'whatsapp'];
    if (!validSources.includes(source)) {
      return secureResponse(
        NextResponse.json(
          { error: `source must be one of: ${validSources.join(', ')}` },
          { status: 400 }
        ),
        request
      );
    }

    // Validate severity
    const validSeverities = ['low', 'medium', 'high', 'critical'];
    const eventSeverity = severity || 'info';
    if (!validSeverities.includes(eventSeverity)) {
      return secureResponse(
        NextResponse.json(
          { error: `severity must be one of: ${validSeverities.join(', ')}` },
          { status: 400 }
        ),
        request
      );
    }

    const event = await db.monitoringEvent.create({
      data: {
        userId,
        eventType,
        source,
        message,
        details: JSON.stringify(details || {}),
        severity: eventSeverity,
      },
    });

    return secureResponse(
      NextResponse.json(event, { status: 201 }),
      request
    );
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }),
      request
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const userId = auth.userId;
    const body = await request.json();
    const { eventId, resolved } = body;

    if (!eventId || resolved !== true) {
      return secureResponse(
        NextResponse.json(
          { error: 'eventId and resolved: true are required' },
          { status: 400 }
        ),
        request
      );
    }

    // Verify the event belongs to this user
    const existingEvent = await db.monitoringEvent.findUnique({
      where: { id: eventId },
    });

    if (!existingEvent || existingEvent.userId !== userId) {
      return secureResponse(
        NextResponse.json({ error: 'Event not found' }, { status: 404 }),
        request
      );
    }

    const updatedEvent = await db.monitoringEvent.update({
      where: { id: eventId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
      },
    });

    return secureResponse(
      NextResponse.json(updatedEvent),
      request
    );
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }),
      request
    );
  }
}
