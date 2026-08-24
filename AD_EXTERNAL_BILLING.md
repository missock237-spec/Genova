# Système Publicitaire — Facturation personnalisée & Service de pub externe

> Ce document décrit les ajouts effectués sur le projet **Gen3ia** pour
> compléter le système publicitaire existant avec :
> 1. une **facturation personnalisée** des annonceurs ;
> 2. une **connexion à un service de publicité externe**.
>
> Ces ajouts sont **additifs** : la structure existante (AdEngine,
> routes `/api/advertising`, modèles Firestore) n'est **pas modifiée**.

---

## 1. Rappel de l'existant

Le projet disposait déjà d'un moteur publicitaire complet :

- `src/lib/advertising/ad-engine.ts` — moteur de diffusion (plan-aware,
  house ads, variantes A/B, sélection pondérée, caps de fréquence,
  enregistrement impressions/clics, budgets, récompenses).
- `src/lib/advertising/anti-abuse.ts` — anti-fraude et incréments atomiques.
- Routes sous `src/app/api/advertising/` (`route.ts`, `record-impression/`,
  `record-click/`, `analytics/`, `optimize/`).
- Docs : `AD_SYSTEM_IMPLEMENTATION.md`, `AD_SYSTEM_IMPROVEMENTS.md`,
  `AD_QUICK_START.md`.

La persistance est assurée par **Cloud Firestore** via la façade
`src/lib/db.ts` → `src/lib/firestore-extra.ts` →
`src/lib/firebase/firestore.ts`. **Prisma/`schema.prisma` est obsolète**
(conservé à titre historique uniquement).

---

## 2. Facturation personnalisée (annonceurs)

### Fichiers ajoutés

| Fichier | Rôle |
| --- | --- |
| `src/lib/billing/ad-billing.ts` | Moteur `AdBillingEngine` (singleton `getAdBillingEngine()`) |
| `src/app/api/advertising/billing/route.ts` | API REST sécurisée (rôle `admin` / `billing_admin`) |

### Collections Firestore (enregistrées dans `firestore-extra.ts`)

| Nom Firestore | Accès façade | Description |
| --- | --- | --- |
| `ad_billing_settings` | `db.adBillingSetting` | Règles tarifaires par annonceur |
| `ad_billing_lines` | `db.adBillingLine` | Lignes comptables (ledger) |
| `ad_invoices` | `db.adInvoice` | Factures annonceurs |
| `ad_payment_methods` | `db.adPaymentMethod` | Moyens de paiement annonceurs |

### Fonctionnalités

- **Règles personnalisées par annonceur** : modèle tarifaire (`CPV`,
  `CPC`, `CPM`, `FLAT`), taux unitaire en XAF, commission plateforme (%),
  TVA (%), remise (%), seuil minimal de facturation, délais de paiement,
  jour de facturation, émission auto.
- **Calcul du spend** (`calculateAdSpend`) : recombine les
  impressions/clics depuis `ad_impressions`, applique `costPerView` et
  `costPerClick` réels des campagnes.
- **Génération de factures** (`generateInvoice`) : lignes comptables
  (impressions + clics par campagne), sous-total, commission, TVA,
  remise, total, numéro séquentiel `INV-AAAA-NNNNNN` (compteur Firestore),
  date d'échéance, états `draft`/`issued`/`paid`/`overdue`/`cancelled`…
- **Rapprochement** (`reconcileAdSpend`) : compare le total facturé au
  `budgetSpent` Firestore de chaque campagne et révèle les écarts.
- **Multi-devises** : XAF par défaut (1 USD ≈ 603 XAF, 1 EUR ≈ 656 XAF),
  conversion via `convertToXaf`.

### Endpoints (`/api/advertising/billing`)

| Méthode | Action | Rôle requis |
| --- | --- | --- |
| `GET` | `list`, `get`, `settings`, `spend`, `reconcile` | `admin` / `billing_admin` / `advertiser` |
| `POST` | `settings`, `generate`, `status`, `payment-method` | `admin` / `billing_admin` |

---

## 3. Connexion au service de publicité externe

### Fichiers ajoutés

| Fichier | Rôle |
| --- | --- |
| `src/lib/advertising/external/types.ts` | Contrat `ExternalAdProvider` + types partagés |
| `src/lib/advertising/external/client.ts` | Client HTTP générique `HttpExternalAdProvider` |
| `src/lib/advertising/external/registry.ts` | Singleton `getExternalAdManager()` |
| `src/app/api/advertising/external/route.ts` | API REST admin (sync, status, reconcile) |

### Principe

Le gestionnaire `ExternalAdManager` instancie le(s) provider(s) externes
configurés, récupère leurs campagnes et les **normalise** au format
`AdCampaign` de l'AdEngine (préfixe d'ID `ext:<provider>:<externalId>`,
champs `externalProviderId` / `externalCampaignId`). Les campagnes externes
peuvent ainsi être servies **côte à côte** avec les campagnes internes.

- `getActiveExternalCampaigns()` — campagnes externes normalisées (avec
  cache TTL 60 s).
- `getCombinedCampaigns(internal)` — fusion interne + externe.
- `syncImpression(event)` / `syncClick(event)` — notification au réseau
  externe (fire-and-forget, ne fait jamais échouer l'appel).
- `reconcileExternalSpend(from, to)` — spend externe facturable.
- `syncAll()` — resynchronisation forcée (invalide le cache).

**Intégration à l'AdEngine** — Le moteur existant n'est **pas modifié**.
Pour servir les campagnes externes, appeler `getCombinedCampaigns(...)`
et injecter le résultat dans `decideAd`. En cas d'échec réseau, la liste
retournée est vide → repli automatique sur les campagnes internes
(house ads), sans interruption.

### Configuration (`.env`)

```env
AD_EXTERNAL_ENABLED=false      # activer pour brancher le réseau externe
AD_EXTERNAL_PROVIDER=          # identifiant du provider (ex: google, rtb_house)
AD_EXTERNAL_API_URL=           # URL de base de l'API externe
AD_EXTERNAL_API_KEY=           # jeton Bearer
```

API attendue côté réseau externe :

```
GET  {API_URL}/campaigns
POST {API_URL}/events/impression
POST {API_URL}/events/click
GET  {API_URL}/spend?from=&to=
```

### Endpoints (`/api/advertising/external`)

| Méthode | Action | Rôle requis |
| --- | --- | --- |
| `GET` | `status`, `campaigns`, `spend` | `admin` / `billing_admin` |
| `POST` | `sync`, `reconcile` | `admin` / `billing_admin` |

---

## 4. Conventions respectées

- **Firestore uniquement** — aucune migration Prisma, `schema.prisma`
  inchangé.
- **Façade `db`** — nouvelles collections via `makeRepo(...)` et non de
  nouveaux modèles.
- **Singletons** — `getAdBillingEngine()`, `getExternalAdManager()`,
  cohérents avec `getAdEngine()` / `getCreditEngine()`.
- **Logging structuré** — `createLogger('...')`.
- **Sécurité** — `applySecurity(...)` avec RBAC `roles`, `secureResponse`.
- **Devise** — XAF par défaut (cohérent avec les plans et crédits existants).
- **Style** — commentaires et chaînes en français, alignés sur le reste
  du code.
