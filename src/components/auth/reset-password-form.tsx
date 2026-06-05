/**
 * GENOVA AI OS — Reset Password Form
 * Token from URL + new password + confirm with strength indicator.
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { AuthLayout } from './auth-layout';
import { PasswordInput, PasswordStrengthIndicator, Alert, AuthButton, ArrowLeft, Check, getStrength, PASSWORD_RULES } from './shared';

function validatePassword(password: string): string | null {
  if (!password) return 'Le mot de passe est requis';
  for (const rule of PASSWORD_RULES) {
    if (!rule.regex.test(password)) return `Règle non respectée : ${rule.label}`;
  }
  return null;
}

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [apiError, setApiError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    if (errors[field]) setErrors(er => ({ ...er, [field]: null }));
    setApiError('');
  };

  const validate = () => {
    const e: Record<string, string | null> = {};
    const pwErr = validatePassword(form.password);
    if (pwErr) e.password = pwErr;
    if (!form.confirm) e.confirm = 'Veuillez confirmer votre mot de passe';
    else if (form.password !== form.confirm) e.confirm = 'Les mots de passe ne correspondent pas';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = useCallback(async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setApiError('');

    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password: form.password, confirmPassword: form.confirm }),
      });
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError(err.message || 'Lien invalide ou expiré');
      } else {
        setApiError('Erreur réseau. Veuillez réessayer.');
      }
    } finally {
      setLoading(false);
    }
  }, [form, token]);

  if (success) {
    return (
      <AuthLayout title="Mot de passe modifié" subtitle="Votre mot de passe a été mis à jour">
        <div className="text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-emerald-400" />
          </div>
          <p className="text-slate-300 text-sm">
            Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.
          </p>
          <AuthButton onClick={() => router.push('/login')}>
            Se connecter
          </AuthButton>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Nouveau mot de passe" subtitle="Choisissez un mot de passe sécurisé">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Alert type="error" message={apiError} />

        <div className="space-y-2">
          <PasswordInput
            label="Nouveau mot de passe"
            id="reset-password"
            value={form.password}
            onChange={set('password')}
            error={errors.password}
            placeholder="Créez un mot de passe fort"
            autoComplete="new-password"
            disabled={loading}
          />
          {form.password && <PasswordStrengthIndicator password={form.password} />}
        </div>

        <PasswordInput
          label="Confirmer le mot de passe"
          id="reset-confirm"
          value={form.confirm}
          onChange={set('confirm')}
          error={errors.confirm}
          placeholder="Répétez votre mot de passe"
          autoComplete="new-password"
          disabled={loading}
        />

        <AuthButton type="submit" loading={loading}>
          Réinitialiser le mot de passe
        </AuthButton>
      </form>
    </AuthLayout>
  );
}
