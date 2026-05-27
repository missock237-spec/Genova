// Email Sending Utility for Genova
// Supports SMTP (nodemailer) for production, console logging for development

import { createTransport, Transporter } from 'nodemailer';

let _transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[EMAIL] SMTP not configured — emails will be logged to console only');
    return null;
  }

  _transporter = createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });

  return _transporter;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email. Falls back to console logging if SMTP is not configured.
 */
export async function sendEmail({ to, subject, html, text }: EmailOptions): Promise<boolean> {
  const from = process.env.EMAIL_FROM || 'noreply@genova.app';

  // Development mode: log email instead of sending
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[EMAIL DEV MODE] To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`${'='.repeat(60)}`);
    console.log(text || html.replace(/<[^>]*>/g, ''));
    console.log(`${'='.repeat(60)}\n`);
    return true;
  }

  try {
    const result = await transporter.sendMail({
      from: `"Genova" <${from}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });

    console.log(`[EMAIL] Sent to ${to}: ${subject} (ID: ${result.messageId})`);
    return true;
  } catch (error) {
    console.error('[EMAIL] Failed to send:', error);
    return false;
  }
}

/**
 * Send a password reset code email
 */
export async function sendPasswordResetCode(to: string, code: string, userName: string): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return sendEmail({
    to,
    subject: 'Genova — Code de récupération de votre compte',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #6366f1; font-size: 24px; margin: 0;">Genova</h1>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">AI Operating System</p>
        </div>

        <div style="background: #f8fafc; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0;">
          <h2 style="margin: 0 0 8px; font-size: 18px; color: #1e293b;">Bonjour ${userName},</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            Vous avez demandé la réinitialisation de votre mot de passe. Utilisez le code ci-dessous pour continuer :
          </p>

          <div style="background: #6366f1; color: white; font-size: 32px; font-weight: 700;
                      letter-spacing: 0.5em; text-align: center; padding: 16px;
                      border-radius: 8px; margin: 24px 0; font-family: 'Courier New', monospace;">
            ${code}
          </div>

          <p style="color: #475569; font-size: 13px; line-height: 1.6;">
            Ce code est valable pendant <strong>15 minutes</strong>. Si vous n'avez pas fait cette demande, ignorez cet email — votre compte est en sécurité.
          </p>
        </div>

        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 24px;">
          Cet email a été envoyé par Genova. Si vous n'avez pas de compte Genova, ignorez ce message.<br/>
          <a href="${appUrl}" style="color: #6366f1;">${appUrl}</a>
        </p>
      </div>
    `,
    text: `Bonjour ${userName},\n\nVotre code de récupération Genova est : ${code}\n\nCe code est valable pendant 15 minutes. Si vous n'avez pas fait cette demande, ignorez cet email.\n\nGenova — ${appUrl}`,
  });
}
