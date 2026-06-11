import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { getWhatsAppRouter } from '@/lib/whatsapp-router';

const log = createLogger('whatsapp-voice-responder');

/**
 * Initiates an AI voice call response via WhatsApp.
 * PRD Requirement 5: "appel et voix vocal si nécessaires et autorisation de l'utilisateur"
 */
export async function initiateVoiceResponse(userId: string, to: string, message: string) {
  log.info('Initiating WhatsApp voice response', { userId, to });

  try {
    const config = await db.whatsAppConfig.findUnique({
      where: { userId }
    });

    if (!config?.autoCall) {
      log.info('Auto-call disabled for user, skipping voice response', { userId });
      return;
    }

    const router = getWhatsAppRouter();

    // Check for explicit user authorization in the action log or a temporary flag
    // (In production, this would use a more sophisticated state machine)
    const latestApproval = await db.approvalRequest.findFirst({
      where: { userId, action: 'whatsapp_call', status: 'approved' },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestApproval) {
      log.warn('No approved call request found. Voice response requires authorization.', { userId });
      return;
    }

    await router.initiateCall(to, message);
    log.info('WhatsApp voice call initiated successfully', { userId, to });

  } catch (error) {
    log.error('Failed to initiate WhatsApp voice response', { userId, error });
  }
}
