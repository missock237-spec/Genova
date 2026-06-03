/**
 * GENOVA AI OS — Register Form
 * Name + email + password + confirm password with strength indicator.
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { AuthLayout } from './auth-layout';
import { InputField, PasswordInput, PasswordStrengthIndicator, Alert, AuthButton, Mail, UserIcon, getStrength, PASSWORD_RULES } from './shared';

function validateEmail(email: string): string | null {
  if (!email) return "L'adresse email est requise";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Adresse email invalide';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return 'Le mot de passe est requis';
  for (const rule of PASSWORD_RULES) {
    if (!rule.regex.test(password)) return `Règle non respectée : ${rule.label}`;
  }
  return null;
}

function validateName(name: string): string | null {
  if (!name || name.trim().length < 2) return 'Minimum 2 caractères requis';
  if (name.trim().length > 50) return 'Maximum 50 caractères';
  return null;
}

export function RegisterForm() {
  const router = useRouter();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', terms: false });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [apiError, setApiError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
    if (errors[field]) setErrors(er => ({ ...er, [field]: null }));
    setApiError('');
    setSuccess('');
  };

  const validate = () => {
    const e: Record<string, string | null> = {};
    const nameErr = validateName(form.name);
    if (nameErr) e.name = nameErr;
    const emailErr = validateEmail(form.email);
    if (emailErr) e.email = emailErr;
    const pwErr = validatePassword(form.password);
    if (pwErr) e.password = pwErr;
    if (!form.confirm) e.confirm = 'Veuillez confirmer votre mot de passe';
    else if (form.password !== form.confirm) e.confirm = 'Les mots de passe ne correspondent pas';
    if (!form.terms) e.terms = "Vous devez accepter les conditions d'utilisation";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = useCallback(async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setApiError('');
    setSuccess('');

    try {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.toLowerCase().trim(),
          password: form.password,
          confirmPassword: form.confirm,
        }),
      });

      setSuccess('Compte créé ! Vérifiez votre email pour activer votre compte.');
      setForm({ name: '', email: '', password: '', confirm: '', terms: false });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setApiError('Trop de tentatives. Réessayez dans 15 minutes.');
        } else {
          setApiError(err.message || "Erreur lors de l'inscription");
        }
      } else {
        setApiError('Erreur réseau. Veuillez réessayer.');
      }
    } finally {
      setLoading(false);
    }
  }, [form]);

  const strength = getStrength(form.password);
  const passwordOk = strength === 5;

  return (
    <AuthLayout title="Créer un compte" subtitle="Rejoignez la plateforme Genova AI OS">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Alert type="error" message={apiError} />
        <Alert type="success" message={success} />

        <InputField
          label="Nom complet"
          id="reg-name"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
          icon={<UserIcon className="w-4 h-4" />}
          placeholder="Jean Dupont"
          autoComplete="name"
          disabled={loading}
        />

        <InputField
          label="Adresse email"
          id="reg-email"
          type="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
          icon={<Mail className="w-4 h-4" />}
          placeholder="vous@exemple.com"
          autoComplete="email"
          disabled={loading}
        />

        <div className="space-y-2">
          <PasswordInput
            label="Mot de passe"
            id="reg-password"
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
          id="reg-confirm"
          value={form.confirm}
          onChange={set('confirm')}
          error={errors.confirm}
          placeholder="Répétez votre mot de passe"
          autoComplete="new-password"
          disabled={loading}
        />

        <label className="flex items-start gap-3 cursor-pointer select-none group">
          <input
            type="checkbox"
            checked={form.terms}
            onChange={set('terms')}
            className="mt-0.5 w-4 h-4 rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50 flex-shrink-0"
          />
          <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">
            J&apos;accepte les{' '}
            <a href="/terms" target="_blank" className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">conditions d&apos;utilisation</a>
            {' '}et la{' '}
            <a href="/privacy" target="_blank" className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">politique de confidentialité</a>
          </span>
        </label>
        {errors.terms && <p className="text-xs text-red-400 -mt-2">{errors.terms}</p>}

        <AuthButton type="submit" loading={loading} disabled={!passwordOk && form.password.length > 0}>
          Créer mon compte
        </AuthButton>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        Déjà un compte ?{' '}
        <button onClick={() => router.push('/login')} className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
          Se connecter
        </button>
      </p>
    </AuthLayout>
  );
}
