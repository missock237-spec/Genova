'use client';

import React, { useState, useEffect } from 'react';
import { User, Shield, Bell, CreditCard, Key, Check, Moon, Sun, Monitor, Save, Eye, EyeOff, LogOut, Trash2, RefreshCw, Megaphone } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { AdPreferencesPanel } from '@/components/advertising/ad-preferences-panel';
import { ApiKeysManager } from '@/components/api-keys/api-keys-manager';

interface SettingsViewProps {
  initialTab?: string;
}

type TabId = 'profile' | 'security' | 'notifications' | 'billing' | 'api-keys' | 'approvals' | 'ads';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'profile', label: 'Profil', icon: User },
  { id: 'security', label: 'Sécurité', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'billing', label: 'Facturation', icon: CreditCard },
  { id: 'ads', label: 'Publicités', icon: Megaphone },
  { id: 'api-keys', label: 'Clés API', icon: Key },
  { id: 'approvals', label: 'Approbations', icon: Check },
];

export function SettingsView({ initialTab = 'profile' }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab as TabId);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [approvedApps, setApprovedApps] = useState<{id: string; name: string; scopes: string[]; date: string}[]>([]);

  useEffect(() => {
    // Charger le profil depuis l'API au montage
    const loadProfile = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setProfileName(data.user?.name || '');
          setProfileEmail(data.user?.email || '');
          setProfileBio(data.user?.bio || '');
          setTheme(data.user?.theme || 'system');
          setTwoFactorEnabled(data.user?.twoFactorEnabled || false);
        }
      } catch {}
    };
    loadProfile();
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: profileName, bio: profileBio, theme }),
      });
      // Appliquer le thème
      if (theme === 'dark') document.documentElement.classList.add('dark');
      else if (theme === 'light') document.documentElement.classList.remove('dark');
      else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', prefersDark);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('[settings] Save profile failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) return;
    if (newPassword.length < 8) return;
    setSaving(true);
    setSaved(false);
    try {
      // Verifier le mot de passe actuel via Firebase Client SDK
      const { signInWithEmail } = await import('@/lib/firebase/auth-client');
      const authResult = await signInWithEmail(profileEmail, currentPassword);

      // Appeler l'API de changement de mot de passe
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ idToken: authResult.idToken, newPassword }),
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      if (err instanceof ApiError) {
        console.error('[settings] Password change failed:', err.message);
      } else {
        // Erreur Firebase = mot de passe actuel incorrect
        console.error('[settings] Current password verification failed:', err);
      }
    } finally {
      setSaving(false);
    }
  };

  const revokeApp = (id: string) => {
    setApprovedApps(prev => prev.filter(a => a.id !== id));
  };

  const renderProfileTab = () => (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Informations du profil</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nom complet</label>
          <input
            type="text"
            value={profileName}
            onChange={e => setProfileName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="Votre nom"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={profileEmail}
            onChange={e => setProfileEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="email@exemple.com"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Bio</label>
        <textarea
          value={profileBio}
          onChange={e => setProfileBio(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[80px]"
          placeholder="Parlez-nous de vous..."
        />
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="text-base font-medium mb-4">Préférences d&apos;affichage</h3>
        <div className="flex gap-3">
          {[
            { id: 'light' as const, label: 'Clair', icon: Sun },
            { id: 'dark' as const, label: 'Sombre', icon: Moon },
            { id: 'system' as const, label: 'Système', icon: Monitor },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors ${
                theme === t.id
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSaveProfile}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <><RefreshCw className="h-4 w-4 animate-spin" /> Sauvegarde...</>
          ) : saved ? (
            <><Check className="h-4 w-4" /> Enregistré ✓</>
          ) : (
            <><Save className="h-4 w-4" /> Enregistrer</>
          )}
        </button>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400 font-medium">
            Modifications enregistrées avec succès
          </span>
        )}
      </div>
    </div>
  );

  const renderSecurityTab = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-4">Mot de passe</h2>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium mb-1">Mot de passe actuel</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="••••••••"
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nouveau mot de passe</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Minimum 8 caractères"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirmer le mot de passe</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                confirmPassword && newPassword !== confirmPassword ? 'border-red-500' : 'border-border bg-background'
              }`}
              placeholder="Retaper le mot de passe"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500 mt-1">Les mots de passe ne correspondent pas</p>
            )}
          </div>
          <button
            onClick={handleChangePassword}
            disabled={saving || !currentPassword || !newPassword || newPassword !== confirmPassword}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Modification...' : 'Changer le mot de passe'}
          </button>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h2 className="text-lg font-semibold mb-4">Authentification à deux facteurs (2FA)</h2>
        <div className="flex items-center justify-between max-w-md">
          <div>
            <p className="text-sm font-medium">Activer la 2FA</p>
            <p className="text-xs text-muted-foreground">Ajoute une couche de sécurité supplémentaire</p>
          </div>
          <button
            onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              twoFactorEnabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                twoFactorEnabled ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h2 className="text-lg font-semibold mb-4 text-red-600 dark:text-red-400">Zone de danger</h2>
        <div className="space-y-3 max-w-md">
          <button className="flex items-center gap-2 px-4 py-2 border border-red-500/50 text-red-600 dark:text-red-400 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
            <LogOut className="h-4 w-4" />
            Déconnexion de tous les appareils
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors">
            <Trash2 className="h-4 w-4" />
            Supprimer mon compte
          </button>
        </div>
      </div>
    </div>
  );

  const renderNotificationsTab = () => (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Préférences de notification</h2>
      <div className="space-y-4 max-w-md">
        <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors cursor-pointer">
          <div>
            <p className="text-sm font-medium">Notifications par email</p>
            <p className="text-xs text-muted-foreground">Recevoir les mises à jour importantes par email</p>
          </div>
          <input
            type="checkbox"
            checked={emailNotifications}
            onChange={e => setEmailNotifications(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
        </label>
        <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors cursor-pointer">
          <div>
            <p className="text-sm font-medium">Notifications push</p>
            <p className="text-xs text-muted-foreground">Notifications dans le navigateur</p>
          </div>
          <input
            type="checkbox"
            checked={pushNotifications}
            onChange={e => setPushNotifications(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
        </label>
        <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors cursor-pointer">
          <div>
            <p className="text-sm font-medium">Emails marketing</p>
            <p className="text-xs text-muted-foreground">Offres et nouveautés Gen3ia</p>
          </div>
          <input
            type="checkbox"
            checked={marketingEmails}
            onChange={e => setMarketingEmails(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
        </label>
      </div>
      <button
        onClick={handleSaveProfile}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <Save className="h-4 w-4" /> Enregistrer les préférences
      </button>
    </div>
  );

  const renderBillingTab = () => (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Facturation & Abonnement</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { name: 'Starter', price: '9 €', features: ['100 crédits/mois', '1 agent', 'Support email'] },
          { name: 'Pro', price: '29 €', features: ['500 crédits/mois', '5 agents', 'Support prioritaire'] },
          { name: 'Enterprise', price: '99 €', features: ['Crédits illimités', 'Agents illimités', 'Support dédié'] },
        ].map(plan => (
          <div key={plan.name} className="border border-border rounded-xl p-4 hover:border-primary/50 transition-colors">
            <h3 className="font-semibold">{plan.name}</h3>
            <p className="text-2xl font-bold mt-2">{plan.price}<span className="text-sm font-normal text-muted-foreground">/mois</span></p>
            <ul className="mt-4 space-y-2">
              {plan.features.map(f => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  {f}
                </li>
              ))}
            </ul>
            <button className="w-full mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              Choisir
            </button>
          </div>
        ))}
      </div>
      <div className="border-t border-border pt-6">
        <h3 className="text-sm font-medium mb-2">Crédits restants</h3>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
          <div className="bg-primary h-2.5 rounded-full" style={{ width: '65%' }}></div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">325 / 500 crédits utilisés ce mois-ci</p>
      </div>
    </div>
  );

  const renderApiKeysTab = () => <ApiKeysManager />;

  const renderApprovalsTab = () => (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Applications autorisées</h2>
      {approvedApps.length === 0 ? (
        <div className="text-center py-12">
          <Check className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Aucune application</h3>
          <p className="text-sm text-muted-foreground">Vous n&apos;avez autorisé aucune application.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvedApps.map(app => (
            <div key={app.id} className="flex items-center justify-between p-4 border border-border rounded-xl hover:bg-muted/30 transition-colors">
              <div>
                <p className="font-medium text-sm">{app.name}</p>
                <div className="flex gap-2 mt-1">
                  {app.scopes.map(s => (
                    <span key={s} className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-medium">
                      {s}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Autorisé le {app.date}</p>
              </div>
              <button
                onClick={() => revokeApp(app.id)}
                className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 border border-red-500/30 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                Révoquer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const tabRenderers: Record<TabId, () => React.JSX.Element> = {
    profile: renderProfileTab,
    security: renderSecurityTab,
    notifications: renderNotificationsTab,
    billing: renderBillingTab,
    'api-keys': renderApiKeysTab,
    approvals: renderApprovalsTab,
    ads: () => <AdPreferencesPanel />,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-muted-foreground">Gérez votre compte et vos préférences</p>
      </div>

      <div className="flex gap-2 border-b border-border pb-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-card border border-border border-b-background text-foreground font-medium -mb-px'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border p-6">
        {tabRenderers[activeTab] ? tabRenderers[activeTab]() : null}
      </div>
    </div>
  );
}