'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  User,
  Mail,
  Lock,
  Loader2,
  Save,
  Youtube,
  Facebook,
  Instagram,
  Linkedin,
  Megaphone,
  MessageCircle,
  Phone,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Trash2,
  Cpu,
  Server,
  Zap,
  Database,
  HardDrive,
  ExternalLink,
  ShieldCheck,
  Send,
  Eye,
  EyeOff,
  Bot,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ---- Types ----
interface SocialAccount {
  id: string;
  platform: string;
  accountId: string;
  accountName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WhatsAppConfigData {
  id: string;
  phoneNumber: string;
  whatsappId: string | null;
  isActive: boolean;
  autoMessage: boolean;
  autoCall: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserResource {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  endpoint: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ApprovalRequest {
  id: string;
  agentId: string;
  agentName: string;
  agentType: string;
  action: string;
  details: string;
  status: string;
  result: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

// ---- Platform Config ----
const platformConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string; label: string }> = {
  youtube: { icon: Youtube, color: 'text-red-500', bgColor: 'bg-red-500/10', label: 'YouTube' },
  facebook: { icon: Facebook, color: 'text-blue-500', bgColor: 'bg-blue-500/10', label: 'Facebook' },
  instagram: { icon: Instagram, color: 'text-pink-500', bgColor: 'bg-pink-500/10', label: 'Instagram' },
  tiktok: { icon: Megaphone, color: 'text-white', bgColor: 'bg-white/10', label: 'TikTok' },
  linkedin: { icon: Linkedin, color: 'text-blue-400', bgColor: 'bg-blue-400/10', label: 'LinkedIn' },
};

const resourceTypeIcons: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  cpu: { icon: Cpu, color: 'text-purple-400', label: 'CPU' },
  api: { icon: Zap, color: 'text-yellow-500', label: 'API' },
  mvp: { icon: Server, color: 'text-emerald-500', label: 'MVP' },
  database: { icon: Database, color: 'text-cyan-500', label: 'Base de données' },
  storage: { icon: HardDrive, color: 'text-orange-500', label: 'Stockage' },
};

const approvalStatusColors: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  approved: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-600 border-red-500/20',
};

const approvalStatusLabels: Record<string, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Rejeté',
};

// ---- Main Component ----
export function SettingsView({ initialTab = 'profile' }: { initialTab?: string }) {
  const { user } = useAuthStore();
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Paramètres</h2>
        <p className="text-sm text-muted-foreground">Gérez votre profil, connexions et ressources</p>
      </div>

      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 gap-1">
          <TabsTrigger value="profile" className="text-xs sm:text-sm">Profil</TabsTrigger>
          <TabsTrigger value="social" className="text-xs sm:text-sm">Réseaux</TabsTrigger>
          <TabsTrigger value="whatsapp" className="text-xs sm:text-sm">WhatsApp</TabsTrigger>
          <TabsTrigger value="resources" className="text-xs sm:text-sm">Ressources</TabsTrigger>
          <TabsTrigger value="approvals" className="text-xs sm:text-sm">Approbations</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab user={user} />
        </TabsContent>
        <TabsContent value="social">
          <SocialTab />
        </TabsContent>
        <TabsContent value="whatsapp">
          <WhatsAppTab />
        </TabsContent>
        <TabsContent value="resources">
          <ResourcesTab />
        </TabsContent>
        <TabsContent value="approvals">
          <ApprovalsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---- Profile Tab ----
function ProfileTab({ user }: { user: { id?: string; name?: string; email?: string; plan?: string; avatar?: string | null } | null }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs', variant: 'destructive' });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ title: 'Erreur', description: 'Les mots de passe ne correspondent pas', variant: 'destructive' });
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast({ title: 'Erreur', description: 'Le nouveau mot de passe doit contenir au moins 8 caractères', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // Use forgot-password flow for password change
      await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: user?.email }),
      });
      toast({ title: 'Email envoyé', description: 'Un code de vérification a été envoyé à votre email pour changer le mot de passe.' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur serveur';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile Info */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Informations du profil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name} className="h-16 w-16 rounded-full" />
              ) : (
                <span className="text-xl font-bold text-primary">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              )}
            </div>
            <div>
              <h3 className="font-semibold">{user?.name || 'Utilisateur'}</h3>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <Badge variant="secondary" className="mt-1">Gratuit</Badge>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input value={user?.name || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            Changer le mot de passe
          </CardTitle>
          <CardDescription>Un code de vérification sera envoyé à votre email</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label>Mot de passe actuel</Label>
              <div className="relative">
                <Input
                  type={showCurrentPw ? 'text' : 'password'}
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  placeholder="••••••••"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                >
                  {showCurrentPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  type={showNewPw ? 'text' : 'password'}
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  placeholder="Min. 8 caractères"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowNewPw(!showNewPw)}
                >
                  {showNewPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirmer le nouveau mot de passe</Label>
              <Input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Envoyer le code de vérification
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Social Tab ----
function SocialTab() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectPlatform, setConnectPlatform] = useState('');
  const [connectForm, setConnectForm] = useState({ accountId: '', accountName: '', accessToken: '', refreshToken: '' });
  const [connectLoading, setConnectLoading] = useState(false);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await apiFetch<SocialAccount[]>('/api/social/accounts');
      setAccounts(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectForm.accountId || !connectForm.accountName || !connectForm.accessToken) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs requis', variant: 'destructive' });
      return;
    }

    setConnectLoading(true);
    try {
      await apiFetch('/api/social/accounts', {
        method: 'POST',
        body: JSON.stringify({
          platform: connectPlatform,
          accountId: connectForm.accountId,
          accountName: connectForm.accountName,
          accessToken: connectForm.accessToken,
          refreshToken: connectForm.refreshToken || undefined,
        }),
      });
      toast({ title: 'Compte connecté', description: `Le compte ${platformConfig[connectPlatform]?.label} a été connecté` });
      setConnectOpen(false);
      setConnectForm({ accountId: '', accountName: '', accessToken: '', refreshToken: '' });
      loadAccounts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de connexion';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setConnectLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectId) return;
    try {
      await apiFetch(`/api/social/accounts/${disconnectId}`, { method: 'DELETE' });
      setAccounts((prev) => prev.filter((a) => a.id !== disconnectId));
      toast({ title: 'Compte déconnecté', description: 'Le compte a été déconnecté' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setDisconnectId(null);
    }
  };

  const openConnectDialog = (platform: string) => {
    setConnectPlatform(platform);
    setConnectForm({ accountId: '', accountName: '', accessToken: '', refreshToken: '' });
    setConnectOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            Réseaux Sociaux
          </CardTitle>
          <CardDescription>Connectez vos comptes pour permettre aux agents de publier et interagir</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(platformConfig).map(([platform, config]) => {
              const account = accounts.find((a) => a.platform === platform);
              const Icon = config.icon;

              return (
                <Card key={platform} className={`border-border/50 ${account ? 'border-primary/20' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${config.bgColor}`}>
                          <Icon className={`h-5 w-5 ${config.color}`} />
                        </div>
                        <div>
                          <h4 className="text-sm font-medium">{config.label}</h4>
                          {account && (
                            <p className="text-xs text-muted-foreground">{account.accountName}</p>
                          )}
                        </div>
                      </div>
                      {account ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                          Connecté
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          Non connecté
                        </Badge>
                      )}
                    </div>
                    {account && (
                      <p className="text-[10px] text-muted-foreground mb-3">
                        Connecté le {new Date(account.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                    <div className="flex gap-2">
                      {account ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive text-xs"
                          onClick={() => setDisconnectId(account.id)}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Déconnecter
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => openConnectDialog(platform)}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Connecter
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Connect Dialog */}
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {connectPlatform && platformConfig[connectPlatform] && (
                <>
                  {(() => {
                    const Icon = platformConfig[connectPlatform].icon;
                    return <Icon className={`h-5 w-5 ${platformConfig[connectPlatform].color}`} />;
                  })()}
                  Connecter {platformConfig[connectPlatform]?.label}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleConnect} className="space-y-4">
            <div className="space-y-2">
              <Label>ID du compte</Label>
              <Input
                placeholder="Votre ID de compte"
                value={connectForm.accountId}
                onChange={(e) => setConnectForm({ ...connectForm, accountId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nom du compte</Label>
              <Input
                placeholder="Nom affiché"
                value={connectForm.accountName}
                onChange={(e) => setConnectForm({ ...connectForm, accountName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Jeton d&apos;accès (Access Token)</Label>
              <Input
                type="password"
                placeholder="Votre token d'accès"
                value={connectForm.accessToken}
                onChange={(e) => setConnectForm({ ...connectForm, accessToken: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Refresh Token (optionnel)</Label>
              <Input
                type="password"
                placeholder="Optionnel"
                value={connectForm.refreshToken}
                onChange={(e) => setConnectForm({ ...connectForm, refreshToken: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConnectOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={connectLoading}>
                {connectLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Connecter
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation */}
      <AlertDialog open={!!disconnectId} onOpenChange={() => setDisconnectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Déconnecter ce compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les agents ne pourront plus accéder à ce compte social.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Déconnecter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- WhatsApp Tab ----
function WhatsAppTab() {
  const { toast } = useToast();
  const [config, setConfig] = useState<WhatsAppConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    phoneNumber: '',
    whatsappId: '',
    apiToken: '',
    isActive: false,
    autoMessage: false,
    autoCall: false,
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await apiFetch<WhatsAppConfigData | null>('/api/whatsapp/config');
      if (data) {
        setConfig(data);
        setForm({
          phoneNumber: data.phoneNumber,
          whatsappId: data.whatsappId || '',
          apiToken: '',
          isActive: data.isActive,
          autoMessage: data.autoMessage,
          autoCall: data.autoCall,
        });
      }
    } catch {
      // no config yet
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phoneNumber) {
      toast({ title: 'Erreur', description: 'Le numéro de téléphone est requis', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const body = {
        phoneNumber: form.phoneNumber,
        whatsappId: form.whatsappId || undefined,
        apiToken: form.apiToken || undefined,
        autoMessage: form.autoMessage,
        autoCall: form.autoCall,
      };

      if (config) {
        await apiFetch('/api/whatsapp/config', {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/whatsapp/config', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      toast({ title: 'Configuration sauvegardée', description: 'Les paramètres WhatsApp ont été mis à jour' });
      loadConfig();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur serveur';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestMessage = async () => {
    try {
      await apiFetch('/api/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ to: form.phoneNumber, message: 'Message test depuis AgentOS' }),
      });
      toast({ title: 'Message envoyé', description: 'Un message test a été envoyé' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-green-500" />
            Configuration WhatsApp
          </CardTitle>
          <CardDescription>Configurez WhatsApp Business pour permettre aux agents d&apos;envoyer des messages et passer des appels</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Numéro de téléphone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="+33612345678"
                    value={form.phoneNumber}
                    onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>WhatsApp Business ID</Label>
                <Input
                  placeholder="ID Business"
                  value={form.whatsappId}
                  onChange={(e) => setForm({ ...form, whatsappId: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>API Token</Label>
              <Input
                type="password"
                placeholder={config ? '•••••••• (défini)' : 'Entrez votre API token'}
                value={form.apiToken}
                onChange={(e) => setForm({ ...form, apiToken: e.target.value })}
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                <div>
                  <p className="text-sm font-medium">Actif</p>
                  <p className="text-xs text-muted-foreground">Activer la connexion WhatsApp</p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                <div>
                  <p className="text-sm font-medium">Auto-message</p>
                  <p className="text-xs text-muted-foreground">Les agents peuvent envoyer des messages</p>
                </div>
                <Switch
                  checked={form.autoMessage}
                  onCheckedChange={(checked) => setForm({ ...form, autoMessage: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                <div>
                  <p className="text-sm font-medium">Auto-appel</p>
                  <p className="text-xs text-muted-foreground">Les agents peuvent passer des appels</p>
                </div>
                <Switch
                  checked={form.autoCall}
                  onCheckedChange={(checked) => setForm({ ...form, autoCall: checked })}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Sauvegarder
              </Button>
              {config && (
                <Button type="button" variant="outline" onClick={handleTestMessage}>
                  <Send className="h-4 w-4 mr-2" />
                  Message test
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Resources Tab ----
function ResourcesTab() {
  const { toast } = useToast();
  const [resources, setResources] = useState<UserResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: 'api',
    name: '',
    config: '{}',
    apiKey: '',
    endpoint: '',
  });

  useEffect(() => {
    loadResources();
  }, []);

  const loadResources = async () => {
    try {
      const data = await apiFetch<UserResource[]>('/api/resources');
      setResources(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.type) {
      toast({ title: 'Erreur', description: 'Nom et type requis', variant: 'destructive' });
      return;
    }

    setAddLoading(true);
    try {
      let parsedConfig: Record<string, unknown>;
      try {
        parsedConfig = JSON.parse(form.config);
      } catch {
        toast({ title: 'Erreur', description: 'Le format JSON de la configuration est invalide', variant: 'destructive' });
        setAddLoading(false);
        return;
      }

      await apiFetch('/api/resources', {
        method: 'POST',
        body: JSON.stringify({
          type: form.type,
          name: form.name,
          config: parsedConfig,
          apiKey: form.apiKey || undefined,
          endpoint: form.endpoint || undefined,
        }),
      });

      toast({ title: 'Ressource ajoutée', description: `${form.name} a été ajouté` });
      setAddOpen(false);
      setForm({ type: 'api', name: '', config: '{}', apiKey: '', endpoint: '' });
      loadResources();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur serveur';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/api/resources/${deleteId}`, { method: 'DELETE' });
      setResources((prev) => prev.filter((r) => r.id !== deleteId));
      toast({ title: 'Ressource supprimée', description: 'La ressource a été supprimée' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Vos Ressources</h3>
          <p className="text-xs text-muted-foreground">{resources.length} ressource(s) configurée(s)</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </div>

      {resources.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <Server className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Aucune ressource configurée</p>
            <p className="text-xs text-muted-foreground mt-1">Ajoutez des ressources pour permettre aux agents d&apos;utiliser des services externes</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {resources.map((resource) => {
            const typeConfig = resourceTypeIcons[resource.type];
            const Icon = typeConfig?.icon || Server;
            const color = typeConfig?.color || 'text-muted-foreground';

            return (
              <Card key={resource.id} className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Icon className={`h-4 w-4 ${color}`} />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium">{resource.name}</h4>
                        <p className="text-xs text-muted-foreground">{typeConfig?.label || resource.type}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={resource.isActive ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-muted text-muted-foreground'}>
                      {resource.isActive ? 'Actif' : 'Inactif'}
                    </Badge>
                  </div>
                  {resource.endpoint && (
                    <p className="text-[10px] text-muted-foreground truncate mb-3">{resource.endpoint}</p>
                  )}
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive/70 hover:text-destructive text-xs"
                      onClick={() => setDeleteId(resource.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Supprimer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Resource Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Ajouter une ressource
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(resourceTypeIcons).map(([type, config]) => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        <config.icon className={`h-4 w-4 ${config.color}`} />
                        {config.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input
                placeholder="Ex: OpenAI API"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Configuration (JSON)</Label>
              <Textarea
                placeholder='{"key": "value"}'
                value={form.config}
                onChange={(e) => setForm({ ...form, config: e.target.value })}
                rows={3}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>API Key (optionnel)</Label>
              <Input
                type="password"
                placeholder="sk-..."
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Endpoint URL (optionnel)</Label>
              <Input
                placeholder="https://api.example.com"
                value={form.endpoint}
                onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={addLoading}>
                {addLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Ajouter
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette ressource ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les agents qui utilisent cette ressource perdront leur accès.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Approvals Tab ----
function ApprovalsTab() {
  const { toast } = useToast();
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadApprovals();
  }, []);

  const loadApprovals = async () => {
    try {
      const data = await apiFetch<ApprovalRequest[]>('/api/approvals');
      setApprovals(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setProcessing(id);
    try {
      await apiFetch(`/api/approvals/${id}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      toast({
        title: action === 'approve' ? 'Approuvé' : 'Rejeté',
        description: `La demande a été ${action === 'approve' ? 'approuvée' : 'rejetée'}`,
      });
      loadApprovals();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setProcessing(null);
    }
  };

  const filteredApprovals = approvals.filter((a) =>
    statusFilter === 'all' || a.status === statusFilter
  );

  const pendingCount = approvals.filter((a) => a.status === 'pending').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium">Demandes d&apos;approbation</h3>
          {pendingCount > 0 && (
            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
              {pendingCount} en attente
            </Badge>
          )}
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filtrer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="approved">Approuvés</SelectItem>
            <SelectItem value="rejected">Rejetés</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredApprovals.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {statusFilter === 'all' ? 'Aucune demande d\'approbation' : `Aucune demande ${approvalStatusLabels[statusFilter]?.toLowerCase() || ''}`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="max-h-[600px]">
          <div className="space-y-3 pr-2">
            {filteredApprovals.map((approval) => {
              const isPending = approval.status === 'pending';
              const isProcessing = processing === approval.id;

              return (
                <Card key={approval.id} className={`border-border/50 ${isPending ? 'border-amber-500/20' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h4 className="text-sm font-medium">{approval.agentName}</h4>
                          <p className="text-xs text-muted-foreground">{approval.action}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${approvalStatusColors[approval.status]}`}>
                        {approvalStatusLabels[approval.status] || approval.status}
                      </Badge>
                    </div>

                    {approval.details && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3 ml-11">
                        {(() => {
                          try {
                            const parsed = JSON.parse(approval.details);
                            return JSON.stringify(parsed, null, 2).substring(0, 200);
                          } catch {
                            return approval.details.substring(0, 200);
                          }
                        })()}
                      </p>
                    )}

                    <div className="flex items-center justify-between ml-11">
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(approval.createdAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      {isPending && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                            onClick={() => handleAction(approval.id, 'approve')}
                            disabled={isProcessing}
                          >
                            {isProcessing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                            Approuver
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                            onClick={() => handleAction(approval.id, 'reject')}
                            disabled={isProcessing}
                          >
                            {isProcessing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                            Rejeter
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
