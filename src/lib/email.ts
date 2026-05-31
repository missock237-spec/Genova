/**
 * Email Service — Resend Only
 *
 * Stratégie de livraison :
 * 1. Resend SDK (méthode principale)
 * 2. Resend REST API (fallback si SDK échoue)
 * 3. Console log — développement uniquement
 *
 * Nodemailer a été retiré pour éliminer la double architecture
 * et simplifier la maintenance. Resend est le seul provider en production.
 */

import { Resend } from 'resend';
import { createLogger } from '@/lib/logger';

const log = createLogger('email');

interface EmailResult {
  success: boolean;
  method?: string;
  error?: string;
  messageId?: string;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

const DEFAULT_FROM = 'Genova AgentOS <onboarding@resend.dev>';

/**
 * Récupère l'adresse d'expédition configurée.
 * En production avec un domaine vérifié Resend, utiliser :
 *   'Genova AgentOS <noreply@votre-domaine.com>'
 */
function getFromAddress(): string {
  return process.env.EMAIL_FROM || DEFAULT_FROM;
}

// ---------------------------------------------------------------------------
// 1. Resend SDK (méthode principale)
// ---------------------------------------------------------------------------

async function sendViaResendSDK(options: EmailOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { success: false, method: 'resend-sdk', error: 'No RESEND_API_KEY' };

  try {
    const resend = new Resend(apiKey);

    const { data, error } = await resend.emails.send({
      from: options.from || getFromAddress(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
      tags: options.tags,
    });

    if (error) {
      log.warn('Resend SDK error', { error: error.message, to: options.to });
      // If this is a domain verification error, note it clearly
      if (error.message.includes('verify a domain') || error.message.includes('testing emails')) {
        log.info('Email domain not verified — in development, emails can only be sent to the account owner email. Verify a domain at resend.com/domains for production.');
      }
      return { success: false, method: 'resend-sdk', error: error.message };
    }

    log.info('Email sent via Resend SDK', { messageId: data?.id, to: options.to });
    return { success: true, method: 'resend-sdk', messageId: data?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Resend SDK error';
    log.warn('Resend SDK exception', { error: message, to: options.to });
    return { success: false, method: 'resend-sdk', error: message };
  }
}

// ---------------------------------------------------------------------------
// 2. Resend REST API (fallback si SDK échoue)
// ---------------------------------------------------------------------------

async function sendViaResendREST(options: EmailOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { success: false, method: 'resend-rest', error: 'No RESEND_API_KEY' };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: options.from || getFromAddress(),
        to: options.to,
        subject: options.subject,
        html: options.html,
        reply_to: options.replyTo,
        tags: options.tags,
      }),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      log.info('Email sent via Resend REST', { messageId: data.id, to: options.to });
      return { success: true, method: 'resend-rest', messageId: data.id };
    }

    const body = await response.text().catch(() => '');
    log.warn('Resend REST error', { status: response.status, to: options.to });
    return { success: false, method: 'resend-rest', error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Resend REST error';
    log.warn('Resend REST exception', { error: message, to: options.to });
    return { success: false, method: 'resend-rest', error: message };
  }
}

// ---------------------------------------------------------------------------
// 3. Console fallback (développement uniquement)
// ---------------------------------------------------------------------------

function sendViaConsole(options: EmailOptions): EmailResult {
  if (process.env.NODE_ENV === 'production') {
    return { success: false, method: 'none', error: 'No email provider configured in production' };
  }

  log.debug('Email (dev console)', { to: options.to, subject: options.subject });
  return { success: true, method: 'console' };
}

// ---------------------------------------------------------------------------
// Fonction principale : sendEmail
// ---------------------------------------------------------------------------

/**
 * Envoie un email transactionnel en essayant successivement :
 * Resend SDK → Resend REST → Console (dev only)
 *
 * Chaque méthode est tentée uniquement si la précédente échoue,
 * garantissant une livraison fiable avec le maximum de méthodes disponibles.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  options?: Partial<EmailOptions>
): Promise<EmailResult> {
  const emailOptions: EmailOptions = { to, subject, html, ...options };

  // 1. Resend SDK (méthode privilégiée)
  if (process.env.RESEND_API_KEY) {
    const result = await sendViaResendSDK(emailOptions);
    if (result.success) return result;

    // 2. Resend REST fallback
    const restResult = await sendViaResendREST(emailOptions);
    if (restResult.success) return restResult;
  }

  // 3. Console (développement)
  return sendViaConsole(emailOptions);
}

// ---------------------------------------------------------------------------
// Helpers pour les emails transactionnels courants
// ---------------------------------------------------------------------------

/**
 * Email de vérification d'adresse email (6-digit code)
 */
export async function sendVerificationEmail(
  to: string,
  code: string,
  userName?: string
): Promise<EmailResult> {
  return sendEmail(to, 'Vérifiez votre adresse email — Genova AgentOS', `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #f5f5f5; font-size: 24px; font-weight: 700;">Genova AgentOS</h1>
      </div>
      <div style="background: #1a1a2e; border-radius: 12px; padding: 32px; border: 1px solid #2a2a4a;">
        <h2 style="color: #e0e0e0; margin-top: 0;">Vérification de votre email</h2>
        <p style="color: #a0a0b0; font-size: 15px;">
          Bonjour ${userName || ''},<br/>
          Veuillez utiliser le code suivant pour vérifier votre adresse email :
        </p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 4px; padding: 16px 24px; background: #0d0d1a; border-radius: 8px; text-align: center; color: #60a5fa; margin: 24px 0;">
          ${code}
        </div>
        <p style="color: #808090; font-size: 13px;">Ce code expire dans 15 minutes.</p>
        <p style="color: #808090; font-size: 13px;">Si vous n'avez pas créé de compte Genova AgentOS, veuillez ignorer cet email.</p>
      </div>
      <p style="text-align: center; color: #606070; font-size: 12px; margin-top: 24px;">
        Genova AgentOS — AI Operating System
      </p>
    </div>
  `, {
    tags: [{ name: 'type', value: 'verification' }],
  });
}

/**
 * Email de réinitialisation de mot de passe (6-digit code)
 */
export async function sendPasswordResetEmail(
  to: string,
  code: string
): Promise<EmailResult> {
  return sendEmail(to, 'Code de réinitialisation — Genova AgentOS', `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #f5f5f5; font-size: 24px; font-weight: 700;">Genova AgentOS</h1>
      </div>
      <div style="background: #1a1a2e; border-radius: 12px; padding: 32px; border: 1px solid #2a2a4a;">
        <h2 style="color: #e0e0e0; margin-top: 0;">Réinitialisation du mot de passe</h2>
        <p style="color: #a0a0b0; font-size: 15px;">
          Vous avez demandé une réinitialisation de votre mot de passe.
        </p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 4px; padding: 16px 24px; background: #0d0d1a; border-radius: 8px; text-align: center; color: #f59e0b; margin: 24px 0;">
          ${code}
        </div>
        <p style="color: #808090; font-size: 13px;">Ce code expire dans 15 minutes.</p>
        <p style="color: #808090; font-size: 13px;">Si vous n'avez pas demandé cette réinitialisation, veuillez ignorer cet email.</p>
      </div>
      <p style="text-align: center; color: #606070; font-size: 12px; margin-top: 24px;">
        Genova AgentOS — AI Operating System
      </p>
    </div>
  `, {
    tags: [{ name: 'type', value: 'password-reset' }],
  });
}

/**
 * Email de bienvenue après inscription
 */
export async function sendWelcomeEmail(
  to: string,
  userName: string
): Promise<EmailResult> {
  return sendEmail(to, 'Bienvenue sur Genova AgentOS !', `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #f5f5f5; font-size: 24px; font-weight: 700;">Genova AgentOS</h1>
      </div>
      <div style="background: #1a1a2e; border-radius: 12px; padding: 32px; border: 1px solid #2a2a4a;">
        <h2 style="color: #e0e0e0; margin-top: 0;">Bienvenue, ${userName} !</h2>
        <p style="color: #a0a0b0; font-size: 15px;">
          Votre compte Genova AgentOS a été créé avec succès. Vous pouvez maintenant :
        </p>
        <ul style="color: #a0a0b0; font-size: 14px; line-height: 2;">
          <li>Créer et gérer vos agents IA</li>
          <li>Configurer des workflows d'automatisation</li>
          <li>Connecter vos réseaux sociaux et WhatsApp</li>
          <li>Surveiller l'utilisation et les coûts IA</li>
        </ul>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}"
           style="display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px;">
          Accéder au tableau de bord
        </a>
      </div>
      <p style="text-align: center; color: #606070; font-size: 12px; margin-top: 24px;">
        Genova AgentOS — AI Operating System
      </p>
    </div>
  `, {
    tags: [{ name: 'type', value: 'welcome' }],
  });
}
