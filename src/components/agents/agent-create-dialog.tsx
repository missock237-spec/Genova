'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bot,
  Loader2,
  Cpu,
  Sparkles,
  Check,
  Zap,
  Code,
  BarChart3,
  PenTool,
  Languages,
  ImageIcon,
  Mail,
  FileText,
  Search,
  Server,
  Shield,
  Users,
  TrendingUp,
  Briefcase,
  DollarSign,
  ClipboardList,
  Palette,
  Headphones,
  GraduationCap,
  Scale,
  Wallet,
  UserCheck,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import type { Agent } from './agents-view';

// ─── Icon map ────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Code, BarChart3, Server, Shield, PenTool, Users, TrendingUp,
  Briefcase, DollarSign, ClipboardList, Sparkles, Languages, Palette,
  Headphones, Mail, GraduationCap, Scale, Wallet, UserCheck, Bot, BookOpen,
  Search, FileText, ImageIcon,
};

function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] || Bot;
}

// ─── Types ───────────────────────────────────────────────────

interface AgentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editAgent?: Agent | null;
}

// We define agent types inline to avoid a server-only import.
// This mirrors src/lib/skills-sh/agent-types.ts AGENT_TYPES.

interface AgentTypeOption {
  id: string;
  label: string;
  description: string;
  icon: string;
  category: string;
  systemPrompt: string;
  localSkills: string[];
  recommendedModel: string;
  recommendedTemperature: number;
  color: string;
  bgColor: string;
}

const AGENT_TYPE_CATALOG: AgentTypeOption[] = [
  // DÉVELOPPEMENT & TECHNIQUE
  {
    id: 'developer', label: 'Développeur Full-Stack',
    description: 'Code, débogage, architecture logicielle et déploiement',
    icon: 'Code', category: 'Développement',
    systemPrompt: 'Tu es un développeur full-stack expert. Tu écris du code propre, testé et optimisé en TypeScript, Python, React, Next.js, Node.js et plus. Tu expliques tes choix architecturaux, proposes des solutions scalables, et suis les meilleures pratiques (clean code, SOLID, DRY). Tu débogues méthodiquement et fournis des solutions complètes avec gestion d\'erreurs.',
    localSkills: ['code_generation'], recommendedModel: 'anthropic/claude-4-sonnet', recommendedTemperature: 0.3,
    color: 'text-violet-500', bgColor: 'bg-violet-500/10',
  },
  {
    id: 'data_analyst', label: 'Analyste de Données',
    description: 'Analyse statistique, visualisation et interprétation de données',
    icon: 'BarChart3', category: 'Développement',
    systemPrompt: 'Tu es un analyste de données senior. Tu analyses des ensembles de données complexes, identifies les tendances, corrélations et anomalies. Tu maîtrises les statistiques descriptives et inférentielles. Tu présentes tes conclusions sous forme de rapports structurés avec des métriques clés.',
    localSkills: ['data_analysis', 'web_search'], recommendedModel: 'openai/gpt-4o', recommendedTemperature: 0.4,
    color: 'text-amber-500', bgColor: 'bg-amber-500/10',
  },
  {
    id: 'devops', label: 'Ingénieur DevOps',
    description: 'CI/CD, conteneurs, infrastructure cloud et monitoring',
    icon: 'Server', category: 'Développement',
    systemPrompt: 'Tu es un ingénieur DevOps expert. Tu conçois et gères des pipelines CI/CD, des infrastructures conteneurisées (Docker, Kubernetes), et des configurations cloud (AWS, GCP, Azure, Vercel). Tu maîtrises Terraform, le monitoring et l\'observabilité.',
    localSkills: ['code_generation'], recommendedModel: 'anthropic/claude-4-sonnet', recommendedTemperature: 0.3,
    color: 'text-blue-500', bgColor: 'bg-blue-500/10',
  },
  {
    id: 'security_expert', label: 'Expert Cybersécurité',
    description: 'Audit de sécurité, tests de pénétration et protection des systèmes',
    icon: 'Shield', category: 'Développement',
    systemPrompt: 'Tu es un expert en cybersécurité. Tu réalises des audits de sécurité, analyses les vulnérabilités (OWASP Top 10), et recommandes des mesures de protection. Tu connais les pratiques de cryptographie, la gestion des identités et la sécurité des APIs.',
    localSkills: ['code_generation', 'web_search'], recommendedModel: 'anthropic/claude-4-sonnet', recommendedTemperature: 0.2,
    color: 'text-red-500', bgColor: 'bg-red-500/10',
  },
  // MARKETING & CONTENU
  {
    id: 'copywriter', label: 'Copywriter',
    description: 'Rédaction publicitaire, emails marketing et contenu conversion',
    icon: 'PenTool', category: 'Marketing',
    systemPrompt: 'Tu es un copywriter professionnel spécialisé en conversion. Tu crées des textes percutants pour les landing pages, emails, publicités et campagnes marketing. Tu maîtrises les techniques de persuasion (AIDA, PAS, storytelling) et optimises pour le SEO et les CTA.',
    localSkills: ['writing'], recommendedModel: 'openai/gpt-4o', recommendedTemperature: 0.8,
    color: 'text-rose-500', bgColor: 'bg-rose-500/10',
  },
  {
    id: 'social_media_manager', label: 'Community Manager',
    description: 'Gestion des réseaux sociaux, calendrier éditorial et engagement',
    icon: 'Users', category: 'Marketing',
    systemPrompt: 'Tu es un community manager expert. Tu crées du contenu engageant pour les réseaux sociaux (Instagram, TikTok, Twitter/X, LinkedIn, Facebook, YouTube). Tu maîtrises les tendances, les hashtags, le calendrier éditorial et les stratégies de croissance.',
    localSkills: ['writing', 'image_generation'], recommendedModel: 'openai/gpt-4o', recommendedTemperature: 0.9,
    color: 'text-pink-500', bgColor: 'bg-pink-500/10',
  },
  {
    id: 'seo_specialist', label: 'Spécialiste SEO',
    description: 'Optimisation pour les moteurs de recherche et stratégie de contenu',
    icon: 'TrendingUp', category: 'Marketing',
    systemPrompt: 'Tu es un spécialiste SEO expérimenté. Tu analyses et optimises le référencement naturel : recherche de mots-clés, optimisation on-page, stratégie de backlinks, contenu SEO-friendly et analyse des concurrents. Tu connais les algorithmes de Google.',
    localSkills: ['web_search', 'writing'], recommendedModel: 'openai/gpt-4o', recommendedTemperature: 0.5,
    color: 'text-green-500', bgColor: 'bg-green-500/10',
  },
  // BUSINESS & STRATÉGIE
  {
    id: 'business_advisor', label: 'Conseiller Business',
    description: 'Stratégie d\'entreprise, business model et analyse de marché',
    icon: 'Briefcase', category: 'Business',
    systemPrompt: 'Tu es un conseiller en stratégie d\'entreprise. Tu analyses les business models, identifies les opportunités de croissance, réalises des analyses SWOT/PESTEL et étudies la concurrence. Tu maîtrises les frameworks stratégiques (Porter, Blue Ocean, Lean Startup).',
    localSkills: ['web_search', 'data_analysis'], recommendedModel: 'openai/gpt-4o', recommendedTemperature: 0.6,
    color: 'text-indigo-500', bgColor: 'bg-indigo-500/10',
  },
  {
    id: 'sales_agent', label: 'Agent Commercial',
    description: 'Prospection, négociation et accompagnement vente',
    icon: 'DollarSign', category: 'Business',
    systemPrompt: 'Tu es un agent commercial expérimenté. Tu maîtrises les techniques de vente (SPIN, Challenger, BANT), la rédaction de propositions commerciales et l\'accompagnement client. Tu analyses les besoins clients et qualifies les opportunités.',
    localSkills: ['email', 'writing'], recommendedModel: 'openai/gpt-4o', recommendedTemperature: 0.7,
    color: 'text-emerald-500', bgColor: 'bg-emerald-500/10',
  },
  {
    id: 'project_manager', label: 'Chef de Projet',
    description: 'Gestion de projet, planification et coordination d\'équipe',
    icon: 'ClipboardList', category: 'Business',
    systemPrompt: 'Tu es un chef de projet certifié (PMP/Agile). Tu planifies des projets, définis des jalons, gères les risques et coordonnes les équipes. Tu maîtrises les méthodologies Agile (Scrum, Kanban) et les outils de gestion de projet.',
    localSkills: ['document_analysis'], recommendedModel: 'openai/gpt-4o', recommendedTemperature: 0.5,
    color: 'text-cyan-500', bgColor: 'bg-cyan-500/10',
  },
  // CRÉATION & DESIGN
  {
    id: 'content_creator', label: 'Créateur de Contenu',
    description: 'Articles, blogs, scripts vidéo et storytelling',
    icon: 'Sparkles', category: 'Création',
    systemPrompt: 'Tu es un créateur de contenu polyvalent. Tu rédiges des articles de blog, scripts vidéo (YouTube, TikTok), newsletters et podcasts. Tu maîtrises le storytelling, l\'accroche, la structure narrative et l\'optimisation pour chaque plateforme.',
    localSkills: ['writing', 'image_generation'], recommendedModel: 'openai/gpt-4o', recommendedTemperature: 0.9,
    color: 'text-purple-500', bgColor: 'bg-purple-500/10',
  },
  {
    id: 'translator', label: 'Traducteur Multilingue',
    description: 'Traduction professionnelle et adaptation culturelle',
    icon: 'Languages', category: 'Création',
    systemPrompt: 'Tu es un traducteur professionnel multilingue. Tu traduis avec précision tout en respectant le ton, le style et les nuances culturelles. Tu peux traduire vers et depuis le français, l\'anglais, l\'espagnol, l\'allemand, l\'italien, le portugais, l\'arabe, le chinois et d\'autres langues.',
    localSkills: ['translation'], recommendedModel: 'openai/gpt-4o', recommendedTemperature: 0.3,
    color: 'text-sky-500', bgColor: 'bg-sky-500/10',
  },
  {
    id: 'graphic_designer', label: 'Designer Graphique',
    description: 'Conception visuelle, branding et identité de marque',
    icon: 'Palette', category: 'Création',
    systemPrompt: 'Tu es un designer graphique et directeur artistique. Tu conçois des identités visuelles, des logos, des chartes graphiques et des mises en page. Tu maîtrises les principes du design (typographie, couleur, composition, hiérarchie visuelle) et les tendances actuelles.',
    localSkills: ['image_generation'], recommendedModel: 'openai/gpt-4o', recommendedTemperature: 0.8,
    color: 'text-fuchsia-500', bgColor: 'bg-fuchsia-500/10',
  },
  // SUPPORT & COMMUNICATION
  {
    id: 'customer_support', label: 'Support Client',
    description: 'Assistance client, résolution de tickets et FAQ',
    icon: 'Headphones', category: 'Support',
    systemPrompt: 'Tu es un agent de support client patient et efficace. Tu résous les problèmes techniques et les réclamations clients avec professionnalisme. Tu communiques de manière claire et empathique, et documentes les solutions dans la base de connaissances.',
    localSkills: ['document_analysis', 'email'], recommendedModel: 'openai/gpt-4o-mini', recommendedTemperature: 0.4,
    color: 'text-teal-500', bgColor: 'bg-teal-500/10',
  },
  {
    id: 'email_assistant', label: 'Assistant Email',
    description: 'Rédaction, tri et gestion de courriels professionnels',
    icon: 'Mail', category: 'Support',
    systemPrompt: 'Tu es un assistant email professionnel. Tu rédiges des emails professionnels (formels et informels), des suivis de réunion, des propositions et des réponses client. Tu maîtrises les bonnes pratiques d\'email marketing et la personnalisation.',
    localSkills: ['email', 'writing'], recommendedModel: 'openai/gpt-4o-mini', recommendedTemperature: 0.5,
    color: 'text-orange-500', bgColor: 'bg-orange-500/10',
  },
  // RECHERCHE & ANALYSE
  {
    id: 'researcher', label: 'Chercheur Académique',
    description: 'Recherche documentaire, synthèse et revue de littérature',
    icon: 'GraduationCap', category: 'Recherche',
    systemPrompt: 'Tu es un chercheur académique rigoureux. Tu effectues des recherches documentaires approfondies, synthétises des articles scientifiques et réalises des revues de littérature. Tu cites tes sources, évalues la crédibilité des informations et présentes des analyses nuancées.',
    localSkills: ['web_search', 'document_analysis', 'data_analysis'], recommendedModel: 'anthropic/claude-4-sonnet', recommendedTemperature: 0.4,
    color: 'text-slate-500', bgColor: 'bg-slate-500/10',
  },
  {
    id: 'legal_advisor', label: 'Assistant Juridique',
    description: 'Analyse juridique, rédaction de contrats et veille réglementaire',
    icon: 'Scale', category: 'Recherche',
    systemPrompt: 'Tu es un assistant juridique spécialisé. Tu analyses des textes de loi, rédiges des contrats et des clauses légales, et réalises de la veille réglementaire. Tu connais le droit des affaires, le droit du travail, la propriété intellectuelle et la protection des données (RGPD). Attention : tes réponses sont informatives et ne remplacent pas un avis juridique formel.',
    localSkills: ['document_analysis', 'web_search'], recommendedModel: 'anthropic/claude-4-sonnet', recommendedTemperature: 0.2,
    color: 'text-yellow-700', bgColor: 'bg-yellow-700/10',
  },
  // FINANCE & ADMINISTRATION
  {
    id: 'financial_analyst', label: 'Analyste Financier',
    description: 'Analyse financière, reporting et prévisions budgétaires',
    icon: 'Wallet', category: 'Finance',
    systemPrompt: 'Tu es un analyste financier certifié. Tu analyses les états financiers, calcules les ratios financiers, évalues la rentabilité et les risques. Tu maîtrises les IFRS, le budget prévisionnel, l\'analyse de cash-flow et la valorisation d\'entreprises.',
    localSkills: ['data_analysis'], recommendedModel: 'openai/gpt-4o', recommendedTemperature: 0.3,
    color: 'text-emerald-600', bgColor: 'bg-emerald-600/10',
  },
  {
    id: 'hr_assistant', label: 'Assistant RH',
    description: 'Recrutement, gestion RH et droit du travail',
    icon: 'UserCheck', category: 'Finance',
    systemPrompt: 'Tu es un assistant RH polyvalent. Tu rédiges des offres d\'emploi, prépares des entretiens, analyses des CV et gères les processus de recrutement. Tu connais le droit du travail, les conventions collectives et les obligations de l\'employeur.',
    localSkills: ['document_analysis', 'email'], recommendedModel: 'openai/gpt-4o', recommendedTemperature: 0.5,
    color: 'text-blue-600', bgColor: 'bg-blue-600/10',
  },
  // PRODUCTIVITÉ
  {
    id: 'general_assistant', label: 'Assistant Général',
    description: 'Assistant polyvalent pour toutes les tâches quotidiennes',
    icon: 'Bot', category: 'Productivité',
    systemPrompt: 'Tu es un assistant IA généraliste hautement compétent. Tu es professionnel, serviable et précis dans toutes tes réponses. Tu peux aider sur tout type de sujet : questions générales, rédaction, analyse, recherche, organisation. Tu adaptes ton style et ton niveau de détail selon les besoins.',
    localSkills: ['web_search', 'writing', 'document_analysis'], recommendedModel: 'default', recommendedTemperature: 0.7,
    color: 'text-cyan-500', bgColor: 'bg-cyan-500/10',
  },
  {
    id: 'tutor', label: 'Tuteur Éducatif',
    description: 'Enseignement personnalisé, explications et exercices pratiques',
    icon: 'BookOpen', category: 'Productivité',
    systemPrompt: 'Tu es un tuteur éducatif patient et pédagogique. Tu expliques des concepts complexes de manière simple et progressive, adaptes ton niveau au profil de l\'apprenant, et crées des exercices pratiques. Tu utilises des analogies, des exemples concrets et des métaphores.',
    localSkills: ['writing', 'translation'], recommendedModel: 'openai/gpt-4o', recommendedTemperature: 0.6,
    color: 'text-lime-600', bgColor: 'bg-lime-600/10',
  },
];

const MODEL_OPTIONS = [
  { value: 'default', label: 'Automatique (recommandé)' },
  { value: 'groq/llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
  { value: 'groq/llama-3.1-8b-instant', label: 'Llama 3.1 8B (rapide)' },
  { value: 'openai/gpt-4o', label: 'GPT-4o' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'openai/o3-mini', label: 'o3-mini' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku (rapide)' },
  { value: 'anthropic/claude-4-sonnet', label: 'Claude 4 Sonnet' },
  { value: 'openrouter/llama-3.1-8b', label: 'Llama 3.1 8B (gratuit)' },
];

// Local skill labels for display
const LOCAL_SKILL_LABELS: Record<string, string> = {
  web_search: 'Recherche web',
  code_generation: 'Génération de code',
  data_analysis: 'Analyse de données',
  writing: 'Rédaction',
  translation: 'Traduction',
  image_generation: 'Génération d\'images',
  email: 'Email',
  document_analysis: 'Analyse de documents',
};

// ─── Component ────────────────────────────────────────────────

export function AgentCreateDialog({ open, onOpenChange, onSuccess, editAgent }: AgentCreateDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // ── Form state ──────────────────────────────
  const parseConfig = (configStr: string): Record<string, unknown> => {
    try { return JSON.parse(configStr || '{}'); } catch { return {}; }
  };

  const existingConfig = editAgent ? parseConfig(editAgent.config) : {};
  const existingSkills: string[] = Array.isArray(existingConfig.skills)
    ? (existingConfig.skills as string[]) : [];
  const existingKnowledge = (existingConfig.knowledge as string) || '';

  const [name, setName] = useState(editAgent?.name || '');
  const [description, setDescription] = useState(editAgent?.description || '');
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(
    (existingConfig.systemPrompt as string) || ''
  );
  const [knowledge, setKnowledge] = useState(existingKnowledge);
  const [model, setModel] = useState((existingConfig.model as string) || 'default');
  const [temperature, setTemperature] = useState(
    typeof existingConfig.temperature === 'number'
      ? (existingConfig.temperature as number) : 0.7
  );

  // ── Derived: selected type definition ─────────
  const selectedType = useMemo(
    () => AGENT_TYPE_CATALOG.find((t) => t.id === selectedTypeId),
    [selectedTypeId]
  );

  // Auto-detected skills from the selected type
  const autoSkills = useMemo(() => {
    if (!selectedType) return [];
    return selectedType.localSkills;
  }, [selectedType]);

  // ── Effects ──────────────────────────────────

  // Map existing agent type to a type ID when editing
  useEffect(() => {
    if (editAgent && !selectedTypeId) {
      // Try to find matching type from the new catalog
      const oldToNew: Record<string, string> = {
        custom: 'general_assistant', support: 'customer_support',
        sales: 'sales_agent', marketing: 'copywriter',
        research: 'researcher', social_media: 'social_media_manager',
        browser: 'general_assistant', rh: 'hr_assistant',
        accounting: 'financial_analyst',
      };
      const mapped = oldToNew[editAgent.type] || 'general_assistant';
      setSelectedTypeId(mapped);
    }
  }, [editAgent, selectedTypeId]);

  // Auto-fill system prompt, model, temperature when type changes
  useEffect(() => {
    if (selectedType && !editAgent) {
      setSystemPrompt(selectedType.systemPrompt);
      setModel(selectedType.recommendedModel);
      setTemperature(selectedType.recommendedTemperature);
    }
  }, [selectedType, editAgent]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setName(editAgent?.name || '');
      setDescription(editAgent?.description || '');
      setSelectedTypeId('');
      setSystemPrompt(editAgent ? ((existingConfig.systemPrompt as string) || '') : '');
      setKnowledge(editAgent ? ((existingConfig.knowledge as string) || '') : '');
      setModel((existingConfig.model as string) || 'default');
      setTemperature(
        typeof existingConfig.temperature === 'number'
          ? (existingConfig.temperature as number) : 0.7
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Group types by category ──────────────────
  const typesByCategory = useMemo(() => {
    const groups: Record<string, AgentTypeOption[]> = {};
    for (const t of AGENT_TYPE_CATALOG) {
      if (!groups[t.category]) groups[t.category] = [];
      groups[t.category].push(t);
    }
    return groups;
  }, []);

  // ── Submit ───────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: 'Erreur', description: 'Le nom est requis', variant: 'destructive' });
      return;
    }
    if (!selectedTypeId) {
      toast({ title: 'Erreur', description: 'Veuillez sélectionner un type d\'agent', variant: 'destructive' });
      return;
    }

    const agentType = editAgent?.type || selectedTypeId;
    setLoading(true);

    try {
      const config = {
        systemPrompt,
        skills: autoSkills,
        knowledge,
        model,
        temperature,
        agentTypeId: selectedTypeId,
      };

      if (editAgent) {
        await apiFetch(`/api/agents/${editAgent.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            type: agentType,
            config,
          }),
        });
        toast({ title: 'Agent modifié', description: `${name} a été mis à jour avec succès` });
      } else {
        await apiFetch('/api/agents', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            type: agentType,
            description: description.trim(),
            config,
          }),
        });
        toast({ title: 'Agent créé', description: `${name} a été créé avec succès` });
      }

      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur serveur';
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-[#06b6d4]" />
            {editAgent ? "Modifier l'agent" : 'Créer un agent IA'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <ScrollArea className="flex-1 px-6">
            <div className="pb-6 space-y-6 pt-4">
              {/* ── Step 1: Nom ──────────────────── */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Nom de l'agent <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="Ex : Assistant Marketing Pro"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  className="rounded-xl"
                />
                <p className="text-[10px] text-muted-foreground text-right">
                  {name.length}/100
                </p>
              </div>

              {/* ── Step 2: Sélection du type (20 choix) ── */}
              <div className="space-y-3">
                <Label className="text-base flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-[#06b6d4]" />
                  Type d'agent <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Choisissez le type d'agent adapté à votre besoin. Les compétences seront automatiquement sélectionnées selon le type.
                </p>

                <div className="space-y-4">
                  {Object.entries(typesByCategory).map(([category, types]) => (
                    <div key={category}>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        {category}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {types.map((type) => {
                          const Icon = getIcon(type.icon);
                          const isSelected = selectedTypeId === type.id;
                          return (
                            <button
                              key={type.id}
                              type="button"
                              onClick={() => setSelectedTypeId(type.id)}
                              className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                                isSelected
                                  ? 'border-[#06b6d4]/40 bg-[#06b6d4]/5 ring-1 ring-[#06b6d4]/20'
                                  : 'border-border/50 bg-card hover:border-[#06b6d4]/20 hover:bg-accent/30'
                              }`}
                            >
                              <div className={`mt-0.5 p-1.5 rounded-lg ${isSelected ? type.bgColor : 'bg-muted'}`}>
                                <Icon className={`h-4 w-4 ${isSelected ? type.color : 'text-muted-foreground'}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className={`text-sm font-medium ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                                  {type.label}
                                </span>
                                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                                  {type.description}
                                </p>
                              </div>
                              <div
                                className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border transition-colors mt-0.5 ${
                                  isSelected
                                    ? 'bg-[#06b6d4] border-[#06b6d4] text-white'
                                    : 'border-border'
                                }`}
                              >
                                {isSelected && <Check className="h-3 w-3" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* ── Step 3: Prompt système ────────── */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#06b6d4]" />
                  Prompt système
                </Label>
                <Textarea
                  placeholder="Instructions détaillées pour l'agent..."
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={5}
                  className="rounded-xl resize-none"
                />
                <p className="text-[10px] text-muted-foreground">
                  Pré-rempli automatiquement selon le type choisi. Personnalisez-le selon vos besoins.
                </p>
              </div>

              {/* ── Auto-selected skills preview ──── */}
              {autoSkills.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    Compétences auto-sélectionnées
                    <Badge variant="secondary" className="text-[10px] px-1.5">
                      {autoSkills.length}
                    </Badge>
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {autoSkills.map((skillId) => (
                      <Badge
                        key={skillId}
                        variant="outline"
                        className="text-xs border-[#06b6d4]/30 text-[#06b6d4] bg-[#06b6d4]/5"
                      >
                        {LOCAL_SKILL_LABELS[skillId] || skillId}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Les compétences sont automatiquement attribuées selon le type d'agent. Le serveur enrichit aussi l'agent avec des skills de l'écosystème skills.sh.
                  </p>
                </div>
              )}

              <Separator />

              {/* ── Step 4: Connaissances ──────────── */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-[#06b6d4]" />
                  Connaissances personnalisées
                </Label>
                <Textarea
                  placeholder="Ajoutez des instructions, contextes ou informations spécifiques que l'agent pourra utiliser comme référence..."
                  value={knowledge}
                  onChange={(e) => setKnowledge(e.target.value)}
                  rows={4}
                  className="rounded-xl resize-none"
                />
                <p className="text-[10px] text-muted-foreground">
                  Ces informations seront incluses dans le contexte de l'agent lors de chaque conversation.
                </p>
              </div>

              <Separator />

              {/* ── Step 5: Modèle et température ──── */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5" />
                  Modèle IA
                </Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Recommandé selon le type : {MODEL_OPTIONS.find((m) => m.value === (selectedType?.recommendedModel || 'default'))?.label || 'Automatique'}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Température</Label>
                  <span className="text-sm font-mono text-[#06b6d4]">{temperature.toFixed(1)}</span>
                </div>
                <Slider
                  value={[temperature]}
                  onValueChange={([val]) => setTemperature(val)}
                  min={0} max={2} step={0.1}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0.0 — Précis</span>
                  <span>1.0 — Équilibré</span>
                  <span>2.0 — Créatif</span>
                </div>
              </div>

              {/* ── Summary card ──────────────────── */}
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-3">
                <h4 className="text-sm font-semibold">Résumé de la configuration</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-muted-foreground">Nom :</div>
                  <div className="font-medium">{name || '—'}</div>
                  <div className="text-muted-foreground">Type :</div>
                  <div className="font-medium">{selectedType?.label || '—'}</div>
                  <div className="text-muted-foreground">Compétences :</div>
                  <div className="font-medium">{autoSkills.length} auto-sélectionnée{autoSkills.length !== 1 ? 's' : ''}</div>
                  <div className="text-muted-foreground">Modèle :</div>
                  <div className="font-medium">
                    {MODEL_OPTIONS.find((m) => m.value === model)?.label || 'Automatique'}
                  </div>
                  <div className="text-muted-foreground">Température :</div>
                  <div className="font-medium">{temperature.toFixed(1)}</div>
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* ── Footer ────────────────────────────── */}
          <div className="flex items-center justify-end gap-2 border-t px-6 py-3 mt-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim() || !selectedTypeId}
              className="rounded-xl bg-[#06b6d4] hover:bg-[#06b6d4]/90 text-white"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editAgent ? 'Enregistrer' : "Créer l'agent"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
