/**
 * GENOVA AI OS — Register Form
 * Name + email + password + confirm password with strength indicator.
 * Supporte deux modes :
 *   1. Firebase (config present) : Firebase Client SDK -> idToken -> POST serveur
 *   2. Standalone (pas de Firebase) : POST direct email/password au serveur
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { AuthLayout } from './auth-layout';
import { InputField, PasswordInput, PasswordStrengthIndicator, Alert, AuthButton, Mail, UserIcon, OAuthButtons, getStrength, PASSWORD_RULES } from './shared';
import { useOAuthRedirect } from '@/hooks/use-oauth-redirect';

function validateEmail(email: string): string | null {
  if (!email) return "L'adresse email est requise";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Adresse email invalide';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return 'Le mot de passe est requis';
  for (const rule of PASSWORD_RULES) {
    if (!rule.regex.test(password)) return `Regle non respectee : ${rule.label}`;
  }
  return null;
}

function validateName(name: string): string | null {
  if (!name || name.trim().length < 2) return 'Minimum 2 caracteres requis';
  if (name.trim().length > 50) return 'Maximum 50 caracteres';
  return null;
}

/**
 * Detecte si Firebase est configure cote client.
 * On verifie si les 4 variables NEXT_PUBLIC_* sont presentes.
 */
function isFirebaseAvailable(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [useFirebase, setUseFirebase] = useState(true);

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', terms: false });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  // Detecte la disponibilite de Firebase au montage
  useEffect(() => {
    setUseFirebase(isFirebaseAvailable());
  }, []);

  // Capture le resultat OAuth redirect (mobile) — uniquement si Firebase
  useOAuthRedirect({ onError: (msg) => setApiError(msg) });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
    if (errors[field]) setErrors(er => ({ ...er, [field]: null }));
    setApiError('');
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

    try {
      if (useFirebase) {
        // === MODE FIREBASE (avec fallback standalone) ===
        try {
          const { signUpWithEmail } = await import('@/lib/firebase/auth-client');
          const authResult = await signUpWithEmail(form.email, form.password, form.name.trim());

          await apiFetch('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
              idToken: authResult.idToken,
              name: form.name.trim(),
              email: form.email.toLowerCase().trim(),
            }),
          });
        } catch (firebaseErr: any) {
          // Si Firebase client échoue, fallback vers standalone
          console.warn('[register] Firebase client failed, falling back to standalone:',
            firebaseErr?.code || firebaseErr?.message);
          setUseFirebase(false);
          await apiFetch('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
              email: form.email.toLowerCase().trim(),
              password: form.password,
              name: form.name.trim(),
            }),
          });
        }
      } else {
        // === MODE STANDALONE ===
        await apiFetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email: form.email.toLowerCase().trim(),
            password: form.password,
            name: form.name.trim(),
          }),
        });
      }

      // Succes : le serveur a pose le cookie de session.
      window.location.href = '/';
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setApiError('Cet email est deja utilise.');
        else if (err.status === 403) setApiError(err.message || 'Acces refuse.');
        else if (err.status === 429) setApiError('Trop de tentatives. Reessayez dans 15 minutes.');
        else if (err.status === 503) {
          console.error('[register] Session cookie failed:', err.message);
          setApiError('Erreur de session. Veuillez recharger la page et reessayer.');
        } else if (err.status === 500) {
          console.error('[register] Server error:', err.message);
          setApiError('Erreur serveur temporaire. Veuillez reessayer dans un instant.');
        } else setApiError(err.message || "Erreur lors de l'inscription");
      } else if (err && typeof err === 'object' && 'code' in err) {
        const firebaseErr = err as { code: string; message?: string };
        const code = firebaseErr.code;
        console.error('[register] Firebase error:', code, firebaseErr.message);

        const firebaseErrorMap: Record<string, string> = {
          'auth/email-already-in-use': 'Cet email est deja utilise.',
          'auth/weak-password': 'Mot de passe trop faible.',
          'auth/invalid-email': "Format d'email invalide.",
          'auth/invalid-credential': 'Identifiants invalides.',
          'auth/configuration-not-found': 'Erreur de configuration Firebase. Contactez l\'administrateur.',
          'auth/invalid-api-key': 'Erreur de configuration. Contactez l\'administrateur.',
          'auth/app-not-authorized': 'Application non autorisee. Contactez l\'administrateur.',
          'auth/operation-not-allowed': 'La connexion par email/mot de passe n\'est pas activee.',
          'auth/network-request-failed': 'Erreur reseau. Verifiez votre connexion internet.',
          'auth/too-many-requests': 'Trop de tentatives. Reessayez plus tard.',
          'auth/internal-error': 'Erreur interne. Veuillez reessayer.',
        };

        const mappedMessage = firebaseErrorMap[code];
        if (mappedMessage) {
          setApiError(mappedMessage);
        } else {
          console.error('[register] Unhandled Firebase error code:', code, firebaseErr);
          setApiError('Erreur lors de la creation du compte. Si le probleme persiste, contactez le support.');
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[register] Unexpected error:', msg);
        setApiError('Erreur reseau. Veuillez reessayer.');
      }
    } finally {
      setLoading(false);
    }
  }, [form, useFirebase]);

  const strength = getStrength(form.password);
  const passwordOk = strength === 5;

  return (
    <AuthLayout title="Creer un compte" subtitle="Rejoignez la plateforme Genova AI OS">
      {/* OAuth — uniquement si Firebase est configure */}
      {useFirebase && (
        <div className="space-y-3">
          <OAuthButtons
            mode="register"
            disabled={loading}
            onError={(msg) => setApiError(msg)}
            onSuccess={() => {
              window.location.href = '/';
            }}
          />
          <div className="flex items-center gap-3 my-4">
            <div className="h-px flex-1 bg-slate-700/40"></div>
            <span className="text-xs text-slate-500 uppercase tracking-wider">ou</span>
            <div className="h-px flex-1 bg-slate-700/40"></div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Alert type="error" message={apiError} />

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
            placeholder="Creez un mot de passe fort"
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
          placeholder="Repetez votre mot de passe"
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
            <a href="/privacy" target="_blank" className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">politique de confidentialite</a>
          </span>
        </label>
        {errors.terms && <p className="text-xs text-red-400 -mt-2">{errors.terms}</p>}

        <AuthButton type="submit" loading={loading} disabled={!passwordOk && form.password.length > 0}>
          Creer mon compte
        </AuthButton>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        Pas encore de compte ?{' '}
        <button onClick={() => router.push('/login')} className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
          Se connecter
        </button>
      </p>
    </AuthLayout>
  );
}