// ============================================================
// Gen3ia — Planificateur de facturation publicitaire + sync externe
// ------------------------------------------------------------
// Service cron (pattern identique à src/services/payment-retry.ts)
// exécuté périodiquement pour :
//   1. Générer automatiquement les factures annonceurs dues
//      (facturation mensuelle au jour configuré, ou génération
//      manuelle via l'API /api/advertising/billing).
//   2. Synchroniser les campagnes du réseau publicitaire externe
//      (repli interne en cas d'échec).
//   3. Rapprocher le spend externe facturable.
//
// ADDITIF : n'altère ni AdEngine ni les routes existantes.
//
// Critères de facturation automatique :
//   - un annonceur est "dû" si son jour de facturation (billingDayOfMonth)
//     est atteint OU dépassé dans le mois courant et qu'aucune facture
//     de la période n'a encore été émise ;
//   - le moteur AdBillingEngine saute automatiquement les periodes sans
//     spend (NO_SPEND) ou sous le seuil (MINIMUM_NOT_MET).
// ============================================================

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { getAdBillingEngine } from '@/lib/billing/ad-billing';
import { getExternalAdManager } from '@/lib/advertising/external/registry';

const log = createLogger('ad-billing-scheduler');

// Nombre max d'annonceurs traités par passe (évite les pics de lecture).
const MAX_ADVERTISERS_PER_RUN = 500;

/** Période de facturation : mois calendaire précédent. */
function previousMonthRange(now = new Date()): { periodStart: Date; periodEnd: Date } {
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { periodStart: start, periodEnd: end };
}

export class AdBillingScheduler {
  private running = false;

  /**
   * Execute une passe complète : sync externe + génération de factures.
   * Retourne une synthèse pour les logs et le endpoint de pilotage.
   */
  async run(): Promise<{
    externalSync: { providers: number };
    invoices: { generated: number; skipped: number; errors: number };
  }> {
    if (this.running) {
      return { externalSync: { providers: 0 }, invoices: { generated: 0, skipped: 0, errors: 0 } };
    }
    this.running = true;
    try {
      const externalSync = await this.syncExternal();
      const invoices = await this.generateDueInvoices();
      return { externalSync, invoices };
    } finally {
      this.running = false;
    }
  }

  /** Synchronise les campagnes du réseau externe (ignore les échecs). */
  private async syncExternal(): Promise<{ providers: number }> {
    const manager = getExternalAdManager();
    let providers = 0;
    try {
      const results = await manager.syncAll();
      providers = results.length;
      log.info('external_sync_done', { providers });
    } catch (err) {
      log.warn('external_sync_failed', { error: err instanceof Error ? err.message : String(err) });
    }
    return { providers };
  }

  /**
   * Génère les factures dues pour les annonceurs dont le jour de
   * facturation est atteint dans le mois courant.
   */
  private async generateDueInvoices(): Promise<{
    generated: number;
    skipped: number;
    errors: number;
  }> {
    const billingEngine = getAdBillingEngine();
    const { periodStart, periodEnd } = previousMonthRange();
    const today = new Date();
    const dayOfMonth = today.getDate();

    let generated = 0;
    let skipped = 0;
    let errors = 0;

    // Annonceurs configurés (ad_billing_settings) dont le jour de
    // facturation est atteint/dépassé ce mois-ci et l'émission auto activée.
    const settings = (await db.adBillingSetting.findMany({
      where: { autoIssue: true },
      limit: MAX_ADVERTISERS_PER_RUN,
    })) as unknown as Array<Record<string, unknown>>;

    for (const s of settings) {
      const advertiserId = String(s.advertiserId ?? s.id ?? '');
      if (!advertiserId) continue;

      const billingDay = Number(s.billingDayOfMonth ?? 1);
      // Sauter si le jour de facturation n'est pas encore atteint ce mois-ci.
      if (dayOfMonth < billingDay) {
        skipped++;
        continue;
      }

      try {
        const result = await billingEngine.generateInvoice({
          advertiserId,
          periodStart,
          periodEnd,
          issue: true,
        });
        if (result.invoice) generated++;
        else skipped++;
      } catch (err) {
        errors++;
        log.error('invoice_generation_failed', {
          advertiserId: advertiserId.slice(0, 8),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    log.info('invoice_run_finished', { generated, skipped, errors });
    return { generated, skipped, errors };
  }

  get isRunning(): boolean {
    return this.running;
  }
}

export const adBillingScheduler = new AdBillingScheduler();
