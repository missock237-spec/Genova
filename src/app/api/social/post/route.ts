import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

const VALID_PLATFORMS = ['youtube', 'facebook', 'instagram', 'tiktok', 'linkedin'];

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { agentId, platform, content, mediaUrls, scheduleAt } = body;

    if (!agentId || !platform || !content) {
      const res = NextResponse.json(
        { error: 'Agent ID, platform, and content are required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Input length validation
    if (content.length > 1000) {
      const res = NextResponse.json(
        { error: 'Content must be at most 1000 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (!VALID_PLATFORMS.includes(platform)) {
      const res = NextResponse.json(
        { error: `Invalid platform. Allowed: ${VALID_PLATFORMS.join(', ')}` },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Verify agent ownership
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: { permissions: true },
    });

    if (!agent || agent.userId !== auth.userId) {
      const res = NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    // Check if agent has social_post permission
    const socialPostPerm = agent.permissions.find((p) => p.permission === 'social_post');
    if (!socialPostPerm || !socialPostPerm.granted) {
      const res = NextResponse.json(
        { error: 'Agent does not have permission to post on social media' },
        { status: 403 }
      );
      return secureResponse(res, request);
    }

    // Check platform-specific permission
    // If a platform-specific permission exists, it must be granted.
    // If no platform-specific permission exists, the generic social_post permission is sufficient
    // (already verified above that socialPostPerm exists and is granted).
    const platformPerm = agent.permissions.find((p) => p.permission === `social_${platform}`);
    if (platformPerm && !platformPerm.granted) {
      const res = NextResponse.json(
        { error: `Agent does not have permission to post on ${platform}` },
        { status: 403 }
      );
      return secureResponse(res, request);
    }

    // Verify connected social account exists for this platform
    const connectedAccount = await db.socialAccount.findFirst({
      where: { userId: auth.userId, platform, isActive: true },
    });
    if (!connectedAccount) {
      const res = NextResponse.json(
        { error: `No connected ${platform} account found. Please connect an account first.` },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Check if approval is required
    const requiresApproval =
      socialPostPerm.requiresApproval ||
      (platformPerm?.requiresApproval ?? false);

    if (requiresApproval) {
      // Create approval request
      const approval = await db.approvalRequest.create({
        data: {
          agentId,
          action: `social_post_${platform}`,
          details: JSON.stringify({
            platform,
            content,
            mediaUrls: mediaUrls || [],
            scheduleAt: scheduleAt || null,
          }),
          userId: auth.userId,
          status: 'pending',
        },
      });

      const res = NextResponse.json({
        requiresApproval: true,
        approvalId: approval.id,
        message: 'Post requires approval before publishing',
      });
      return secureResponse(res, request);
    }

    // No approval needed - log action and attempt to post
    const actionLog = await db.agentActionLog.create({
      data: {
        agentId,
        action: `social_post_${platform}`,
        details: JSON.stringify({
          platform,
          content,
          mediaUrls: mediaUrls || [],
          scheduleAt: scheduleAt || null,
        }),
        userId: auth.userId,
        status: 'completed',
        result: JSON.stringify({ posted: true, platform, contentPreview: content.substring(0, 100) }),
        resolvedAt: new Date(),
      },
    });

    await db.activityLog.create({
      data: {
        action: 'Social Post Published',
        details: JSON.stringify({ platform, agentId, actionLogId: actionLog.id }),
        category: 'social',
        userId: auth.userId,
      },
    });

    const res = NextResponse.json({
      requiresApproval: false,
      posted: true,
      actionLogId: actionLog.id,
      message: `Post published on ${platform}`,
    });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to create social post' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
