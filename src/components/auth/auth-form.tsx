'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Cpu, Mail, Lock, User, Loader2, ArrowLeft, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

type AuthTab = 'login' | 'register' | 'forgot' | 'reset';

export function AuthForm() {
  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const { toast } = useToast();

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetForm, setResetForm] = useState({ email: '', code: '', newPassword: '', confirmPassword: '' });
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.email || !loginForm.password) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        json: loginForm,
      });
      const data = await res.json();

      if (!res.ok) {
        toast({ title: 'Erreur', description: data.error, variant: 'destructive' });
        return;
      }

      // Token is now in httpOnly cookie — no need to store it
      login(data);
      toast({ title: 'Bienvenue !', description: `Connecté en tant que ${data.name}` });
    } catch {
      toast({ title: 'Erreur', description: 'Erreur de connexion au serveur', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.name || !registerForm.email || !registerForm.password) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs', variant: 'destructive' });
      return;
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      toast({ title: 'Erreur', description: 'Les mots de passe ne correspondent pas', variant: 'destructive' });
      return;
    }
    if (registerForm.password.length < 8) {
      toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins 8 caractères', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        json: {
          name: registerForm.name,
          email: registerForm.email,
          password: registerForm.password,
        },
      });
      const data = await res.json();

      if (!res.ok) {
        toast({ title: 'Erreur', description: data.error, variant: 'destructive' });
        return;
      }

      // Token is now in httpOnly cookie
      login(data);
      toast({ title: 'Compte créé !', description: `Bienvenue ${data.name}` });
    } catch {
      toast({ title: 'Erreur', description: 'Erreur de connexion au serveur', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      toast({ title: 'Erreur', description: 'Veuillez saisir votre email', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        json: { email: forgotEmail },
      });
      const data = await res.json();

      if (!res.ok) {
        toast({ title: 'Erreur', description: data.error, variant: 'destructive' });
        return;
      }

      setResetEmailSent(true);
      setResetForm(prev => ({ ...prev, email: forgotEmail }));
      toast({ title: 'Code envoyé', description: 'Vérifiez votre boîte mail pour le code de validation' });
    } catch {
      toast({ title: 'Erreur', description: 'Erreur de connexion au serveur', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetForm.code || !resetForm.newPassword || !resetForm.confirmPassword) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs', variant: 'destructive' });
      return;
    }
    if (resetForm.newPassword !== resetForm.confirmPassword) {
      toast({ title: 'Erreur', description: 'Les mots de passe ne correspondent pas', variant: 'destructive' });
      return;
    }
    if (resetForm.newPassword.length < 8) {
      toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins 8 caractères', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        json: {
          email: resetForm.email,
          code: resetForm.code,
          newPassword: resetForm.newPassword,
        },
      });
      const data = await res.json();

      if (!res.ok) {
        toast({ title: 'Erreur', description: data.error, variant: 'destructive' });
        return;
      }

      toast({ title: 'Mot de passe modifié', description: 'Vous pouvez maintenant vous connecter' });
      setActiveTab('login');
      setResetEmailSent(false);
      setResetForm({ email: '', code: '', newPassword: '', confirmPassword: '' });
    } catch {
      toast({ title: 'Erreur', description: 'Erreur de connexion au serveur', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-bg grid-pattern">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 rounded-2xl bg-primary/10 agent-glow mb-4">
            <Cpu className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Genova</h1>
          <p className="text-muted-foreground mt-1">AI Operating System — Créez, gérez et orchestrez vos agents IA</p>
        </div>

        <Card className="border-border/50 agent-glow">
          <CardHeader className="pb-4">
            {activeTab === 'login' || activeTab === 'register' ? (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AuthTab)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Connexion</TabsTrigger>
                  <TabsTrigger value="register">Inscription</TabsTrigger>
                </TabsList>
              </Tabs>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setActiveTab('login'); setResetEmailSent(false); }}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-base">
                  {activeTab === 'forgot' ? 'Mot de passe oublié' : 'Réinitialiser le mot de passe'}
                </CardTitle>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {/* LOGIN TAB */}
            {activeTab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="votre@email.com"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Mot de passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="link"
                    className="text-xs text-muted-foreground px-0 h-auto"
                    onClick={() => setActiveTab('forgot')}
                  >
                    Mot de passe oublié ?
                  </Button>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Se connecter
                </Button>
              </form>
            )}

            {/* REGISTER TAB */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="register-name">Nom</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="register-name"
                      placeholder="Votre nom"
                      value={registerForm.name}
                      onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="votre@email.com"
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">Mot de passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="register-password"
                      type="password"
                      placeholder="Min. 8 caractères, 1 majuscule, 1 chiffre"
                      value={registerForm.password}
                      onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-confirm">Confirmer le mot de passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="register-confirm"
                      type="password"
                      placeholder="••••••••"
                      value={registerForm.confirmPassword}
                      onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Créer un compte
                </Button>
              </form>
            )}

            {/* FORGOT PASSWORD TAB */}
            {activeTab === 'forgot' && !resetEmailSent && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="text-sm text-muted-foreground mb-4">
                  Entrez votre adresse email. Nous vous enverrons un code de validation pour réinitialiser votre mot de passe.
                </div>
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="votre@email.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="pl-10"
                      autoFocus
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Envoyer le code
                </Button>
              </form>
            )}

            {/* RESET PASSWORD TAB (after code sent) */}
            {activeTab === 'forgot' && resetEmailSent && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="text-sm text-muted-foreground mb-2">
                  Un code de validation a été envoyé à <span className="font-medium">{resetForm.email}</span>.
                  Entrez-le ci-dessous avec votre nouveau mot de passe.
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-code">Code de validation</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reset-code"
                      placeholder="123456"
                      value={resetForm.code}
                      onChange={(e) => setResetForm({ ...resetForm, code: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                      className="pl-10 text-center tracking-[0.5em] font-mono text-lg"
                      maxLength={6}
                      autoFocus
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-new-password">Nouveau mot de passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reset-new-password"
                      type="password"
                      placeholder="Min. 8 caractères, 1 majuscule, 1 chiffre"
                      value={resetForm.newPassword}
                      onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-confirm-password">Confirmer le mot de passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reset-confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={resetForm.confirmPassword}
                      onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Réinitialiser le mot de passe
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-xs"
                  onClick={handleForgotPassword}
                  disabled={loading}
                >
                  Renvoyer le code
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          En vous inscrivant, vous acceptez nos conditions d&apos;utilisation
        </p>
      </div>
    </div>
  );
}
