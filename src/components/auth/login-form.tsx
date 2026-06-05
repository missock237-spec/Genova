/**
 * GENOVA AI OS — Login Form
 * Email + password login with rememberMe and forgot password link.
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { apiFetch, ApiError } from '@/lib/api';
import { AuthLayout } from './auth-layout';
import { InputField, PasswordInput, Alert, AuthButton, Mail, UserIcon } from './shared';

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuthStore();

  const [form, setForm] = useState({ email: '', password: '', remember: false });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
    if (errors[field]) setErrors(er => ({ ...er, [field]: null }));
    setApiError('');
  };

  const validate = () => {
    const e: Record<string, string | null> = {};
    if (!form.email) e.email = "L'adresse email est requise";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Adresse email invalide';
    if (!form.password) e.password = 'Le mot de passe est requis';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = useCallback(async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setApiError('');

    try {
      const data = await apiFetch<{ user: { id: string; email: string; name: string; role: string; plan: string; avatar?: string | null; isEmailVerified: boolean; isActive: boolean } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email.toLowerCase().trim(),
          password: form.password,
          rememberMe: form.remember,
        }),
      });

      const user = data.user;
      login({
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan || 'free',
        avatar: user.avatar,
        role: user.role || 'user',
        emailVerified: user.isEmailVerified ?? false,
        isEmailVerified: user.isEmailVerified,
        isActive: user.isActive,
      });

      // Redirect to dashboard
      router.push('/');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setApiError(err.message);
        } else if (err.status === 429) {
          setApiError('Trop de tentatives. Réessayez dans 15 minutes.');
        } else {
          setApiError('Identifiants invalides');
        }
      } else {
        setApiError('Erreur réseau. Veuillez réessayer.');
      }
    } finally {
      setLoading(false);
    }
  }, [form, login, router]);

  return (
    <AuthLayout title="Bon retour" subtitle="Connectez-vous à votre espace Genova">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Alert type="error" message={apiError} />

        <InputField
          label="Adresse email"
          id="login-email"
          type="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
          icon={<Mail className="w-4 h-4" />}
          placeholder="vous@exemple.com"
          autoComplete="email"
          disabled={loading}
        />

        <PasswordInput
          label="Mot de passe"
          id="login-password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          placeholder="••••••••"
          autoComplete="current-password"
          disabled={loading}
        />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.remember}
              onChange={set('remember')}
              className="w-4 h-4 rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50 focus:ring-offset-slate-950"
            />
            <span className="text-xs text-slate-400">Se souvenir de moi</span>
          </label>
          <button
            type="button"
            onClick={() => router.push('/forgot-password')}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
          >
            Mot de passe oublié ?
          </button>
        </div>

        <AuthButton type="submit" loading={loading}>
          Se connecter
        </AuthButton>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        Pas encore de compte ?{' '}
        <button onClick={() => router.push('/register')} className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
          Créer un compte
        </button>
      </p>
    </AuthLayout>
  );
}
