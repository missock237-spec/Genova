'use client';

import { useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/store';
import { apiFetch, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, Lock, UserIcon, Loader2, ArrowLeft, KeyRound, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { GenovaLogo } from '@/components/ui/genova-logo';
import { useToast } from '@/hooks/use-toast';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthForm() {
  const [activeTab, setActiveTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuthStore();
  const { toast } = useToast();

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [forgotForm, setForgotForm] = useState({ email: '' });
  const [resetForm, setResetForm] = useState({ email: '', code: '', newPassword: '', confirmPassword: '' });

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.email || !loginForm.password) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs', variant: 'destructive' });
      return;
    }
    if (!EMAIL_REGEX.test(loginForm.email.trim())) {
      toast({ title: 'Erreur', description: 'Veuillez entrer un email valide', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch<{ id: string; email: string; name: string; plan: string; avatar?: string | null; role: string; emailVerified?: boolean }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: loginForm.email.trim().toLowerCase(),
          password: loginForm.password,
        }),
      });

      login({
        id: data.id,
        email: data.email,
        name: data.name,
        plan: data.plan,
        avatar: data.avatar,
        role: data.role,
        emailVerified: data.emailVerified ?? false,
      });
      toast({ title: 'Bienvenue !', description: `Connecte en tant que ${data.name}` });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          toast({ title: 'Trop de tentatives', description: 'Veuillez patienter quelques secondes avant de reessayer.', variant: 'destructive' });
        } else if (err.status === 401) {
          toast({ title: 'Identifiants invalides', description: 'Email ou mot de passe incorrect.', variant: 'destructive' });
        } else {
          toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
        }
      } else {
        toast({ title: 'Erreur', description: 'Erreur de connexion au serveur', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  }, [loginForm, login, toast]);

  const handleRegister = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.name.trim() || !registerForm.email.trim() || !registerForm.password) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs', variant: 'destructive' });
      return;
    }
    if (!EMAIL_REGEX.test(registerForm.email.trim())) {
      toast({ title: 'Erreur', description: 'Veuillez entrer un email valide', variant: 'destructive' });
      return;
    }
    if (registerForm.password.length < 8) {
      toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins 8 caracteres', variant: 'destructive' });
      return;
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      toast({ title: 'Erreur', description: 'Les mots de passe ne correspondent pas', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch<{ id: string; email: string; name: string; plan: string; avatar?: string | null; role: string; emailVerified?: boolean }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: registerForm.name.trim(),
          email: registerForm.email.trim().toLowerCase(),
          password: registerForm.password,
        }),
      });

      login({
        id: data.id,
        email: data.email,
        name: data.name,
        plan: data.plan,
        avatar: data.avatar,
        role: data.role,
        emailVerified: data.emailVerified ?? false,
      });
      toast({ title: 'Compte cree !', description: `Bienvenue ${data.name}`, variant: 'default' });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          toast({ title: 'Email deja utilise', description: 'Un compte avec cet email existe deja.', variant: 'destructive' });
        } else if (err.status === 429) {
          toast({ title: 'Trop de tentatives', description: 'Veuillez patienter quelques secondes avant de reessayer.', variant: 'destructive' });
        } else {
          toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
        }
      } else {
        toast({ title: 'Erreur', description: 'Erreur de connexion au serveur', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  }, [registerForm, login, toast]);

  const handleForgotPassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotForm.email.trim()) {
      toast({ title: 'Erreur', description: 'Veuillez entrer votre email', variant: 'destructive' });
      return;
    }
    if (!EMAIL_REGEX.test(forgotForm.email.trim())) {
      toast({ title: 'Erreur', description: 'Veuillez entrer un email valide', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      await apiFetch<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotForm.email.trim().toLowerCase() }),
      });

      toast({
        title: 'Code envoye',
        description: 'Si un compte existe avec cet email, un code de verification a ete envoye.',
      });
      setResetForm((prev) => ({ ...prev, email: forgotForm.email.trim().toLowerCase() }));
      setActiveTab('reset');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        toast({ title: 'Trop de tentatives', description: 'Veuillez patienter avant de renvoyer un code.', variant: 'destructive' });
      } else {
        // Always show success-like message to prevent email enumeration
        toast({
          title: 'Code envoye',
          description: 'Si un compte existe avec cet email, un code de verification a ete envoye.',
        });
        setResetForm((prev) => ({ ...prev, email: forgotForm.email.trim().toLowerCase() }));
        setActiveTab('reset');
      }
    } finally {
      setLoading(false);
    }
  }, [forgotForm, toast]);

  const handleResetPassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetForm.email.trim() || !resetForm.code.trim() || !resetForm.newPassword) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs', variant: 'destructive' });
      return;
    }
    if (resetForm.newPassword.length < 8) {
      toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins 8 caracteres', variant: 'destructive' });
      return;
    }
    if (resetForm.newPassword !== resetForm.confirmPassword) {
      toast({ title: 'Erreur', description: 'Les mots de passe ne correspondent pas', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: resetForm.email.trim().toLowerCase(),
          code: resetForm.code.trim(),
          newPassword: resetForm.newPassword,
        }),
      });

      toast({
        title: 'Mot de passe reinitialise',
        description: 'Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.',
      });
      setActiveTab('login');
      setLoginForm((prev) => ({ ...prev, email: resetForm.email.trim().toLowerCase() }));
      setResetForm({ email: '', code: '', newPassword: '', confirmPassword: '' });
      setForgotForm({ email: '' });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          toast({ title: 'Trop de tentatives', description: 'Le code a ete invalide apres trop d\'essais. Veuillez demander un nouveau code.', variant: 'destructive' });
        } else {
          toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
        }
      } else {
        toast({ title: 'Erreur', description: 'Erreur lors de la reinitialisation', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  }, [resetForm, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-bg grid-pattern">
      <div className="w-full max-w-md">
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <GenovaLogo size="lg" showText={activeTab === 'register'} />
          </div>
          {activeTab !== 'register' && (
            <>
              <h1 className="text-3xl font-bold tracking-tight">
                genova<span className="text-primary">.Ia</span>
              </h1>
              <p className="text-muted-foreground mt-1">Système d&apos;exploitation pour agents IA</p>
            </>
          )}
        </div>

        <Card className="border-border/50 agent-glow">
          <CardHeader className="pb-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Connexion</TabsTrigger>
                <TabsTrigger value="register">Inscription</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              {/* Login Tab */}
              <TabsContent value="login">
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
                        autoComplete="email"
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="********"
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                        className="pl-10 pr-10"
                        autoComplete="current-password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Se connecter
                  </Button>
                  <div className="text-center">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                      onClick={() => setActiveTab('forgot')}
                    >
                      Mot de passe oublie ?
                    </button>
                  </div>
                </form>
              </TabsContent>

              {/* Register Tab */}
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name">Nom</Label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-name"
                        placeholder="Votre nom"
                        value={registerForm.name}
                        onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                        className="pl-10"
                        autoComplete="name"
                        disabled={loading}
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
                        autoComplete="email"
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Min. 8 caracteres"
                        value={registerForm.password}
                        onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                        className="pl-10 pr-10"
                        autoComplete="new-password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-confirm">Confirmer le mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-confirm"
                        type="password"
                        placeholder="********"
                        value={registerForm.confirmPassword}
                        onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                        className="pl-10"
                        autoComplete="new-password"
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Creer un compte
                  </Button>
                </form>
              </TabsContent>

              {/* Forgot Password Tab */}
              <TabsContent value="forgot">
                <div className="mb-4">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                    onClick={() => setActiveTab('login')}
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Retour a la connexion
                  </button>
                </div>
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center p-3 rounded-xl bg-primary/10 mb-3">
                    <KeyRound className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">Mot de passe oublie</CardTitle>
                  <CardDescription className="mt-1">
                    Entrez votre email pour recevoir un code de verification
                  </CardDescription>
                </div>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="votre@email.com"
                        value={forgotForm.email}
                        onChange={(e) => setForgotForm({ email: e.target.value })}
                        className="pl-10"
                        autoComplete="email"
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Envoyer le code
                  </Button>
                </form>
              </TabsContent>

              {/* Reset Password Tab */}
              <TabsContent value="reset">
                <div className="mb-4">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                    onClick={() => setActiveTab('forgot')}
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Renvoyer le code
                  </button>
                </div>
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center p-3 rounded-xl bg-primary/10 mb-3">
                    <ShieldCheck className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">Nouveau mot de passe</CardTitle>
                  <CardDescription className="mt-1">
                    Entrez le code recu par email et votre nouveau mot de passe
                  </CardDescription>
                </div>
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="votre@email.com"
                        value={resetForm.email}
                        onChange={(e) => setResetForm({ ...resetForm, email: e.target.value })}
                        className="pl-10"
                        autoComplete="email"
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-code">Code de verification</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reset-code"
                        type="text"
                        placeholder="000000"
                        value={resetForm.code}
                        onChange={(e) => setResetForm({ ...resetForm, code: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                        className="pl-10 tracking-widest text-center"
                        maxLength={6}
                        inputMode="numeric"
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-password">Nouveau mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reset-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Min. 8 caracteres"
                        value={resetForm.newPassword}
                        onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })}
                        className="pl-10 pr-10"
                        autoComplete="new-password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-confirm">Confirmer le mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reset-confirm"
                        type="password"
                        placeholder="********"
                        value={resetForm.confirmPassword}
                        onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })}
                        className="pl-10"
                        autoComplete="new-password"
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Reinitialiser le mot de passe
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          En vous inscrivant, vous acceptez nos conditions d&apos;utilisation
        </p>
      </div>
    </div>
  );
}
