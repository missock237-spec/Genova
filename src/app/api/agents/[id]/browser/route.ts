import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { checkUrlSafety } from '@/lib/url-safety';

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;

    const agent = await db.agent.findUnique({
      where: { id },
    });

    if (!agent || agent.userId !== auth.userId) {
      const res = NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    // Get or create browser session
    let browserSession = await db.browserSession.findFirst({
      where: { agentId: id },
    });

    if (!browserSession) {
      browserSession = await db.browserSession.create({
        data: {
          agentId: id,
          userId: auth.userId,
          url: 'about:blank',
          status: 'idle',
        },
      });
    }

    const res = NextResponse.json({
      id: browserSession.id,
      agentId: browserSession.agentId,
      url: browserSession.url,
      title: browserSession.title,
      status: browserSession.status,
      screenshot: browserSession.screenshot,
      createdAt: browserSession.createdAt,
      updatedAt: browserSession.updatedAt,
    });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to fetch browser state' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const { action, url, selector, text } = body;

    if (!action) {
      const res = NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const validActions = ['navigate', 'click', 'type', 'screenshot', 'extract'];
    if (!validActions.includes(action)) {
      const res = NextResponse.json(
        { error: `Invalid action. Allowed: ${validActions.join(', ')}` },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Validate URL safety before any navigation
    if (url) {
      try {
        // Use the URL safety checker which covers SSRF, blocklist, and pattern-based detection
        const safetyResult = await checkUrlSafety(url);

        if (!safetyResult.safe) {
          // Log the blocked attempt as a monitoring event
          await db.monitoringEvent.create({
            data: {
              userId: auth.userId,
              eventType: 'security',
              source: 'browser',
              message: `Blocked navigation to unsafe URL: ${url}`,
              details: JSON.stringify({
                url,
                threats: safetyResult.threats,
                riskLevel: safetyResult.riskLevel,
                agentId: id,
                action,
              }),
              severity: safetyResult.riskLevel === 'critical' ? 'critical' : 'high',
            },
          });

          const res = NextResponse.json(
            {
              error: 'URL is not safe to access',
              threats: safetyResult.threats,
              riskLevel: safetyResult.riskLevel,
            },
            { status: 403 }
          );
          return secureResponse(res, request);
        }
      } catch {
        const res = NextResponse.json(
          { error: 'Invalid URL format' },
          { status: 400 }
        );
        return secureResponse(res, request);
      }
    }

    // Validate selector and text lengths
    if (selector && String(selector).length > 500) {
      const res = NextResponse.json(
        { error: 'Selector too long (max 500 characters)' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (text && String(text).length > 10000) {
      const res = NextResponse.json(
        { error: 'Text too long (max 10000 characters)' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const agent = await db.agent.findUnique({
      where: { id },
      include: { permissions: true },
    });

    if (!agent || agent.userId !== auth.userId) {
      const res = NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    // Check browse_web permission
    const browsePerm = agent.permissions.find((p) => p.permission === 'browse_web');
    if (!browsePerm || !browsePerm.granted) {
      const res = NextResponse.json(
        { error: 'Agent does not have permission to browse the web' },
        { status: 403 }
      );
      return secureResponse(res, request);
    }

    // Get or create browser session
    let browserSession = await db.browserSession.findFirst({
      where: { agentId: id },
    });

    if (!browserSession) {
      browserSession = await db.browserSession.create({
        data: {
          agentId: id,
          userId: auth.userId,
          url: 'about:blank',
          status: 'idle',
        },
      });
    }

    // Process browser action
    let updatedData: Record<string, unknown> = {};

    switch (action) {
      case 'navigate': {
        if (!url) {
          const res = NextResponse.json(
            { error: 'URL is required for navigate action' },
            { status: 400 }
          );
          return secureResponse(res, request);
        }
        updatedData = {
          url,
          title: url,
          status: 'navigating',
          screenshot: null,
        };
        break;
      }
      case 'click': {
        if (!selector) {
          const res = NextResponse.json(
            { error: 'Selector is required for click action' },
            { status: 400 }
          );
          return secureResponse(res, request);
        }
        updatedData = {
          status: 'interacting',
        };
        break;
      }
      case 'type': {
        if (!selector || !text) {
          const res = NextResponse.json(
            { error: 'Selector and text are required for type action' },
            { status: 400 }
          );
          return secureResponse(res, request);
        }
        updatedData = {
          status: 'interacting',
        };
        break;
      }
      case 'screenshot': {
        updatedData = {
          status: 'capturing',
          screenshot: `data:image/png;base64,screenshot_${Date.now()}`,
        };
        break;
      }
      case 'extract': {
        updatedData = {
          status: 'extracting',
        };
        break;
      }
    }

    const updatedSession = await db.browserSession.update({
      where: { id: browserSession.id },
      data: {
        ...updatedData,
      },
    });

    // Log the action
    await db.agentActionLog.create({
      data: {
        agentId: id,
        action: `browser_${action}`,
        details: JSON.stringify({ action, url, selector, text }),
        userId: auth.userId,
        status: 'completed',
        result: JSON.stringify({
          url: updatedSession.url,
          title: updatedSession.title,
          status: updatedSession.status,
        }),
        resolvedAt: new Date(),
      },
    });

    const res = NextResponse.json({
      id: updatedSession.id,
      agentId: updatedSession.agentId,
      url: updatedSession.url,
      title: updatedSession.title,
      status: updatedSession.status,
      screenshot: updatedSession.screenshot,
      extractedContent: action === 'extract' ? { text: 'Extracted content placeholder' } : undefined,
      createdAt: updatedSession.createdAt,
      updatedAt: updatedSession.updatedAt,
    });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to execute browser action' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
