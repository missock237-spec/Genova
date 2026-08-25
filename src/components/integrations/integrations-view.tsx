'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Puzzle, Check, X, Loader2, AlertCircle, Search,
  ChevronDown, ChevronRight, ExternalLink, Zap, Shield,
  MessageSquare, Code2, Database, BarChart3, Megaphone,
  CreditCard, Send, Globe, Box, Brain, Video, Music,
  Cloud, GitBranch, FileText, ShoppingCart, Briefcase,
  Bell, Mail, Calendar, Image as ImageIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

// ─── Icon mapping ───
const ICON_MAP: Record<string, React.ElementType> = {
  MessageSquare, Code2, Database, BarChart3, Megaphone,
  CreditCard, Send, Globe, Box, Brain, Video, Music,
  Cloud, GitBranch, FileText, ShoppingCart, Briefcase,
  Bell, Mail, Calendar, Zap, Shield, Puzzle, ImageIcon,
  PenSquare: ImageIcon, Users: MessageSquare, MapPin: Globe,
  Smartphone: MessageSquare, Activity: Zap, LayoutDashboard: Box,
};

function getIcon(name: string): React.ElementType {
  return ICON_MAP[name] || Puzzle;
}

// ─── Types ───
interface PluginAction {
  id: string;
  name: string;
  description: string;
  method: string;
  endpoint: string;
  params: { name: string; type: string; required: boolean; description: string }[];
}

interface CatalogPlugin {
  id: string;
  name: string;
  description: string;
  icon: string;
  logoUrl?: string | null;
  categories: string[];
  authType: string;
  website: string;
  actions: Record<string, PluginAction>;
}

interface ConnectedPlugin {
  appId: string;
  displayLabel?: string;
  isActive: boolean;
}

// ─── AppLogo : affiche le logo réel, fallback sur l'icône ───
function AppLogo({ plugin, Icon, className }: { plugin: CatalogPlugin; Icon: React.ElementType; className?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  if (plugin.logoUrl && !imgFailed) {
    return (
      <img
        src={plugin.logoUrl}
        alt={plugin.name}
        loading="lazy"
        onError={() => setImgFailed(true)}
        className={`h-5 w-5 object-contain ${className || ''}`}
      />
    );
  }
  return <Icon className={`h-5 w-5 text-[#00F5FF] ${className || ''}`} />;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  Communication:       { label: 'Communication',       icon: MessageSquare, color: 'text-blue-400' },
  Team:                { label: 'Équipe',              icon: Briefcase,     color: 'text-indigo-400' },
  'Dev Tools':         { label: 'Dev Tools',           icon: Code2,         color: 'text-green-400' },
  'Code Quality':      { label: 'Qualité Code',        icon: Shield,        color: 'text-emerald-400' },
  AI:                  { label: 'Intelligence IA',     icon: Brain,         color: 'text-purple-400' },
  IA:                  { label: 'Intelligence IA',     icon: Brain,         color: 'text-purple-400' },
  LLM:                 { label: 'LLM',                 icon: Brain,         color: 'text-violet-400' },
  Media:               { label: 'Média',               icon: Video,         color: 'text-pink-400' },
  Vidéo:               { label: 'Vidéo',               icon: Video,         color: 'text-pink-400' },
  Streaming:           { label: 'Streaming',           icon: Video,         color: 'text-pink-300' },
  Cloud:               { label: 'Cloud',               icon: Cloud,         color: 'text-cyan-400' },
  Infrastructure:      { label: 'Infrastructure',      icon: Cloud,         color: 'text-slate-300' },
  Déploiement:         { label: 'Déploiement',         icon: Cloud,         color: 'text-cyan-300' },
  Database:            { label: 'Base de données',     icon: Database,      color: 'text-amber-400' },
  'Base de données':   { label: 'Base de données',     icon: Database,      color: 'text-amber-400' },
  Backend:             { label: 'Backend',             icon: Database,      color: 'text-amber-300' },
  Analytics:           { label: 'Analytiques',         icon: BarChart3,     color: 'text-orange-400' },
  Automation:          { label: 'Automatisation',      icon: Zap,           color: 'text-yellow-400' },
  Productivité:        { label: 'Productivité',        icon: Calendar,      color: 'text-violet-400' },
  Planning:            { label: 'Planning',            icon: Calendar,      color: 'text-violet-300' },
  Payments:            { label: 'Paiements',           icon: CreditCard,    color: 'text-lime-400' },
  Paiement:            { label: 'Paiements',           icon: CreditCard,    color: 'text-lime-400' },
  Finance:             { label: 'Finance',             icon: CreditCard,    color: 'text-lime-300' },
  Comptabilité:        { label: 'Comptabilité',        icon: CreditCard,    color: 'text-lime-200' },
  Ecommerce:           { label: 'E-Commerce',          icon: ShoppingCart,  color: 'text-rose-400' },
  'E-commerce':        { label: 'E-Commerce',          icon: ShoppingCart,  color: 'text-rose-400' },
  Marketing:           { label: 'Marketing',           icon: Megaphone,     color: 'text-sky-400' },
  CRM:                 { label: 'CRM',                 icon: Briefcase,     color: 'text-teal-400' },
  Enterprise:          { label: 'Enterprise',          icon: Briefcase,     color: 'text-teal-300' },
  Email:               { label: 'Email',               icon: Mail,          color: 'text-red-400' },
  Social:              { label: 'Social',              icon: Globe,         color: 'text-blue-300' },
  'Réseaux sociaux':   { label: 'Réseaux sociaux',     icon: Globe,         color: 'text-blue-300' },
  Professional:        { label: 'Professionnel',       icon: Briefcase,     color: 'text-indigo-300' },
  Storage:             { label: 'Stockage',            icon: Box,           color: 'text-slate-400' },
  Stockage:            { label: 'Stockage',            icon: Box,           color: 'text-slate-400' },
  Monitoring:          { label: 'Monitoring',          icon: Bell,          color: 'text-yellow-300' },
  Incident:            { label: 'Incident',            icon: Bell,          color: 'text-red-300' },
  Search:              { label: 'Recherche',           icon: Search,        color: 'text-green-300' },
  Notifications:       { label: 'Notifications',       icon: Bell,          color: 'text-amber-300' },
  Notification:        { label: 'Notifications',       icon: Bell,          color: 'text-amber-300' },
  SMS:                 { label: 'SMS',                 icon: Send,          color: 'text-cyan-300' },
  Security:            { label: 'Sécurité',            icon: Shield,        color: 'text-red-400' },
  DevOps:              { label: 'DevOps',              icon: Code2,         color: 'text-green-300' },
  Développement:       { label: 'Développement',       icon: Code2,         color: 'text-green-400' },
  'CI/CD':             { label: 'CI/CD',               icon: GitBranch,     color: 'text-orange-300' },
  'Version Control':   { label: 'Versionning',         icon: GitBranch,     color: 'text-orange-300' },
  'Project Management':{ label: 'Project Management', icon: GitBranch,     color: 'text-blue-200' },
  Documents:           { label: 'Documents',           icon: FileText,      color: 'text-blue-200' },
  Design:              { label: 'Design',              icon: ImageIcon,     color: 'text-pink-300' },
  Collaboration:       { label: 'Collaboration',       icon: Briefcase,     color: 'text-indigo-300' },
  Support:             { label: 'Support',             icon: MessageSquare,  color: 'text-sky-300' },
  Ticketing:           { label: 'Ticketing',           icon: MessageSquare,  color: 'text-sky-200' },
  Gaming:              { label: 'Gaming',              icon: MessageSquare,  color: 'text-purple-300' },
  Vidéoconférence:     { label: 'Vidéoconférence',     icon: Video,         color: 'text-pink-400' },
  Formulaires:         { label: 'Formulaires',         icon: FileText,      color: 'text-amber-200' },
  Testing:             { label: 'Testing',             icon: Code2,         color: 'text-green-300' },
  Product:             { label: 'Produit',             icon: Box,           color: 'text-amber-300' },
  Data:                { label: 'Data',                icon: Database,      color: 'text-orange-300' },
  Weather:             { label: 'Météo',               icon: Cloud,         color: 'text-cyan-300' },
  Sales:               { label: 'Ventes',              icon: Briefcase,     color: 'text-teal-300' },
  Community:           { label: 'Communauté',          icon: Globe,         color: 'text-blue-300' },
  Messaging:           { label: 'Messagerie',          icon: Send,          color: 'text-cyan-300' },
};

export function IntegrationsView() {
  const [catalog, setCatalog] = useState<CatalogPlugin[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [connected, setConnected] = useState<ConnectedPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [connectDialog, setConnectDialog] = useState<{ appId: string; appName: string; authType: string } | null>(null);
  const [connectForm, setConnectForm] = useState({ apiKey: '', username: '', password: '', accessToken: '' });
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');

  // ─── Fetch catalogue + connected ───
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [catalogRes, connectedRes] = await Promise.all([
        apiFetch<{ plugins: CatalogPlugin[]; categories: string[]; total: number }>('/api/plugins?scope=catalog'),
        apiFetch<{ connections: ConnectedPlugin[] }>('/api/plugins/connected').catch(() => ({ connections: [] })),
      ]);
      setCatalog(Array.isArray(catalogRes?.plugins) ? catalogRes.plugins : []);
      setCategories(Array.isArray(catalogRes?.categories) ? catalogRes.categories : []);
      const connData = connectedRes?.connections;
      setConnected(Array.isArray(connData) ? connData : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Connect / Disconnect ───
  const handleConnect = async () => {
    if (!connectDialog) return;
    setConnecting(true);
    setConnectError('');
    try {
      await apiFetch(`/api/plugins/${connectDialog.appId}/connect`, {
        method: 'POST',
        body: JSON.stringify({
          credentials: {
            apiKey: connectForm.apiKey || undefined,
            username: connectForm.username || undefined,
            password: connectForm.password || undefined,
            accessToken: connectForm.accessToken || undefined,
          },
        }),
      });
      setConnectDialog(null);
      setConnectForm({ apiKey: '', username: '', password: '', accessToken: '' });
      await fetchData();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (appId: string) => {
    try {
      await apiFetch(`/api/plugins/${appId}/disconnect`, { method: 'POST' });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  // ─── Filtered plugins ───
  const connectedIds = new Set(connected.filter(c => c.isActive).map(c => c.appId));
  const filtered = catalog.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !activeCategory || p.categories.includes(activeCategory);
    return matchSearch && matchCategory;
  });

  // ─── Loading ───
  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Integrations</h1><p className="text-muted-foreground text-sm mt-1">Connectez vos applications et services</p></div>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#00F5FF]" /></div>
      </div>
    );
  }

  // ─── Render ───
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {catalog.length} apps disponibles &middot; {connectedIds.size} connectees
          </p>
        </div>
      </div>

      {error && <div className="bg-red-500/10 text-red-400 text-sm rounded-lg p-3 border border-red-500/20">{error}</div>}

      {/* Search + Category filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A9099]" />
          <input
            type="text"
            placeholder="Rechercher une integration..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-[#12141A] border border-[#1C1E22] rounded-lg text-sm text-[#E6E8EC] placeholder:text-[#8A9099]/60 focus:outline-none focus:border-[#00F5FF]/40 focus:ring-1 focus:ring-[#00F5FF]/20 transition"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition ${!activeCategory ? 'bg-[#00F5FF] text-[#001416]' : 'bg-[#12141A] text-[#8A9099] hover:text-[#E6E8EC] border border-[#1C1E22]'}`}
          >
            Toutes
          </button>
          {categories.slice(0, 10).map(cat => {
            const meta = CATEGORY_META[cat];
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                  activeCategory === cat ? 'bg-[#00F5FF]/15 text-[#00F5FF] border border-[#00F5FF]/30'
                  : 'bg-[#12141A] text-[#8A9099] hover:text-[#E6E8EC] border border-[#1C1E22]'
                }`}
              >
                {meta?.icon && <meta.icon className="h-3 w-3" />}
                {meta?.label || cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Plugin grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-[#12141A] rounded-xl border border-[#1C1E22]">
          <Puzzle className="h-12 w-12 mx-auto text-[#8A9099] mb-4" />
          <h3 className="text-lg font-medium text-[#E6E8EC] mb-2">Aucune integration trouvee</h3>
          <p className="text-sm text-[#8A9099]">Essayez un autre terme de recherche</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(plugin => {
            const isConnected = connectedIds.has(plugin.id);
            const isExpanded = expandedId === plugin.id;
            const Icon = getIcon(plugin.icon);
            const actionCount = Object.keys(plugin.actions || {}).length;
            const connLabel = connected.find(c => c.appId === plugin.id)?.displayLabel;

            return (
              <div key={plugin.id} className="bg-[#12141A] rounded-xl border border-[#1C1E22] hover:border-[#00F5FF]/20 transition group">
                {/* Card header */}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#00F5FF]/10 flex items-center justify-center overflow-hidden">
                        <AppLogo plugin={plugin} Icon={Icon} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-[#E6E8EC]">{plugin.name}</h3>
                          {isConnected && <Check className="h-4 w-4 text-green-400" />}
                        </div>
                        <p className="text-xs text-[#8A9099]">
                          {actionCount} action{actionCount > 1 ? 's' : ''} &middot; {plugin.authType}
                        </p>
                      </div>
                    </div>
                  </div>
                  {connLabel && <p className="text-xs text-[#00F5FF]/80 mb-2 truncate">Connecte : {connLabel}</p>}
                  <p className="text-xs text-[#8A9099] line-clamp-2 mb-3">{plugin.description}</p>
                  <div className="flex gap-2 flex-wrap mb-3">
                    {plugin.categories.slice(0, 3).map(cat => {
                      const meta = CATEGORY_META[cat];
                      return (
                        <span key={cat} className={`text-[10px] px-2 py-0.5 rounded-full bg-[#1C1E22] ${meta?.color || 'text-[#8A9099]'}`}>
                          {meta?.label || cat}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Actions row */}
                <div className="border-t border-[#1C1E22] px-5 py-3 flex items-center justify-between">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : plugin.id)}
                    className="text-xs text-[#8A9099] hover:text-[#E6E8EC] flex items-center gap-1 transition"
                  >
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Voir les actions
                  </button>
                  {isConnected ? (
                    <button
                      onClick={() => handleDisconnect(plugin.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                    >
                      Deconnecter
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setConnectDialog({ appId: plugin.id, appName: plugin.name, authType: plugin.authType });
                        setConnectError('');
                        setConnectForm({ apiKey: '', username: '', password: '', accessToken: '' });
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#00F5FF]/10 text-[#00F5FF] hover:bg-[#00F5FF]/20 transition"
                    >
                      Connecter
                    </button>
                  )}
                </div>

                {/* Expanded actions */}
                {isExpanded && (
                  <div className="border-t border-[#1C1E22] px-5 py-3 space-y-2 max-h-60 overflow-y-auto">
                    {Object.values(plugin.actions || {}).map(action => (
                      <div key={action.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[#1C1E22]">
                        <div>
                          <p className="text-xs font-medium text-[#E6E8EC]">{action.name}</p>
                          <p className="text-[10px] text-[#8A9099]">{action.method} {action.endpoint}</p>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1C1E22] text-[#8A9099]">{action.method}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Connect dialog */}
      {connectDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConnectDialog(null)}>
          <div className="bg-[#12141A] border border-[#1C1E22] rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-[#E6E8EC]">Connecter {connectDialog.appName}</h3>
                <p className="text-xs text-[#8A9099] mt-0.5">Authentification : {connectDialog.authType}</p>
              </div>
              <button onClick={() => setConnectDialog(null)} className="text-[#8A9099] hover:text-[#E6E8EC]"><X className="h-5 w-5" /></button>
            </div>

            {connectError && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg p-2.5 mb-4 border border-red-500/20">{connectError}</div>}

            <div className="space-y-4">
              {(connectDialog.authType === 'bearer' || connectDialog.authType === 'token' || connectDialog.authType === 'api_key_header') && (
                <div>
                  <label className="block text-xs font-medium text-[#8A9099] mb-1.5">API Key / Token</label>
                  <input
                    type="password"
                    placeholder="sk-..., xoxb-..., ghp_..."
                    value={connectForm.apiKey}
                    onChange={e => setConnectForm(f => ({ ...f, apiKey: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-[#0B0C0D] border border-[#1C1E22] rounded-lg text-sm text-[#E6E8EC] placeholder:text-[#8A9099]/40 focus:outline-none focus:border-[#00F5FF]/40 transition"
                  />
                </div>
              )}

              {connectDialog.authType === 'basic' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[#8A9099] mb-1.5">Username</label>
                    <input
                      type="text"
                      value={connectForm.username}
                      onChange={e => setConnectForm(f => ({ ...f, username: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-[#0B0C0D] border border-[#1C1E22] rounded-lg text-sm text-[#E6E8EC] placeholder:text-[#8A9099]/40 focus:outline-none focus:border-[#00F5FF]/40 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#8A9099] mb-1.5">Password</label>
                    <input
                      type="password"
                      value={connectForm.password}
                      onChange={e => setConnectForm(f => ({ ...f, password: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-[#0B0C0D] border border-[#1C1E22] rounded-lg text-sm text-[#E6E8EC] placeholder:text-[#8A9099]/40 focus:outline-none focus:border-[#00F5FF]/40 transition"
                    />
                  </div>
                </>
              )}

              {connectDialog.authType === 'oauth2' && (
                <div>
                  <label className="block text-xs font-medium text-[#8A9099] mb-1.5">Access Token</label>
                  <input
                    type="password"
                    placeholder="ya29.a0ARr..."
                    value={connectForm.accessToken}
                    onChange={e => setConnectForm(f => ({ ...f, accessToken: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-[#0B0C0D] border border-[#1C1E22] rounded-lg text-sm text-[#E6E8EC] placeholder:text-[#8A9099]/40 focus:outline-none focus:border-[#00F5FF]/40 transition"
                  />
                  <p className="text-[10px] text-[#8A9099] mt-1">Collez le token OAuth obtenu depuis la console du fournisseur</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setConnectDialog(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-[#1C1E22] text-[#8A9099] hover:text-[#E6E8EC] transition"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-[#00F5FF] text-[#001416] hover:bg-[#00F5FF]/90 disabled:opacity-50 transition flex items-center justify-center gap-2"
                >
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Zap className="h-4 w-4" /> Connecter</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
