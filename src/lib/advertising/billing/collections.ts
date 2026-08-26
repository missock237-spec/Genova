// ============================================================
// Gen3ia — Collections Firestore pour la facturation publicitaire
// ------------------------------------------------------------
// Enregistre les nouvelles collections nécessaires au système de
// facturation personnalisée des annonceurs :
//   - ad_billing_settings  (règles tarifaires par annonceur)
//   - ad_billing_lines     (lignes comptables / ledger)
//   - ad_invoices           (factures annonceurs)
//   - ad_payment_methods    (moyens de paiement annonceurs)
//
// Ces collections sont EXPOSÉES via le facade `db` dans
// src/lib/firestore-extra.ts (import de ce fichier à cet endroit).
// Aucun modèle Prisma n'est créé — la persistance passe par Firestore.
//
// NOTE : ce fichier définit les NOMS de collections et l'extension
// du modèle `db`. L'enregistrement effectif s'opère dans
// firestore-extra.ts par `...adBillingCollections`.
// ============================================================

import { db, Collections, FirestoreRepository } from '@/lib/db';

function makeRepo<T = Record<string, unknown>>(name: string): FirestoreRepository<T> {
  return new FirestoreRepository<T>(name);
}

/**
 * Noms de collections Firestore dédiées à la facturation publicitaire.
 * Ajout (additif) aux Collections existantes — ne remplace rien.
 */
export const AdBillingCollections = {
  adBillingSettings: 'ad_billing_settings',
  adBillingLines: 'ad_billing_lines',
  adInvoices: 'ad_invoices',
  adPaymentMethods: 'ad_payment_methods',
} as const;

export type AdBillingCollectionName =
  (typeof AdBillingCollections)[keyof typeof AdBillingCollections];

/**
 * Référenceurs (`db.<model>`) dédiés à la facturation publicitaire.
 * À fusionner dans `firestore-extra.ts` via le spread `...adBilling`.
 */
export const adBillingRepos = {
  adBillingSetting: makeRepo(AdBillingCollections.adBillingSettings),
  adBillingLine: makeRepo(AdBillingCollections.adBillingLines),
  adInvoice: makeRepo(AdBillingCollections.adInvoices),
  adPaymentMethod: makeRepo(AdBillingCollections.adPaymentMethods),
} as const;

// Re-export pour les consommateurs qui veulent un accès direct isolé.
export { db, Collections };
