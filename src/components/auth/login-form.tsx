/**
 * GEN3IA OS — Login Form
 * Email + password login with rememberMe and forgot password link.
 * Supporte deux modes :
 *   1. Firebase (config present) : Firebase Client SDK -> idToken -> POST serveur
 *   2. Standalone (pas de Firebase) : POST direct email/password au serveur
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { AuthLayout } from './auth-layout';
import { InputField, PasswordInput, Alert, AuthButton, Mail, OAuthButtons } from './shared';
import { useOAuthRedirect } from '@/hooks/use-oauth-redirect';

/**
 * Detecte si Firebase est configure cote client.
 */
function isFirebaseAvailable(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  );
}

export function LoginForm() {
  const router = useRouter();
  const [useFirebase, setUseFirebase] = useState(true);

  const [form, setForm] = useState({ email: '', password: '', remember: false });
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
      if (useFirebase) {
        // === MODE FIREBASE ===
        const { signInWithEmail } = await import('@/lib/firebase/auth-client');
        const authResult = await signInWithEmail(form.email, form.password);

        await apiFetch<{ user: { id: string; email: string; name: string; role: string; plan: string; avatar?: string | null; emailVerified: boolean } }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ idToken: authResult.idToken, rememberMe: form.remember }),
          timeoutMs: 30_000,
        });
      } else {
        // === MODE STANDALONE (sans Firebase) ===
        await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: form.email.toLowerCase().trim(),
            password: form.password,
            rememberMe: form.remember,
          }),
        });
      }

      // Succes : le serveur a pose le cookie de session.
      window.location.href = '/';
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setApiError('Identifiants invalides. Verifiez votre email et mot de passe.');
        } else if (err.status === 403) {
          setApiError(err.message || 'Acces refuse.');
        } else if (err.status === 429) {
          setApiError('Trop de tentatives. Reessayez dans 15 minutes.');
        } else if (err.status === 503) {
          console.error('[login] Session cookie failed:', err.message);
          setApiError('Erreur de session. Veuillez recharger la page et reessayer.');
        } else if (err.status === 500) {
          console.error('[login] Server error:', err.message);
          setApiError('Erreur serveur temporaire. Veuillez reessayer dans un instant.');
        } else {
          setApiError(err.message || 'Identifiants invalides');
        }
      } else if (err && typeof err === 'object' && 'code' in err) {
        const firebaseErr = err as { code: string; message?: string };
        const code = firebaseErr.code;
        console.error('[login] Firebase error:', code, firebaseErr.message);

        const firebaseErrorMap: Record<string, string> = {
          'auth/invalid-credential': 'Identifiants invalides. Verifiez votre email et mot de passe.',
          'auth/wrong-password': 'Mot de passe incorrect.',
          'auth/user-not-found': 'Aucun compte trouve avec cet email.',
          'auth/user-disabled': 'Ce compte a ete desactive. Contactez le support.',
          'auth/too-many-requests': 'Trop de tentatives. Reessayez plus tard ou reinitialisez votre mot de passe.',
          'auth/email-not-verified': 'Email non verifie. Consultez votre boite mail pour le lien de verification.',
          'auth/configuration-not-found': 'Erreur de configuration Firebase. Contactez l\'administrateur.',
          'auth/invalid-api-key': 'Erreur de configuration. Contactez l\'administrateur.',
          'auth/app-not-authorized': 'Application non autorisee. Contactez l\'administrateur.',
          'auth/invalid-tenant-id': 'Erreur de configuration multi-tenant. Contactez l\'administrateur.',
          'auth/unauthorized-domain': "Ce domaine n'est pas autorise pour la connexion.",
          'auth/operation-not-allowed': 'La connexion par email/mot de passe n\'est pas activee.',
          'auth/network-request-failed': 'Erreur reseau. Verifiez votre connexion internet.',
          'auth/internal-error': 'Erreur interne. Veuillez reessayer.',
          'auth/invalid-email': "Format d'email invalide.",
        };

        const mappedMessage = firebaseErrorMap[code];
        if (mappedMessage) {
          setApiError(mappedMessage);
        } else {
          console.error('[login] Unhandled Firebase error code:', code, firebaseErr);
          setApiError('Erreur de connexion. Si le probleme persiste, contactez le support.');
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[login] Unexpected error:', msg, err);
        setApiError(`Erreur reseau. Veuillez reessayer. (${msg.slice(0, 80)})`);
      }
    } finally {
      setLoading(false);
    }
  }, [form, useFirebase]);

  return (
    <AuthLayout title="Bon retour" subtitle="Connectez-vous a votre espace Genova">
      {/* OAuth — uniquement si Firebase est configure */}
      {useFirebase && (
        <div className="space-y-3">
          <OAuthButtons
            mode="login"
            disabled={loading}
            onError={(msg) => setApiError(msg)}
            onSuccess={async () => {
              await new Promise(resolve => setTimeout(resolve, 500));
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
          placeholder="........."
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
            Mot de passe oublie ?
          </button>
        </div>

        <AuthButton type="submit" loading={loading}>
          Se connecter
        </AuthButton>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        Pas encore de compte ?{' '}
        <button onClick={() => router.push('/register')} className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
          Creer un compte
        </button>
      </p>
    </AuthLayout>
  );
}