import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { getWhatsAppClient, WhatsAppApiError } from '@/lib/whatsapp-client';

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
    const { agentId, to, message } = body;

    if (!agentId || !to) {
      const res = NextResponse.json(
        { error: 'Agent ID and recipient are required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Validate phone number format (international format)
    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    if (!phoneRegex.test(to.replace(/[\s-]/g, ''))) {
      const res = NextResponse.json(
        { error: 'Invalid phone number format. Use international format (e.g., +33612345678)' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Input length validation
    if (message && message.length > 1000) {
      const res = NextResponse.json(
        { error: 'Message must be at most 1000 characters' },
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

    // Check whatsapp_call permission
    const whatsappPerm = agent.permissions.find((p) => p.permission === 'whatsapp_call');
    if (!whatsappPerm || !whatsappPerm.granted) {
      const res = NextResponse.json(
        { error: 'Agent does not have permission to make WhatsApp calls' },
        { status: 403 }
      );
      return secureResponse(res, request);
    }

    // Check WhatsApp config exists
    const whatsappConfig = await db.whatsAppConfig.findUnique({
      where: { userId: auth.userId },
    });

    if (!whatsappConfig || !whatsappConfig.isActive) {
      const res = NextResponse.json(
        { error: 'WhatsApp is not configured or inactive' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Check if approval is required
    if (whatsappPerm.requiresApproval) {
      const approval = await db.approvalRequest.create({
        data: {
          agentId,
          action: 'whatsapp_call',
          details: JSON.stringify({ to, message: message || '' }),
          userId: auth.userId,
          status: 'pending',
        },
      });

      const res = NextResponse.json({
        requiresApproval: true,
        approvalId: approval.id,
        message: 'WhatsApp call requires approval before initiating',
      });
      return secureResponse(res, request);
    }

    // ---- Real WhatsApp API call ----
    let waResult: { callId: string } | null = null;
    let waError: string | null = null;

    try {
      // Use per-user phoneNumberId if available, otherwise fall back to env var
      const client = getWhatsAppClient(whatsappConfig.phoneNumberId || undefined);
      waResult = await client.initiateCall(to, message);
    } catch (err) {
      if (err instanceof WhatsAppApiError) {
        waError = err.message;
      } else {
        waError = err instanceof Error ? err.message : 'Unknown WhatsApp API error';
      }
    }

    if (waError) {
      // Log the failed attempt
      const actionLog = await db.agentActionLog.create({
        data: {
          agentId,
          action: 'whatsapp_call',
          details: JSON.stringify({ to, message: message || '' }),
          userId: auth.userId,
          status: 'failed',
          result: JSON.stringify({ initiated: false, error: waError }),
          resolvedAt: new Date(),
        },
      });

      await db.activityLog.create({
        data: {
          action: 'WhatsApp Call Failed',
          details: JSON.stringify({ agentId, to, error: waError, actionLogId: actionLog.id }),
          category: 'whatsapp',
          userId: auth.userId,
        },
      });

      const res = NextResponse.json(
        { error: 'Failed to initiate WhatsApp call', details: waError },
        { status: 502 }
      );
      return secureResponse(res, request);
    }

    // Success — log the action
    const actionLog = await db.agentActionLog.create({
      data: {
        agentId,
        action: 'whatsapp_call',
        details: JSON.stringify({ to, message: message || '' }),
        userId: auth.userId,
        status: 'completed',
        result: JSON.stringify({ initiated: true, to, callId: waResult?.callId }),
        resolvedAt: new Date(),
      },
    });

    await db.activityLog.create({
      data: {
        action: 'WhatsApp Call Initiated',
        details: JSON.stringify({ agentId, to, actionLogId: actionLog.id, callId: waResult?.callId }),
        category: 'whatsapp',
        userId: auth.userId,
      },
    });

    const res = NextResponse.json({
      requiresApproval: false,
      initiated: true,
      actionLogId: actionLog.id,
      callId: waResult?.callId,
      message: 'WhatsApp call initiated',
    });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to initiate WhatsApp call' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
