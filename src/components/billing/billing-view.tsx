'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CreditCard, Loader2, Check, Zap, Crown, ArrowUpRight, Clock,
  ChevronDown, ChevronUp, X, AlertCircle, CheckCircle2, Coins,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

// ============================================================
// Types
// ============================================================

interface Plan {
  id: string;
  name: string;
  price: number;
  priceUSD: number;
  credits: number;
  highlighted?: boolean;
  badge?: string;
  features: { name: string; included: boolean; limit?: number | string }[];
  limits: Record<string, number>;
}

interface CreditPack {
  id: string;
  name: string;
  credits: number;
  price: number;
  pricePerCredit: number;
}

interface BillingData {
  subscription: { plan: string; status: string; currentPeriodEnd: string | null };
  currentPlan: Plan | null;
  credits: { balance: number };
}

// ============================================================
// Constants (mirror billing/plans.ts)
// ============================================================

const PLANS: Plan[] = [
  {
    id: 'free', name: 'Gratuit', price: 0, priceUSD: 0, credits: 100,
    features: [
      { name: '2 Agents IA', included: true, limit: 2 },
      { name: '100 crédits/mois', included: true },
      { name: 'Outils de base', included: true },
      { name: 'Tâches planifiées', included: true, limit: 3 },
      { name: 'Support communautaire', included: true },
      { name: 'Guardrails avancés', included: false },
      { name: 'Espace équipe', included: false },
    ],
    limits: { agents: 2, tasks: 50 },
  },
  {
    id: 'starter', name: 'Starter', price: 5000, priceUSD: 9.99, credits: 1000,
    features: [
      { name: '5 Agents IA', included: true, limit: 5 },
      { name: '1 000 crédits/mois', included: true },
      { name: 'Tous les outils', included: true },
      { name: 'Tâches planifiées', included: true, limit: 10 },
      { name: 'Web monitors', included: true, limit: 5 },
      { name: 'Guardrails avancés', included: true },
      { name: 'Support email', included: true },
      { name: 'Espace équipe', included: false },
    ],
    limits: { agents: 5, tasks: 500 },
  },
  {
    id: 'pro', name: 'Pro', price: 15000, priceUSD: 29.99, credits: 5000,
    highlighted: true, badge: 'Populaire',
    features: [
      { name: '20 Agents IA', included: true, limit: 20 },
      { name: '5 000 crédits/mois', included: true },
      { name: 'Tous les outils + avancés', included: true },
      { name: 'Tâches planifiées', included: true, limit: 50 },
      { name: 'Web monitors', included: true, limit: 25 },
      { name: 'Guardrails avancés', included: true },
      { name: 'Support prioritaire', included: true },
      { name: 'Rapports auto', included: true },
      { name: 'Équipe (5 membres)', included: true, limit: 5 },
    ],
    limits: { agents: 20, tasks: -1 },
  },
  {
    id: 'enterprise', name: 'Enterprise', price: 50000, priceUSD: 99.99, credits: 25000,
    badge: 'Meilleur rapport',
    features: [
      { name: 'Agents IA illimités', included: true },
      { name: '25 000 crédits/mois', included: true },
      { name: 'Toutes les fonctionnalités', included: true },
      { name: 'Tâches illimitées', included: true },
      { name: 'Support dédié', included: true },
      { name: 'SSO & SAML', included: true },
      { name: 'Équipe illimitée', included: true },
      { name: 'Intégrations sur mesure', included: true },
      { name: 'SLA garanti', included: true },
    ],
    limits: { agents: -1, tasks: -1 },
  },
];

const CREDIT_PACKS: CreditPack[] = [
  { id: 'credits_100', name: '100 crédits', credits: 100, price: 2500, pricePerCredit: 25 },
  { id: 'credits_500', name: '500 crédits', credits: 500, price: 10000, pricePerCredit: 20 },
  { id: 'credits_2000', name: '2 000 crédits', credits: 2000, price: 30000, pricePerCredit: 15 },
  { id: 'credits_5000', name: '5 000 crédits', credits: 5000, price: 65000, pricePerCredit: 13 },
];

const OPERATORS = [
  { id: 'orange', label: 'Orange Money', color: 'text-orange-500' },
  { id: 'mtn', label: 'MTN MoMo', color: 'text-yellow-500' },
  { id: 'wave', label: 'Wave', color: 'text-blue-500' },
  { id: 'card', label: 'Carte bancaire', color: 'text-gray-500' },
];

// ============================================================
// Component
// ============================================================

export function BillingView() {
  const { toast } = useToast();
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showCreditPacks, setShowCreditPacks] = useState(false);
  const [showTxHistory, setShowTxHistory] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  // Checkout modal state
  const [checkoutModal, setCheckoutModal] = useState<{ open: boolean; type: 'plan' | 'credits'; id: string; name: string; price: number }>({ open: false, type: 'plan', id: '', name: '', price: 0 });
  const [selectedOperator, setSelectedOperator] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const currentPlan = billing?.subscription?.plan || 'free';

  // Fetch billing data
  const fetchBilling = useCallback(async () => {
    try {
      const res = await apiFetch('/api/billing/subscription');
      if (res.ok) {
        const data = await res.json();
        setBilling(data);
      }
    } catch {
      // Fallback: afficher le plan free
      setBilling({
        subscription: { plan: 'free', status: 'active', currentPeriodEnd: null },
        currentPlan: PLANS[0],
        credits: { balance: 0 },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBilling(); }, [fetchBilling]);

  // Check for checkout result in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get('checkout');
    const plan = params.get('plan');
    if (checkoutStatus === 'success' && plan) {
      toast({ title: 'Paiement réussi !', description: `Votre plan ${plan} a été activé.`, variant: 'default' });
      // Clean URL
      window.history.replaceState({}, '', '/billing');
      fetchBilling();
    } else if (checkoutStatus === 'cancelled') {
      toast({ title: 'Paiement annulé', description: 'Votre paiement a été annulé.', variant: 'destructive' });
      window.history.replaceState({}, '', '/billing');
    }
  }, [checkoutModal.open]);

  // Fetch transaction history
  const fetchTransactions = useCallback(async () => {
    if (showTxHistory && transactions.length === 0) {
      setTxLoading(true);
      try {
        const res = await apiFetch('/api/billing/credits');
        if (res.ok) {
          const data = await res.json();
          setTransactions(data.transactions || []);
        }
      } catch { /* ignore */ }
      finally { setTxLoading(false); }
    }
  }, [showTxHistory, transactions.length]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  // ============================================================
  // Checkout handler
  // ============================================================

  const handleCheckout = async () => {
    if (!selectedOperator) {
      toast({ title: 'Opérateur requis', description: 'Sélectionnez votre opérateur de paiement.', variant: 'destructive' });
      return;
    }
    if (selectedOperator !== 'card' && !phoneNumber.match(/^\+?[237]\d{8,9}$/)) {
      toast({ title: 'Numéro invalide', description: 'Entrez un numéro de téléphone valide (ex: +237 6XX XXX XXX).', variant: 'destructive' });
      return;
    }

    setCheckoutLoading(true);
    try {
      const endpoint = checkoutModal.type === 'plan'
        ? '/api/billing/checkout'
        : '/api/billing/purchase-credits';

      const body: Record<string, string> = { operator: selectedOperator };
      if (checkoutModal.type === 'plan') {
        body.planId = checkoutModal.id;
      } else {
        body.packId = checkoutModal.id;
      }
      if (phoneNumber) body.phone = phoneNumber;

      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({ title: 'Erreur', description: data.error || 'Erreur de paiement', variant: 'destructive' });
        return;
      }

      // Rediriger vers Chariow si URL fournie
      if (data.url) {
        setCheckoutModal(prev => ({ ...prev, open: false }));
        window.location.href = data.url;
      } else if (data.success) {
        toast({ title: 'Succès', description: data.message || 'Opération réussie !' });
        setCheckoutModal(prev => ({ ...prev, open: false }));
        fetchBilling();
      }
    } catch {
      toast({ title: 'Erreur réseau', description: 'Vérifiez votre connexion et réessayez.', variant: 'destructive' });
    } finally {
      setCheckoutLoading(false);
    }
  };

  // ============================================================
  // Cancel subscription
  // ============================================================

  const handleCancelSubscription = async () => {
    try {
      const res = await apiFetch('/api/billing/subscription', { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Abonnement résilié', description: data.message });
        fetchBilling();
      }
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de résilier.', variant: 'destructive' });
    }
  };

  // ============================================================
  // Loading state
  // ============================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-[#06b6d4]" />
      </div>
    );
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Facturation</h1>
        <p className="text-muted-foreground">Gérez votre abonnement et vos crédits</p>
      </div>

      {/* Current plan + Credits summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Plan actuel */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="h-5 w-5 text-[#06b6d4]" />
              Abonnement actuel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Plan</span>
                <Badge variant={currentPlan === 'free' ? 'secondary' : 'default'} className="capitalize">
                  {PLANS.find(p => p.id === currentPlan)?.name || currentPlan}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Statut</span>
                <span className="text-green-500 font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Actif
                </span>
              </div>
              {billing?.subscription?.currentPeriodEnd && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expire le</span>
                  <span className="text-sm flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString('fr-FR')}
                  </span>
                </div>
              )}
              {currentPlan !== 'free' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2 text-destructive hover:text-destructive rounded-lg"
                  onClick={handleCancelSubscription}
                >
                  Résilier l'abonnement
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Crédits */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-5 w-5 text-amber-500" />
              Crédits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-2">
              <p className="text-3xl font-bold text-[#06b6d4]">
                {billing?.credits?.balance?.toLocaleString() || '0'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">crédits disponibles</p>
            </div>
            <Button
              className="w-full mt-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => setShowCreditPacks(!showCreditPacks)}
            >
              <Coins className="h-4 w-4 mr-2" />
              Acheter des crédits
            </Button>
          </CardContent>
        </Card>

        {/* Méthodes de paiement */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-5 w-5" />
              Méthodes de paiement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {OPERATORS.map(op => (
                <div key={op.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className={`text-sm font-medium ${op.color}`}>{op.label}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">Disponible</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">
              Paiements sécurisés via Chariow
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Plan selection */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Choisir un plan</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map(plan => {
            const isCurrent = currentPlan === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative bg-card border rounded-xl p-5 transition-all ${
                  plan.highlighted
                    ? 'border-[#06b6d4]/50 ring-1 ring-[#06b6d4]/20'
                    : isCurrent
                      ? 'border-[#06b6d4] bg-[#06b6d4]/5'
                      : 'border-border/50 hover:border-[#06b6d4]/30'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-[#06b6d4] text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full">
                    {plan.badge}
                  </span>
                )}

                <div className="text-center mb-4">
                  <h3 className="text-base font-semibold">{plan.name}</h3>
                  <div className="mt-2">
                    <span className="text-2xl font-bold">
                      {plan.price === 0 ? 'Gratuit' : `${plan.price.toLocaleString('fr-FR')} FCFA`}
                    </span>
                    {plan.price > 0 && <span className="text-muted-foreground text-xs">/mois</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {plan.credits === -1 ? 'Crédits illimités' : `${plan.credits.toLocaleString('fr-FR')} crédits/mois`}
                  </p>
                </div>

                <ul className="space-y-1.5 mb-5">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      {f.included ? (
                        <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
                      ) : (
                        <X className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                      )}
                      <span className={f.included ? 'text-foreground' : 'text-muted-foreground/50'}>
                        {f.name}
                        {f.limit && typeof f.limit === 'number' && f.limit > 0 && !Number.isNaN(f.limit) && (
                          <span className="text-muted-foreground ml-1">({f.limit})</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button className="w-full rounded-lg" variant="outline" disabled>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Plan actuel
                  </Button>
                ) : plan.price === 0 ? (
                  <Button
                    className="w-full rounded-lg"
                    variant="outline"
                    onClick={async () => {
                      setCheckoutLoading(true);
                      try {
                        const res = await apiFetch('/api/billing/subscription', {
                          method: 'PUT',
                          body: JSON.stringify({ planId: 'free' }),
                        });
                        const data = await res.json();
                        toast({ title: data.success ? 'Succès' : 'Erreur', description: data.message });
                        if (data.success) fetchBilling();
                      } catch {
                        toast({ title: 'Erreur réseau', variant: 'destructive' });
                      } finally { setCheckoutLoading(false); }
                    }}
                    disabled={checkoutLoading}
                  >
                    {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Activer'}
                  </Button>
                ) : (
                  <Button
                    className={`w-full rounded-lg ${plan.highlighted ? 'bg-[#06b6d4] hover:bg-[#06b6d4]/90 text-white' : ''}`}
                    onClick={() => {
                      setCheckoutModal({ open: true, type: 'plan', id: plan.id, name: plan.name, price: plan.price });
                      setSelectedOperator('');
                      setPhoneNumber('');
                    }}
                  >
                    <ArrowUpRight className="h-4 w-4 mr-2" />
                    Choisir {plan.name}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Credit packs (expandable) */}
      {showCreditPacks && (
        <div className="space-y-4">
          <Separator />\n          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Acheter des crédits</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowCreditPacks(false)}>
              <ChevronUp className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CREDIT_PACKS.map(pack => (
              <Card key={pack.id} className="border-border/50 hover:border-amber-500/30 transition-all cursor-pointer"
                onClick={() => {
                  setCheckoutModal({ open: true, type: 'credits', id: pack.id, name: pack.name, price: pack.price });
                  setSelectedOperator('');
                  setPhoneNumber('');
                }}
              >
                <CardContent className="pt-5 text-center">
                  <Coins className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                  <h3 className="font-semibold">{pack.name}</h3>
                  <p className="text-2xl font-bold mt-2">{pack.price.toLocaleString('fr-FR')} <span className="text-sm font-normal text-muted-foreground">FCFA</span></p>
                  <p className="text-xs text-muted-foreground mt-1">{pack.pricePerCredit} FCFA/crédit</p>
                  <Button className="w-full mt-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white" size="sm">
                    Acheter
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Transaction history (expandable) */}
      <div className="space-y-3">
        <button
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowTxHistory(!showTxHistory)}
        >
          {showTxHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Historique des transactions
        </button>

        {showTxHistory && (
          <Card className="border-border/50">
            <CardContent className="pt-4">
              {txLoading ? (
                <div className="flex items-center justify-center h-20">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : transactions.length > 0 ? (
                <div className="space-y-2">
                  {transactions.slice(0, 20).map((tx: any) => (
                    <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          Number(tx.amount) > 0 ? 'bg-green-500/10' : 'bg-red-500/10'
                        }`}>
                          {Number(tx.amount) > 0
                            ? <ArrowUpRight className="h-4 w-4 text-green-500" />
                            : <ArrowUpRight className="h-4 w-4 text-red-500 rotate-90" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{tx.description || tx.type}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                          </p>
                        </div>
                      </div>
                      <span className={`text-sm font-semibold ${
                        Number(tx.amount) > 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {Number(tx.amount) > 0 ? '+' : ''}{tx.amount}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Aucune transaction pour le moment.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ============================================================ */}
      {/* Checkout Modal (Operator + Phone selection) */}
      {/* ============================================================ */}
      <Dialog open={checkoutModal.open} onOpenChange={(open) => setCheckoutModal(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[#06b6d4]" />
              Paiement
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
              <p className="text-sm font-medium">{checkoutModal.name}</p>
              <p className="text-2xl font-bold mt-1">
                {checkoutModal.price.toLocaleString('fr-FR')} FCFA
              </p>
            </div>

            <div className="space-y-2">
              <Label>Opérateur de paiement</Label>
              <Select value={selectedOperator} onValueChange={setSelectedOperator}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Sélectionnez votre opérateur..." />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map(op => (
                    <SelectItem key={op.id} value={op.id}>
                      <span className={op.color}>{op.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedOperator && selectedOperator !== 'card' && (
              <div className="space-y-2">
                <Label>Numéro de téléphone</Label>
                <Input
                  placeholder="+237 6XX XXX XXX"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="rounded-xl"
                  type="tel"
                />
                <p className="text-[10px] text-muted-foreground">
                  Entrez le numéro lié à votre compte {OPERATORS.find(o => o.id === selectedOperator)?.label}
                </p>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-muted-foreground">
                Vous serez redirigé vers Chariow, notre plateforme de paiement sécurisée.
                Aucun frais supplémentaire.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setCheckoutModal(prev => ({ ...prev, open: false }))}
              >
                Annuler
              </Button>
              <Button
                className="flex-1 rounded-xl bg-[#06b6d4] hover:bg-[#06b6d4]/90 text-white"
                onClick={handleCheckout}
                disabled={checkoutLoading || !selectedOperator}
              >
                {checkoutLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Payer maintenant'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
