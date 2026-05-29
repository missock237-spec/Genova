/**
 * Billing System — Index
 *
 * Re-exports all billing modules for convenient imports.
 */

// Stripe Integration
export {
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  getSubscription,
  type CheckoutSessionInput,
  type PortalSessionInput,
  type SubscriptionInfo,
} from './stripe-client';

// Credit System
export {
  checkCredits,
  deductCredits,
  addCredits,
  getCreditBalance,
  getUsageHistory,
  initializeUserCredits,
  purchaseCredits,
  CREDIT_COSTS,
  type CreditCheckResult,
  type DeductCreditsInput,
  type AddCreditsInput,
  type UsageHistoryEntry,
  type CreditType,
  type ResourceType,
} from './credits';

// Subscription Plans
export {
  PLANS,
  CREDIT_PACKAGES,
  PLAN_CREDITS,
  getPlan,
  comparePlans,
  hasPlanFeature,
  getPlanLimit,
  changePlan,
  getPlanComparison,
  type PlanTier,
  type Plan,
  type PlanFeature,
  type CreditPackage,
} from './plans';

// Usage Metering
export {
  recordUsage,
  getUsageForPeriod,
  checkQuota,
  getUsageTrends,
  getUsageStats,
  type UsageResource,
  type BillingPeriod,
  type UsageRecord,
  type UsageSummary,
  type QuotaCheckResult,
} from './usage-meter';
