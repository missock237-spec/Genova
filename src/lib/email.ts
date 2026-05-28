/**
 * Email Service — PRIORITÉ 3
 *
 * Stratégie de livraison :
 * 1. Resend SDK (production) — utilise l'API Resend nativement
 * 2. Resend REST fallback — si le SDK échoue, appel REST direct
 * 3. SMTP (Nodemailer) — si Resend indisponible
 * 4. Console log — développement uniquement
 */

import { Resend } from 'resend';
import nodemailer from 'nodemailer';

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
      return { success: false, method: 'resend-sdk', error: error.message };
    }

    return { success: true, method: 'resend-sdk', messageId: data?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Resend SDK error';
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
      return { success: true, method: 'resend-rest', messageId: data.id };
    }

    const body = await response.text().catch(() => '');
    return { success: false, method: 'resend-rest', error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Resend REST error';
    return { success: false, method: 'resend-rest', error: message };
  }
}

// ---------------------------------------------------------------------------
// 3. SMTP via Nodemailer (tertiary)
// ---------------------------------------------------------------------------

async function sendViaSMTP(options: EmailOptions): Promise<EmailResult> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return { success: false, method: 'smtp', error: 'SMTP not configured' };
  }

  try {
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const result = await transporter.sendMail({
      from: `"Genova AgentOS" <${smtpUser}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
    });

    return { success: true, method: 'smtp', messageId: result.messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'SMTP error';
    return { success: false, method: 'smtp', error: message };
  }
}

// ---------------------------------------------------------------------------
// 4. Console fallback (développement uniquement)
// ---------------------------------------------------------------------------

function sendViaConsole(options: EmailOptions): EmailResult {
  if (process.env.NODE_ENV === 'production') {
    return { success: false, method: 'none', error: 'No email provider configured in production' };
  }

  console.log(
    `[EMAIL] to=${options.to} subject="${options.subject}" body_preview="${options.html.substring(0, 200)}..."`
  );
  return { success: true, method: 'console' };
}

// ---------------------------------------------------------------------------
// Fonction principale : sendEmail
// ---------------------------------------------------------------------------

/**
 * Envoie un email transactionnel en essayant successivement :
 * Resend SDK → Resend REST → SMTP → Console
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

  // 3. SMTP
  if (process.env.SMTP_HOST) {
    const smtpResult = await sendViaSMTP(emailOptions);
    if (smtpResult.success) return smtpResult;
  }

  // 4. Console (développement)
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
