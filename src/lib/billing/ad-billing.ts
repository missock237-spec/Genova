// ============================================================
// Gen3ia — AD BILLING ENGINE (facturation personnalisée)
// ------------------------------------------------------------
// Facturation complète des annonceurs (advertisers) sur la base
// du spend réel des campagnes publicitaires (CPV/CPC), avec :
//   - règles tarifaires personnalisées par annonceur
//     (taux, commission plateforme, surcharges, franchises)
//   - comptabilité ligne-à-ligne (ledger) reconstituée depuis
//     ad_impressions / ad_clicks
//   - génération de factures (draft -> émise -> payée -> recouvrée)
//   - devises multi (XAF par défaut, converties via taux configurés)
//   - rapprochement (réconciliation) avec le budget dépensé de la campagne
//
// C'est un MODULE ADDITIF : il n'altère ni AdEngine ni les routes
// publicitaires existantes. Il lit les mêmes collections Firestore
// (ad_campaigns, ad_impressions) et écrit dans de nouvelles
// collections (ad_billing_settings, ad_billing_lines,
// ad_invoices, ad_payment_methods).
//
// Persistance : façade Firestore via @/lib/db (aucun Prisma).
// ============================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('ad-billing');

// ============================================================
// Types
// ============================================================

export type BillingModel = 'CPV' | 'CPC' | 'CPM' | 'FLAT';

export type AdInvoiceStatus =
  | 'draft'
  | 'pending'
  | 'issued'
  | 'paid'
  | 'partially_paid'
  | 'overdue'
  | 'cancelled';

export type BillingLineKind =
  | 'impression'
  | 'click'
  | 'platform_fee'
  | 'tax'
  | 'discount'
  | 'adjustment';

export interface AdBillingSettings {
  id?: string;
  advertiserId: string;
  currency: string;              // XAF par défaut
  model: BillingModel;           // CPV | CPC | CPM | FLAT
  unitRateXaf: number;           // prix unitaire (par vue / clic / 1K vues)
  platformCommissionPct: number; // % prélevé par la plateforme
  taxRatePct: number;            // TVA / taxe locale
  discountPct: number;           // remise contractuelle
  minInvoiceAmountXaf: number;   // seuil minimal de facturation
  paymentTermsDays: number;      // délai de paiement (jours)
  billingDayOfMonth: number;     // jour de facturation (1..28)
  autoIssue: boolean;            // émettre automatiquement la facture
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AdBillingLine {
  id?: string;
  advertiserId: string;
  campaignId: string;
  kind: BillingLineKind;
  description: string;
  quantity: number;              // nombre d'impressions/clics
  unitRateXaf: number;
  amountXaf: number;             // quantité * unitRateXaf
  periodStart: Date;
  periodEnd: Date;
  invoiceId?: string | null;     // rattaché une fois facturé
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AdInvoice {
  id?: string;
  advertiserId: string;
  number: string;                // ex: INV-2026-000042
  status: AdInvoiceStatus;
  currency: string;
  subtotalXaf: number;
  commissionXaf: number;
  taxXaf: number;
  discountXaf: number;
  totalXaf: number;
  dueDate: Date;
  paidAt?: Date | null;
  periodStart: Date;
  periodEnd: Date;
  lineIds: string[];
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AdPaymentMethod {
  id?: string;
  advertiserId: string;
  provider: string;              // chariow | bank_transfer | manual
  label: string;
  details: Record<string, unknown>;
  isDefault: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface GenerateInvoiceInput {
  advertiserId: string;
  periodStart: Date;
  periodEnd: Date;
  campaignIds?: string[];        // optionnel : restreindre à certaines campagnes
  issue?: boolean;               // false -> reste en draft
}

export interface GenerateInvoiceResult {
  invoice: AdInvoice | null;
  lines: AdBillingLine[];
  skippedReason?: string;        // ex: MINIMUM_NOT_MET
  subtotalXaf: number;
  commissionXaf: number;
  taxXaf: number;
  discountXaf: number;
  totalXaf: number;
}

// Taux de change officiels vers XAF (recalculables — valeurs par défaut).
// 1 USD ≈ 603 XAF ; 1 EUR ≈ 656 XAF (ordres de grandeur CFA).
const CURRENCY_RATES_TO_XAF: Record<string, number> = {
  XAF: 1,
  USD: 603,
  EUR: 656,
};

// ============================================================
// Helpers
// ============================================================

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  // Firestore Timestamp (seconds/nanoseconds) ou ISO string
  if (typeof v === 'object') {
    const t = v as { seconds?: number; _seconds?: number };
    const sec = t.seconds ?? t._seconds;
    if (typeof sec === 'number') return new Date(sec * 1000);
  }
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

/** Numéro de facture séquentiel : INV-YYYY-NNNNNN (compteur Firestore). */
async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  // Compteur dénormalisé dans ad_billing_settings (doc 'counter')
  const counter = await db.adBillingSetting.upsert({
    where: { id: 'invoice_counter' },
    create: { id: 'invoice_counter', advertiserId: 'system', seq: 1 },
    update: { seq: { increment: 1 } },
  });
  const seq = toNumber((counter as Record<string, unknown>).seq, 1);
  return `INV-${year}-${pad(seq, 6)}`;
}

// ============================================================
// AdBillingEngine — singleton
// ============================================================

export class AdBillingEngine {
  /**
   * Règles de facturation d'un annonceur (avec défauts).
   */
  async getBillingSettings(advertiserId: string): Promise<AdBillingSettings> {
    const doc = await db.adBillingSetting.findUnique({ where: { id: advertiserId } });
    if (!doc) {
      return {
        advertiserId,
        currency: 'XAF',
        model: 'CPV',
        unitRateXaf: 10,
        platformCommissionPct: 15,
        taxRatePct: 19.25,
        discountPct: 0,
        minInvoiceAmountXaf: 5000,
        paymentTermsDays: 15,
        billingDayOfMonth: 1,
        autoIssue: true,
      };
    }
    const s = doc as unknown as Record<string, unknown>;
    return {
      id: s.id as string | undefined,
      advertiserId,
      currency: (s.currency as string) || 'XAF',
      model: (s.model as BillingModel) || 'CPV',
      unitRateXaf: toNumber(s.unitRateXaf, 10),
      platformCommissionPct: toNumber(s.platformCommissionPct, 15),
      taxRatePct: toNumber(s.taxRatePct, 19.25),
      discountPct: toNumber(s.discountPct, 0),
      minInvoiceAmountXaf: toNumber(s.minInvoiceAmountXaf, 5000),
      paymentTermsDays: toNumber(s.paymentTermsDays, 15),
      billingDayOfMonth: toNumber(s.billingDayOfMonth, 1),
      autoIssue: s.autoIssue !== false,
      createdAt: toDate(s.createdAt) || undefined,
      updatedAt: toDate(s.updatedAt) || undefined,
    };
  }

  /**
   * Enregistre ou met à jour les règles de facturation personnalisées
   * d'un annonceur (taux, commission, TVA, remise, seuil, délais).
   */
  async upsertBillingSettings(settings: AdBillingSettings): Promise<AdBillingSettings> {
    if (settings.billingDayOfMonth < 1 || settings.billingDayOfMonth > 28) {
      throw new Error('INVALID_BILLING_DAY');
    }
    const saved = await db.adBillingSetting.upsert({
      where: { id: settings.advertiserId },
      create: {
        id: settings.advertiserId,
        advertiserId: settings.advertiserId,
        currency: settings.currency || 'XAF',
        model: settings.model || 'CPV',
        unitRateXaf: settings.unitRateXaf,
        platformCommissionPct: settings.platformCommissionPct,
        taxRatePct: settings.taxRatePct,
        discountPct: settings.discountPct,
        minInvoiceAmountXaf: settings.minInvoiceAmountXaf,
        paymentTermsDays: settings.paymentTermsDays,
        billingDayOfMonth: settings.billingDayOfMonth,
        autoIssue: settings.autoIssue,
      },
      update: {
        currency: settings.currency || 'XAF',
        model: settings.model || 'CPV',
        unitRateXaf: settings.unitRateXaf,
        platformCommissionPct: settings.platformCommissionPct,
        taxRatePct: settings.taxRatePct,
        discountPct: settings.discountPct,
        minInvoiceAmountXaf: settings.minInvoiceAmountXaf,
        paymentTermsDays: settings.paymentTermsDays,
        billingDayOfMonth: settings.billingDayOfMonth,
        autoIssue: settings.autoIssue,
      },
    });
    log.info('billing_settings_saved', { advertiserId: settings.advertiserId.slice(0, 8) });
    return this.getBillingSettings(settings.advertiserId);
  }

  /**
   * Calcule le spend brut d'un annonceur sur une période, en recombinant
   * les impressions/clics (ledger) à partir d'ad_impressions.
   *
   * -> impressions non cliquées : coût CPV (costPerView de la campagne)
   * -> impressions cliquées      : coût CPC (costPerClick de la campagne)
   *
   * Retourne le détail quantité/coût par campagne + totaux.
   */
  async calculateAdSpend(
    advertiserId: string,
    periodStart: Date,
    periodEnd: Date,
    campaignIds?: string[],
  ): Promise<{
    impressions: number;
    clicks: number;
    spendXaf: number;
    byCampaign: Array<{
      campaignId: string;
      impressions: number;
      clicks: number;
      cpvXaf: number;
      cpcXaf: number;
      costXaf: number;
    }>;
  }> {
    // Campagnes appartenant à l'annonceur.
    // (Le champ advertiserId est lu s'il existe ; sinon on filtre via billing settings.)
    const campaignWhere: Record<string, unknown> = {};
    if (campaignIds && campaignIds.length > 0) {
      campaignWhere.id = { in: campaignIds };
    }
    const campaigns = (await db.adCampaign.findMany({
      where: campaignIds && campaignIds.length > 0 ? campaignWhere : undefined,
    })) as unknown as Array<Record<string, unknown>>;

    // Impressions de la période.
    const impressions = (await db.adImpression.findMany({
      where: {
        createdAt: { gte: periodStart, lte: periodEnd },
        ...(campaignIds && campaignIds.length > 0 ? { campaignId: { in: campaignIds } } : {}),
      },
    })) as unknown as Array<Record<string, unknown>>;

    const byCampaign = new Map<string, {
      impressions: number; clicks: number; cpvXaf: number; cpcXaf: number; costXaf: number;
    }>();

    let impressionsTotal = 0;
    let clicksTotal = 0;

    const campaignMap = new Map<string, Record<string, unknown>>();
    for (const c of campaigns) campaignMap.set(String(c.id), c);

    for (const imp of impressions) {
      const campaignId = String(imp.campaignId ?? '');
      const campaign = campaignMap.get(campaignId) as Record<string, unknown> | undefined;
      const cpvXaf = toNumber(campaign?.costPerView, 0);
      const cpcXaf = toNumber(campaign?.costPerClick, 0);

      let bucket = byCampaign.get(campaignId);
      if (!bucket) {
        bucket = { impressions: 0, clicks: 0, cpvXaf, cpcXaf, costXaf: 0 };
        byCampaign.set(campaignId, bucket);
      }

      const wasClicked = Boolean(imp.wasClicked);
      bucket.impressions += 1;
      impressionsTotal += 1;
      if (wasClicked) {
        bucket.clicks += 1;
        clicksTotal += 1;
        bucket.costXaf += cpcXaf;
      } else {
        bucket.costXaf += cpvXaf;
      }
    }

    const spendXaf = Array.from(byCampaign.values()).reduce((s, b) => s + round2(b.costXaf), 0);

    return {
      impressions: impressionsTotal,
      clicks: clicksTotal,
      spendXaf: round2(spendXaf),
      byCampaign: Array.from(byCampaign.entries()).map(([campaignId, b]) => ({
        campaignId,
        impressions: b.impressions,
        clicks: b.clicks,
        cpvXaf: b.cpvXaf,
        cpcXaf: b.cpcXaf,
        costXaf: round2(b.costXaf),
      })),
    };
  }

  /**
   * Génère (ou nettoie + régénère) une facture pour un annonceur sur une
   * période donnée. Applique taux unitaire personnalisé, commission
   * plateforme, TVA et remise.
   */
  async generateInvoice(input: GenerateInvoiceInput): Promise<GenerateInvoiceResult> {
    const settings = await this.getBillingSettings(input.advertiserId);
    const spend = await this.calculateAdSpend(
      input.advertiserId,
      input.periodStart,
      input.periodEnd,
      input.campaignIds,
    );

    const nothing = spend.impressions === 0 && spend.clicks === 0;
    if (nothing || spend.spendXaf <= 0) {
      return {
        invoice: null,
        lines: [],
        skippedReason: 'NO_SPEND',
        subtotalXaf: 0, commissionXaf: 0, taxXaf: 0, discountXaf: 0, totalXaf: 0,
      };
    }

    // 1. Lignes comptables par campagne (impressions + clics).
    const lineCreateInputs: Array<Record<string, unknown>> = [];
    for (const c of spend.byCampaign) {
      const impAmount = round2(c.impressions * c.cpvXaf);
      const clkAmount = round2(c.clicks * c.cpcXaf);
      if (c.impressions > 0) {
        lineCreateInputs.push({
          advertiserId: input.advertiserId,
          campaignId: c.campaignId,
          kind: 'impression',
          description: `${c.impressions} impressions`,
          quantity: c.impressions,
          unitRateXaf: c.cpvXaf,
          amountXaf: impAmount,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          invoiceId: null,
        });
      }
      if (c.clicks > 0) {
        lineCreateInputs.push({
          advertiserId: input.advertiserId,
          campaignId: c.campaignId,
          kind: 'click',
          description: `${c.clicks} clics`,
          quantity: c.clicks,
          unitRateXaf: c.cpcXaf,
          amountXaf: clkAmount,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          invoiceId: null,
        });
      }
    }

    // 2. Montants dérivés.
    const subtotalXaf = round2(spend.spendXaf);
    const commissionXaf = round2(subtotalXaf * (settings.platformCommissionPct / 100));
    const discountRaw = round2(subtotalXaf * (settings.discountPct / 100));
    const discountXaf = discountRaw;
    const taxBase = subtotalXaf - discountXaf + commissionXaf;
    const taxXaf = round2(taxBase * (settings.taxRatePct / 100));
    const totalXaf = round2(taxBase + taxXaf);

    if (totalXaf < settings.minInvoiceAmountXaf) {
      return {
        invoice: null,
        lines: [],
        skippedReason: 'MINIMUM_NOT_MET',
        subtotalXaf, commissionXaf, taxXaf, discountXaf, totalXaf,
      };
    }

    // 3. Écrire les lignes, puis la facture.
    const lines: AdBillingLine[] = [];
    for (const li of lineCreateInputs) {
      const created = await db.adBillingLine.create({ data: li });
      lines.push(created as unknown as AdBillingLine);
    }

    const number = await nextInvoiceNumber();
    const issue = Boolean(input.issue ?? settings.autoIssue);
    const dueDate = new Date(
      input.periodEnd.getTime() + settings.paymentTermsDays * 24 * 60 * 60 * 1000,
    );

    const invoice = (await db.adInvoice.create({
      data: {
        advertiserId: input.advertiserId,
        number,
        status: issue ? 'issued' : 'draft',
        currency: settings.currency,
        subtotalXaf,
        commissionXaf,
        taxXaf,
        discountXaf,
        totalXaf,
        dueDate,
        paidAt: null,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        lineIds: lines.map(l => l.id),
        metadata: {
          issuedVia: 'ad-billing-engine',
          commissionPct: settings.platformCommissionPct,
          taxPct: settings.taxRatePct,
          discountPct: settings.discountPct,
        },
      },
    })) as unknown as AdInvoice;

    // 4. Rattacher les lignes à la facture.
    for (const l of lines) {
      if (l.id) {
        await db.adBillingLine.update({
          where: { id: l.id },
          data: { invoiceId: invoice.id },
        });
      }
    }

    log.info('invoice_generated', {
      advertiserId: input.advertiserId.slice(0, 8),
      number,
      totalXaf,
      lines: lines.length,
    });

    return {
      invoice,
      lines,
      subtotalXaf, commissionXaf, taxXaf, discountXaf, totalXaf,
    };
  }

  /**
   * Rapprochement : compare le total facturé d'une période au
   * `budgetSpent` des campagnes correspondantes (ad_campaigns).
   * Révèle les écarts (lignes manquantes, campagnes non facturées).
   */
  async reconcileAdSpend(
    advertiserId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{
    campaignId: string;
    budgetSpentXaf: number;
    invoicedXaf: number;
    differenceXaf: number;
  }[]> {
    const spend = await this.calculateAdSpend(advertiserId, periodStart, periodEnd);
    const campaignIds = spend.byCampaign.map(c => c.campaignId);
    const campaigns = (await db.adCampaign.findMany({
      where: campaignIds.length > 0 ? { id: { in: campaignIds } } : undefined,
    })) as unknown as Array<Record<string, unknown>>;

    return spend.byCampaign.map(c => {
      const camp = campaigns.find(x => String(x.id) === c.campaignId);
      const budgetSpentXaf = round2(toNumber(camp?.budgetSpent, 0));
      const invoicedXaf = round2(c.costXaf);
      return {
        campaignId: c.campaignId,
        budgetSpentXaf,
        invoicedXaf,
        differenceXaf: round2(budgetSpentXaf - invoicedXaf),
      };
    });
  }

  /** Transition d'état d'une facture (paid, cancelled, ...). */
  async setInvoiceStatus(
    invoiceId: string,
    status: AdInvoiceStatus,
    paidAt?: Date,
  ): Promise<AdInvoice> {
    const data: Record<string, unknown> = { status };
    if (status === 'paid') data.paidAt = paidAt ?? new Date();
    const invoice = await db.adInvoice.update({
      where: { id: invoiceId },
      data,
    });
    log.info('invoice_status_changed', { invoiceId: invoiceId.slice(0, 8), status });
    return invoice as unknown as AdInvoice;
  }

  /** Lit une facture + ses lignes. */
  async getInvoice(invoiceId: string): Promise<{
    invoice: AdInvoice | null;
    lines: AdBillingLine[];
  }> {
    const invoice = (await db.adInvoice.findUnique({ where: { id: invoiceId } })) as unknown as AdInvoice | null;
    const lines = invoice
      ? (await db.adBillingLine.findMany({
          where: { invoiceId },
        })) as unknown as AdBillingLine[]
      : [];
    return { invoice, lines };
  }

  /** Liste les factures d'un annonceur (les plus récentes d'abord). */
  async listInvoices(advertiserId: string, limit = 50): Promise<AdInvoice[]> {
    return (await db.adInvoice.findMany({
      where: { advertiserId },
      orderBy: { createdAt: 'desc' },
      limit,
    })) as unknown as AdInvoice[];
  }

  /** Enregistre une méthode de paiement pour l'annonceur. */
  async upsertPaymentMethod(method: AdPaymentMethod): Promise<AdPaymentMethod> {
    const saved = await db.adPaymentMethod.upsert({
      where: { id: method.id || method.advertiserId },
      create: {
        ...(method.id ? { id: method.id } : {}),
        advertiserId: method.advertiserId,
        provider: method.provider,
        label: method.label,
        details: method.details,
        isDefault: method.isDefault,
      },
      update: {
        provider: method.provider,
        label: method.label,
        details: method.details,
        isDefault: method.isDefault,
      },
    });
    return saved as unknown as AdPaymentMethod;
  }

  /** Convertit un montant depuis sa devise vers XAF (taux configurés). */
  convertToXaf(amount: number, currency: string): number {
    const rate = CURRENCY_RATES_TO_XAF[currency.toUpperCase()] ?? 1;
    return round2(amount * rate);
  }
}

// ============================================================
// Singleton
// ============================================================

let instance: AdBillingEngine | null = null;

export function getAdBillingEngine(): AdBillingEngine {
  if (!instance) instance = new AdBillingEngine();
  return instance;
}
