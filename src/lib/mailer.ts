/**
 * GENOVA AI OS — Mailer
 * Sends transactional emails via Nodemailer (SMTP).
 * Falls back to console logging if SMTP is not configured.
 * Configure via environment variables.
 */

import nodemailer from 'nodemailer';
import { createLogger } from '@/lib/logger';

const log = createLogger('mailer');

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const FROM_NAME = process.env.MAIL_FROM_NAME ?? 'Genova AI';
const FROM_EMAIL = process.env.MAIL_FROM_EMAIL ?? 'noreply@genova.ai';
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    },
  });
}

// ─── VERIFICATION EMAIL ───────────────────────────────────────────────────────

export async function sendVerificationEmail(opts: {
  to: string;
  name: string;
  token: string;
}): Promise<void> {
  const link = `${BASE_URL}/verify-email?token=${opts.token}`;

  if (!isSmtpConfigured()) {
    log.info('Verification email (console fallback)', { to: opts.to, link });
    return;
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: opts.to,
      subject: 'Activez votre compte Genova AI',
      html: buildEmailTemplate({
        title: 'Activez votre compte',
        preheader: 'Bienvenue sur Genova AI — cliquez pour activer votre compte.',
        body: `
          <p>Bonjour <strong>${escapeHtml(opts.name)}</strong>,</p>
          <p>Merci de vous être inscrit sur <strong>Genova AI OS</strong>. Cliquez sur le bouton ci-dessous pour activer votre compte.</p>
          <p>Ce lien expire dans <strong>24 heures</strong>.</p>
        `,
        ctaText: 'Activer mon compte',
        ctaLink: link,
        footerNote: "Si vous n'avez pas créé de compte, ignorez cet email.",
      }),
    });
    log.info('Verification email sent', { to: opts.to });
  } catch (err) {
    log.error('Failed to send verification email', {
      err: err instanceof Error ? err.message : 'Unknown',
      to: opts.to,
    });
  }
}

// ─── PASSWORD RESET EMAIL ─────────────────────────────────────────────────────

export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  token: string;
}): Promise<void> {
  const link = `${BASE_URL}/reset-password?token=${opts.token}`;

  if (!isSmtpConfigured()) {
    log.info('Password reset email (console fallback)', { to: opts.to, link });
    return;
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: opts.to,
      subject: 'Réinitialisation de votre mot de passe Genova AI',
      html: buildEmailTemplate({
        title: 'Réinitialiser votre mot de passe',
        preheader: 'Vous avez demandé une réinitialisation de mot de passe.',
        body: `
          <p>Bonjour <strong>${escapeHtml(opts.name)}</strong>,</p>
          <p>Vous avez demandé la réinitialisation de votre mot de passe <strong>Genova AI OS</strong>.</p>
          <p>Cliquez sur le bouton ci-dessous. Ce lien expire dans <strong>1 heure</strong>.</p>
        `,
        ctaText: 'Réinitialiser mon mot de passe',
        ctaLink: link,
        footerNote: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email. Votre mot de passe restera inchangé.",
      }),
    });
    log.info('Password reset email sent', { to: opts.to });
  } catch (err) {
    log.error('Failed to send password reset email', {
      err: err instanceof Error ? err.message : 'Unknown',
      to: opts.to,
    });
  }
}

// ─── HTML TEMPLATE ────────────────────────────────────────────────────────────

function buildEmailTemplate(opts: {
  title: string;
  preheader: string;
  body: string;
  ctaText: string;
  ctaLink: string;
  footerNote: string;
}): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${opts.title}</title>
  <span style="display:none;max-height:0;overflow:hidden;">${opts.preheader}</span>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#1e293b;border-radius:16px;border:1px solid #334155;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:32px;text-align:center;border-bottom:1px solid #334155;background:linear-gradient(135deg,#0f172a,#1e293b);">
              <div style="display:inline-flex;align-items:center;gap:8px;">
                <div style="width:36px;height:36px;background:linear-gradient(135deg,#06b6d4,#3b82f6);border-radius:10px;display:inline-block;"></div>
                <span style="font-size:20px;font-weight:700;color:#f1f5f9;letter-spacing:-0.5px;">Genova</span>
                <span style="font-size:10px;color:#22d3ee;font-weight:600;letter-spacing:3px;text-transform:uppercase;">AI OS</span>
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 32px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f1f5f9;">${opts.title}</h1>
              <div style="font-size:15px;line-height:1.6;color:#94a3b8;">${opts.body}</div>

              <!-- CTA -->
              <div style="margin:32px 0;text-align:center;">
                <a href="${opts.ctaLink}"
                   style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#ffffff;font-weight:600;font-size:15px;border-radius:12px;text-decoration:none;letter-spacing:0.2px;">
                  ${opts.ctaText}
                </a>
              </div>

              <!-- Fallback link -->
              <p style="font-size:12px;color:#475569;margin:0;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>
                <a href="${opts.ctaLink}" style="color:#22d3ee;word-break:break-all;">${opts.ctaLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #334155;background:#0f172a;">
              <p style="margin:0;font-size:12px;color:#475569;line-height:1.5;">${opts.footerNote}</p>
              <p style="margin:8px 0 0;font-size:11px;color:#334155;">© ${new Date().getFullYear()} Genova AI. Tous droits réservés.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return str.replace(/[&<>"']/g, (c) => entities[c] ?? c);
}
