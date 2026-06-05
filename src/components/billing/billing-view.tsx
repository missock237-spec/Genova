'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Crown,
  Zap,
  Check,
  ArrowRight,
  Loader2,
  CreditCard,
  BarChart3,
  Coins,
  TrendingUp,
  Shield,
  Bot,
  Globe,
  FileText,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/lib/store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: string;
  credits: number;
  features: Array<{
    name: string;
    included: boolean;
    limit?: number | string;
  }>;
  highlighted?: boolean;
  badge?: string;
}

interface CreditInfo {
  balance: number;
  isUnlimited: boolean;
  packages: Array<{
    id: string;
    name: string;
    credits: number;
    price: number;
    currency: string;
    pricePerCredit: number;
  }>;
  history?: Array<{
    id: string;
    amount: number;
    balance: number;
    type: string;
    resourceType: string;
    description: string;
    createdAt: string;
  }>;
}

interface UsageInfo {
  usage: {
    resources: Array<{
      resource: string;
      used: number;
      limit: number;
      percentage: number;
      exceeded: boolean;
    }>;
    totalCreditsUsed: number;
    totalCreditsRemaining: number;
  };
  stats: {
    totalAgents: number;
    totalTasks: number;
    totalScheduledTasks: number;
    totalWebMonitors: number;
    totalReports: number;
    monthlyApiCalls: number;
    monthlyCost: number;
    monthlyTokens: number;
  };
  trends?: Array<{
    date: string;
    tasks: number;
    apiCalls: number;
    cost: number;
    tokens: number;
  }>;
}

interface SubscriptionInfo {
  subscription: {
    id: string;
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  currentPlan: {
    id: string;
    name: string;
    price: number;
    credits: number;
  } | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BillingView() {
  const { toast } = useToast();
  const { user } = useAuthStore();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [creditInfo, setCreditInfo] = useState<CreditInfo | null>(null);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    try {
      // Plans are defined client-side for now (could be from API)
      const res = await fetch('/api/billing/subscription');
      if (res.ok) {
        const data = await res.json();
        setSubscriptionInfo(data);
      }
    } catch {
      // Non-critical
    }
  }, []);

  const fetchCredits = useCallback(async () => {
    try {
      const data = await apiFetch<CreditInfo>('/api/billing/credits?history=true');
      setCreditInfo(data);
    } catch {
      // Non-critical
    }
  }, []);

  const fetchUsage = useCallback(async () => {
    try {
      const data = await apiFetch<UsageInfo>('/api/billing/usage?period=monthly&trends=true');
      setUsageInfo(data);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchPlans(), fetchCredits(), fetchUsage()]);
      setLoading(false);
    };
    load();
  }, [fetchPlans, fetchCredits, fetchUsage]);

  // Define plans client-side (same as plans.ts)
  const planList: Plan[] = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      currency: 'usd',
      interval: 'month',
      credits: 100,
      features: [
        { name: '2 AI Agents', included: true },
        { name: '100 credits/month', included: true },
        { name: 'Basic agent tools', included: true },
        { name: '3 scheduled tasks', included: true },
        { name: 'Advanced guardrails', included: false },
        { name: 'Web monitors', included: false },
        { name: 'Priority support', included: false },
      ],
    },
    {
      id: 'starter',
      name: 'Starter',
      price: 9,
      currency: 'usd',
      interval: 'month',
      credits: 1000,
      features: [
        { name: '5 AI Agents', included: true },
        { name: '1,000 credits/month', included: true },
        { name: 'All agent tools', included: true },
        { name: '10 scheduled tasks', included: true },
        { name: '5 web monitors', included: true },
        { name: 'Advanced guardrails', included: true },
        { name: 'Priority support', included: false },
      ],
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 29,
      currency: 'usd',
      interval: 'month',
      credits: 5000,
      highlighted: true,
      badge: 'Most Popular',
      features: [
        { name: '20 AI Agents', included: true },
        { name: '5,000 credits/month', included: true },
        { name: 'All tools + advanced', included: true },
        { name: '50 scheduled tasks', included: true },
        { name: '25 web monitors', included: true },
        { name: 'Auto-reports', included: true },
        { name: 'Priority support', included: true },
      ],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 99,
      currency: 'usd',
      interval: 'month',
      credits: -1,
      badge: 'Best Value',
      features: [
        { name: 'Unlimited Agents', included: true },
        { name: 'Unlimited credits', included: true },
        { name: 'All tools & features', included: true },
        { name: 'Unlimited tasks', included: true },
        { name: 'SSO & SAML', included: true },
        { name: 'Custom integrations', included: true },
        { name: 'SLA guarantee', included: true },
      ],
    },
  ];

  const handleUpgrade = async (planId: string) => {
    setUpgrading(planId);
    try {
      await apiFetch('/api/billing/subscription', {
        method: 'PUT',
        body: JSON.stringify({ planId }),
      });
      toast({ title: 'Upgrade initiated', description: 'Complete the payment to activate your new plan.' });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to upgrade', variant: 'destructive' });
    } finally {
      setUpgrading(null);
    }
  };

  const handlePurchaseCredits = async (packageId: string) => {
    setPurchasing(packageId);
    try {
      await apiFetch('/api/billing/credits', {
        method: 'POST',
        body: JSON.stringify({ packageId }),
      });
      toast({ title: 'Purchase initiated', description: 'Complete the payment to add credits.' });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to purchase credits', variant: 'destructive' });
    } finally {
      setPurchasing(null);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const data = await apiFetch<{ url: string }>('/api/billing/portal', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      toast({ title: 'Error', description: 'No active subscription to manage', variant: 'destructive' });
    }
  };

  const currentPlanId = subscriptionInfo?.currentPlan?.id || user?.plan || 'free';

  const getResourceIcon = (resource: string) => {
    switch (resource) {
      case 'agents': return Bot;
      case 'tasks': return Check;
      case 'scheduledTasks': return Clock;
      case 'webMonitors': return Globe;
      case 'reports': return FileText;
      case 'apiCalls': return Zap;
      case 'storage': return Shield;
      default: return BarChart3;
    }
  };

  const formatResourceName = (resource: string) => {
    return resource.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing & Credits</h1>
          <p className="text-muted-foreground mt-1">
            Manage your subscription, credits, and monitor usage.
          </p>
        </div>
        {currentPlanId !== 'free' && (
          <Button variant="outline" size="sm" onClick={handleManageSubscription}>
            <CreditCard className="h-4 w-4 mr-2" />
            Manage Subscription
          </Button>
        )}
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Current Plan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              <span className="text-2xl font-bold capitalize">{currentPlanId}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Credit Balance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-emerald-500" />
              <span className="text-2xl font-bold">
                {creditInfo?.isUnlimited ? '∞' : (creditInfo?.balance ?? 0).toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Credits Used This Month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{usageInfo?.usage.totalCreditsUsed.toLocaleString() || 0}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monthly Cost</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-purple-500" />
              <span className="text-2xl font-bold">${usageInfo?.stats.monthlyCost.toFixed(2) || '0.00'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="plans" className="space-y-4">
        <TabsList>
          <TabsTrigger value="plans">
            <Crown className="h-4 w-4 mr-2" />
            Plans
          </TabsTrigger>
          <TabsTrigger value="credits">
            <Coins className="h-4 w-4 mr-2" />
            Credits
          </TabsTrigger>
          <TabsTrigger value="usage">
            <BarChart3 className="h-4 w-4 mr-2" />
            Usage
          </TabsTrigger>
        </TabsList>

        {/* Plans Tab */}
        <TabsContent value="plans">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {planList.map((plan) => {
              const isCurrentPlan = plan.id === currentPlanId;
              const isDowngrade = planList.findIndex(p => p.id === plan.id) < planList.findIndex(p => p.id === currentPlanId);

              return (
                <Card
                  key={plan.id}
                  className={`relative ${plan.highlighted ? 'border-primary shadow-lg' : ''} ${isCurrentPlan ? 'ring-2 ring-primary' : ''}`}
                >
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground shadow-sm">{plan.badge}</Badge>
                    </div>
                  )}
                  <CardHeader className="text-center pt-6">
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <div className="mt-2">
                      <span className="text-3xl font-bold">${plan.price}</span>
                      <span className="text-muted-foreground">/mo</span>
                    </div>
                    <CardDescription>
                      {plan.credits === -1 ? 'Unlimited credits' : `${plan.credits.toLocaleString()} credits/mo`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {feature.included ? (
                          <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                        ) : (
                          <span className="h-4 w-4 flex-shrink-0 text-muted-foreground/30">—</span>
                        )}
                        <span className={feature.included ? '' : 'text-muted-foreground/50'}>
                          {feature.name}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                  <CardFooter>
                    {isCurrentPlan ? (
                      <Button variant="outline" className="w-full" disabled>
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        variant={plan.highlighted ? 'default' : 'outline'}
                        onClick={() => handleUpgrade(plan.id)}
                        disabled={upgrading === plan.id}
                      >
                        {upgrading === plan.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <ArrowRight className="h-4 w-4 mr-2" />
                        )}
                        {isDowngrade ? 'Downgrade' : 'Upgrade'}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Credits Tab */}
        <TabsContent value="credits" className="space-y-6">
          {/* Credit Balance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-emerald-500" />
                Credit Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 mb-4">
                <span className="text-4xl font-bold">
                  {creditInfo?.isUnlimited ? '∞' : (creditInfo?.balance ?? 0).toLocaleString()}
                </span>
                <span className="text-muted-foreground mb-1">credits</span>
              </div>
              {!creditInfo?.isUnlimited && (
                <Progress value={Math.min(100, ((creditInfo?.balance ?? 0) / 5000) * 100)} className="h-2" />
              )}
            </CardContent>
          </Card>

          {/* Purchase Credits */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Purchase Credits</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {creditInfo?.packages.map((pkg) => (
                <Card key={pkg.id} className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handlePurchaseCredits(pkg.id)}>
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-lg">{pkg.name}</CardTitle>
                    <div className="mt-1">
                      <span className="text-2xl font-bold">${pkg.price}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="text-center">
                    <p className="text-xs text-muted-foreground">
                      ${pkg.pricePerCredit.toFixed(4)} per credit
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={purchasing === pkg.id}
                    >
                      {purchasing === pkg.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      Buy Now
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>

          {/* Credit History */}
          {creditInfo?.history && creditInfo.history.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Recent Transactions</h3>
              <ScrollArea className="max-h-96">
                <div className="space-y-2">
                  {creditInfo.history.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="text-sm font-medium">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <span className={`font-medium ${tx.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount}
                        </span>
                        <p className="text-xs text-muted-foreground">Balance: {tx.balance === -1 ? '∞' : tx.balance}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-6">
          {/* Resource Usage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-500" />
                Resource Usage
              </CardTitle>
              <CardDescription>Current billing period usage vs plan limits</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {usageInfo?.usage.resources.map((resource) => {
                  const Icon = getResourceIcon(resource.resource);
                  return (
                    <div key={resource.resource} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{formatResourceName(resource.resource)}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {resource.used.toLocaleString()} / {resource.limit === -1 ? '∞' : resource.limit.toLocaleString()}
                        </span>
                      </div>
                      {resource.limit !== -1 && (
                        <Progress
                          value={Math.min(100, resource.percentage)}
                          className={`h-2 ${resource.exceeded ? 'bg-red-100' : ''}`}
                        />
                      )}
                      {resource.limit === -1 && (
                        <div className="h-2 rounded-full bg-emerald-100">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: '5%' }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <Bot className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">{usageInfo?.stats.totalAgents || 0}</p>
                <p className="text-xs text-muted-foreground">Total Agents</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Check className="h-6 w-6 mx-auto mb-2 text-emerald-500" />
                <p className="text-2xl font-bold">{usageInfo?.stats.totalTasks || 0}</p>
                <p className="text-xs text-muted-foreground">Tasks This Month</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Globe className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                <p className="text-2xl font-bold">{usageInfo?.stats.totalWebMonitors || 0}</p>
                <p className="text-xs text-muted-foreground">Web Monitors</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Zap className="h-6 w-6 mx-auto mb-2 text-amber-500" />
                <p className="text-2xl font-bold">{usageInfo?.stats.monthlyApiCalls.toLocaleString() || 0}</p>
                <p className="text-xs text-muted-foreground">API Calls</p>
              </CardContent>
            </Card>
          </div>

          {/* Usage Trends */}
          {usageInfo?.trends && usageInfo.trends.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-purple-500" />
                  Usage Trends (Last 30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-64">
                  <div className="space-y-2">
                    {usageInfo.trends.slice(-14).map((day) => (
                      <div key={day.date} className="flex items-center justify-between p-2 rounded border text-sm">
                        <span className="text-muted-foreground w-24">{day.date}</span>
                        <div className="flex gap-6">
                          <span>{day.tasks} tasks</span>
                          <span>{day.apiCalls} API calls</span>
                          <span>${day.cost.toFixed(4)}</span>
                          <span>{day.tokens.toLocaleString()} tokens</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
