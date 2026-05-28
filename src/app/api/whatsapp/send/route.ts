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

    if (!to || !message) {
      const res = NextResponse.json(
        { error: 'Recipient and message are required' },
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
    if (message.length > 1000) {
      const res = NextResponse.json(
        { error: 'Message must be at most 1000 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Verify agent ownership and permissions (agentId is required)
    if (!agentId) {
      const res = NextResponse.json(
        { error: 'Agent ID is required to send WhatsApp messages' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

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

    // Check whatsapp_message permission
    const whatsappPerm = agent.permissions.find((p) => p.permission === 'whatsapp_message');
    if (!whatsappPerm || !whatsappPerm.granted) {
      const res = NextResponse.json(
        { error: 'Agent does not have permission to send WhatsApp messages' },
        { status: 403 }
      );
      return secureResponse(res, request);
    }

    // Check if approval is required
    if (whatsappPerm.requiresApproval) {
      const approval = await db.approvalRequest.create({
        data: {
          agentId,
          action: 'whatsapp_message',
          details: JSON.stringify({ to, message: message.substring(0, 500) }),
          userId: auth.userId,
          status: 'pending',
        },
      });

      const res = NextResponse.json({
        requiresApproval: true,
        approvalId: approval.id,
        message: 'WhatsApp message requires approval before sending',
      });
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

    // ---- Real WhatsApp API call ----
    let waResult: { messageId: string; recipientWaId: string } | null = null;
    let waError: string | null = null;

    try {
      // Use per-user phoneNumberId if available, otherwise fall back to env var
      const client = getWhatsAppClient(whatsappConfig.phoneNumberId || undefined);
      waResult = await client.sendMessage(to, message);
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
          action: 'whatsapp_message',
          details: JSON.stringify({ to, message: message.substring(0, 500) }),
          userId: auth.userId,
          status: 'failed',
          result: JSON.stringify({ sent: false, error: waError }),
          resolvedAt: new Date(),
        },
      });

      await db.activityLog.create({
        data: {
          action: 'WhatsApp Message Failed',
          details: JSON.stringify({ agentId, to, error: waError, actionLogId: actionLog.id }),
          category: 'whatsapp',
          userId: auth.userId,
        },
      });

      const res = NextResponse.json(
        { error: 'Failed to send WhatsApp message', details: waError },
        { status: 502 }
      );
      return secureResponse(res, request);
    }

    // Success — log the action
    const actionLog = await db.agentActionLog.create({
      data: {
        agentId,
        action: 'whatsapp_message',
        details: JSON.stringify({ to, message: message.substring(0, 500) }),
        userId: auth.userId,
        status: 'completed',
        result: JSON.stringify({ sent: true, to, messageId: waResult?.messageId, recipientWaId: waResult?.recipientWaId }),
        resolvedAt: new Date(),
      },
    });

    await db.activityLog.create({
      data: {
        action: 'WhatsApp Message Sent',
        details: JSON.stringify({ agentId, to, actionLogId: actionLog.id, messageId: waResult?.messageId }),
        category: 'whatsapp',
        userId: auth.userId,
      },
    });

    const res = NextResponse.json({
      requiresApproval: false,
      sent: true,
      actionLogId: actionLog.id,
      messageId: waResult?.messageId,
      recipientWaId: waResult?.recipientWaId,
      message: 'WhatsApp message sent',
    });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to send WhatsApp message' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
