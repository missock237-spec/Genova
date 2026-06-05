/**
 * GENOVA AI OS — Forgot Password Form
 * Email input with success state showing cooldown timer.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { AuthLayout } from './auth-layout';
import { InputField, Alert, AuthButton, Mail, ArrowLeft } from './shared';

function validateEmail(email: string): string | null {
  if (!email) return "L'adresse email est requise";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Adresse email invalide';
  return null;
}

export function ForgotPasswordForm() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [apiError, setApiError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = useCallback(() => {
    setCooldown(60);
    timerRef.current = setInterval(() => {
      setCooldown(c => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const err = validateEmail(email);
    if (err) { setEmailErr(err); return; }
    setEmailErr('');
    setApiError('');
    setLoading(true);

    try {
      await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      // Always show success to prevent email enumeration
      setSuccess(true);
      startCooldown();
    } catch {
      setApiError('Erreur réseau. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthLayout title="Email envoyé" subtitle="Vérifiez votre boîte de réception">
        <div className="text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-emerald-400" />
          </div>
          <div className="space-y-2">
            <p className="text-slate-300 text-sm">
              Si un compte existe pour <span className="text-cyan-400 font-medium">{email}</span>, vous recevrez un lien de réinitialisation dans quelques minutes.
            </p>
            <p className="text-slate-500 text-xs">
              Pensez à vérifier vos spams.
            </p>
          </div>
          <div className="space-y-3">
            {cooldown > 0 ? (
              <p className="text-xs text-slate-500">
                Renvoyer dans <span className="text-cyan-400 font-mono">{cooldown}s</span>
              </p>
            ) : (
              <button
                onClick={() => { setSuccess(false); }}
                className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
              >
                Renvoyer l&apos;email
              </button>
            )}
            <button
              onClick={() => router.push('/login')}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors mx-auto"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour à la connexion
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Mot de passe oublié" subtitle="Nous vous enverrons un lien de réinitialisation">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Alert type="error" message={apiError} />

        <InputField
          label="Adresse email"
          id="forgot-email"
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setEmailErr(''); setApiError(''); }}
          error={emailErr}
          icon={<Mail className="w-4 h-4" />}
          placeholder="vous@exemple.com"
          autoComplete="email"
          disabled={loading}
        />

        <AuthButton type="submit" loading={loading}>
          Envoyer le lien de réinitialisation
        </AuthButton>

        <button
          type="button"
          onClick={() => router.push('/login')}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors mx-auto w-full justify-center mt-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour à la connexion
        </button>
      </form>
    </AuthLayout>
  );
}
