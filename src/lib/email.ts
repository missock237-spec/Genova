// Email Sending Utility for Genova
// Supports: Resend API (recommended), SMTP (nodemailer), Console (development)
//
// Configuration priority:
// 1. RESEND_API_KEY → Use Resend.com API (free tier: 100 emails/day)
// 2. SMTP_HOST + SMTP_USER + SMTP_PASS → Use SMTP (Gmail, SendGrid, etc.)
// 3. No config → Log to console (development mode)

import { createTransport, Transporter } from 'nodemailer';

let _transporter: Transporter | null = null;
let _transportType: 'resend' | 'smtp' | 'console' | null = null;

function initializeTransport(): void {
  if (_transportType) return;

  // 1. Try Resend API (recommended for production)
  if (process.env.RESEND_API_KEY) {
    _transportType = 'resend';
    console.info('[EMAIL] Using Resend API');
    return;
  }

  // 2. Try SMTP
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    _transporter = createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: { user, pass },
    });
    _transportType = 'smtp';
    console.info(`[EMAIL] Using SMTP (${host}:${port})`);
    return;
  }

  // 3. Console fallback (development)
  _transportType = 'console';
  console.warn('[EMAIL] No SMTP or Resend configured — emails will be logged to console only');
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email using Resend API
 */
async function sendViaResend({ to, subject, html, text }: EmailOptions): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Genova <${from}>`,
        to: [to],
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[EMAIL] Resend API error:', response.status, errorData);
      return false;
    }

    const result = await response.json();
    console.log(`[EMAIL] Sent via Resend to ${to} (ID: ${result.id})`);
    return true;
  } catch (error) {
    console.error('[EMAIL] Resend failed:', error);
    return false;
  }
}

/**
 * Send an email via SMTP (nodemailer)
 */
async function sendViaSmtp({ to, subject, html, text }: EmailOptions): Promise<boolean> {
  if (!_transporter) return false;

  const from = process.env.EMAIL_FROM || 'noreply@genova.app';

  try {
    const result = await _transporter.sendMail({
      from: `"Genova" <${from}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });

    console.log(`[EMAIL] Sent via SMTP to ${to}: ${subject} (ID: ${result.messageId})`);
    return true;
  } catch (error) {
    console.error('[EMAIL] SMTP failed:', error);
    return false;
  }
}

/**
 * Log email to console (development mode)
 */
function logToConsole({ to, subject, html, text }: EmailOptions): boolean {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[EMAIL DEV MODE] To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`${'='.repeat(60)}`);
  console.log(text || html.replace(/<[^>]*>/g, ''));
  console.log(`${'='.repeat(60)}\n`);
  return true;
}

/**
 * Send an email. Automatically selects the best available transport.
 * Priority: Resend API → SMTP → Console logging
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  initializeTransport();

  switch (_transportType) {
    case 'resend':
      return sendViaResend(options);
    case 'smtp':
      return sendViaSmtp(options);
    case 'console':
    default:
      return logToConsole(options);
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

/**
 * Get the current email transport type (for debugging)
 */
export function getEmailTransportType(): string {
  initializeTransport();
  return _transportType || 'unknown';
}
