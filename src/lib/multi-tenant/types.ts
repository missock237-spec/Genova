// ============================================================
// Gen3ia — Multi-tenant types (organisations & adhésions)
// ============================================================
//  Introduit le modèle de tenancy B2B : une Organisation regroupe
//  plusieurs membres (users) avec des rôles distincts du rôle global.
//  Objectif : isolation des données par `orgId` (en complément de `userId`),
//  facturation par siège, et API/quotas scopés par organisation.
//
//  Ce module est NON-BREAKING :
//    - Toutes les collections existantes restent scoped par `userId`.
//    - `orgId` est ajouté en optionnel sur les documents (champ nouveau).
//    - Sans orgId, le comportement actuel (mono-utilisateur) est préservé.
// ============================================================

/** Rôle d'un membre au sein d'une organisation (distinct du rôle global `user`/`admin`). */
export type OrgRole = 'owner' | 'admin' | 'member' | 'billing';

/** Statut d'une adhésion à une organisation. */
export type MembershipStatus = 'active' | 'invited' | 'suspended' | 'removed';

/** Statut de vie d'une organisation. */
export type OrgStatus = 'active' | 'trial' | 'suspended' | 'cancelled';

/** Plan de facturation de l'organisation (aligné sur `usage-limits` existant). */
export type OrgPlan = 'free' | 'pro' | 'business' | 'enterprise';

/** Permissions dérivées d'un rôle d'organisation. */
export const ORG_ROLE_PERMISSIONS: Record<OrgRole, string[]> = {
  owner: ['org:read', 'org:write', 'org:delete', 'org:members:manage', 'org:billing:manage', 'org:api:manage'],
  admin: ['org:read', 'org:write', 'org:members:manage'],
  member: ['org:read'],
  billing: ['org:read', 'org:billing:manage'],
};

/** Vérifie qu'un rôle d'organisation possède une permission donnée. */
export function hasOrgPermission(role: OrgRole, permission: string): boolean {
  return ORG_ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Document `organizations/{orgId}` dans Firestore. */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  plan: OrgPlan;
  /** uid du propriétaire fondateur (toujours un membre actif avec rôle `owner`). */
  ownerId: string;
  /** Champs utilitaires (billing, branding...) librement étendus. */
  billingEmail?: string;
  seatLimit?: number;
  /** Timestamps Firestore (Timestamp ou Date tolérée — voir historique serverTimestamp). */
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Document `memberships/{membershipId}` dans Firestore. */
export interface Membership {
  /**
   * DocId déterministe `{userId}_{orgId}` (voir `buildMembershipId`).
   * Garantit l'unicité (un user = une seule adhésion active) et permet
   * une résolution O(1) dans les Security Rules via `isActiveMemberOf`.
   */
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  status: MembershipStatus;
  /** set par celui qui invite (utilisé pour l'audit). */
  invitedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Clé d'une organisation résolue (prête à être consommée par le layer de données). */
export interface ResolvedOrg {
  org: Organization;
  membership: Membership;
  role: OrgRole;
  permissions: string[];
}

/** Constantes de collections (source unique de vérité, à réutiliser partout). */
export const ORG_COLLECTIONS = {
  organizations: 'organizations',
  memberships: 'memberships',
} as const;

/**
 * Construit l'identifiant déterministe d'une adhésion.
 * Format : `{userId}_{orgId}`. Les deux segments sont encodés pour être
 * sûrs vis-à-vis de Firestore (les docIds ne peuvent pas contenir `/`).
 *
 * IMPORTANT : toute modification de cet encodage nécessite une migration
 * des documents existants ET une mise à jour des Security Rules.
 */
export function buildMembershipId(userId: string, orgId: string): string {
  return `${userId}_${orgId}`;
}

/**
 * Normalise un rôle d'organisation arbitraire (chaîne persistée) vers un OrgRole valide.
 * Sécurise les lectures de documents potentiellement corrompus ou anciens.
 */
export function normalizeOrgRole(value: unknown): OrgRole {
  switch (value) {
    case 'owner':
    case 'admin':
    case 'member':
    case 'billing':
      return value;
    default:
      return 'member';
  }
}

/**
 * Normalise un statut d'organisation arbitraire vers un OrgStatus valide.
 */
export function normalizeOrgStatus(value: unknown): OrgStatus {
  switch (value) {
    case 'active':
    case 'trial':
    case 'suspended':
    case 'cancelled':
      return value;
    default:
      return 'active';
  }
}

/**
 * Normalise un plan d'organisation arbitraire vers un OrgPlan valide.
 * Aligné sur `normalizeOrgRole` / `normalizeOrgStatus` : toute valeur
 * inconnue retombe sur `free` (plan par défaut, jamais plus permissif).
 */
export function normalizeOrgPlan(value: unknown): OrgPlan {
  switch (value) {
    case 'free':
    case 'pro':
    case 'business':
    case 'enterprise':
      return value;
    default:
      return 'free';
  }
}
