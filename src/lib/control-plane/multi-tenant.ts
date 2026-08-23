// ============================================================
// Gen3ia — Multi-tenance (Plan de Contrôle)
// ============================================================
//  Couche d'abstraction simplifiée pour la résolution de tenant
//  dans le contexte du plan de contrôle. S'appuie sur les collections
//  `organizations` et `memberships` via la façade `db`.
//
//  Ce module expose un `ResolvedOrg` plat (sans la structure imbriquée
//  du module `@/lib/multi-tenant` existant) pour simplifier la
//  consommation par les middlewares de sécurité et de quotas.
//
//  NOTE : Le module `@/lib/multi-tenant` existant reste la source
//  de vérité pour les opérations CRUD avancées. Ce module ré-exporte
//  son `ResolvedOrg` enrichi et fournit des fonctions simplifiées.
// ============================================================

import { db } from '@/lib/db';

/**
 * Organisation résolue — vue aplatie pour le plan de contrôle.
 * Contient les informations essentielles sans les sous-objets
 * imbriqués du module `@/lib/multi-tenant`.
 *
 * @property id - Identifiant de l'organisation (ex: `org_abc123`).
 * @property name - Nom d'affichage de l'organisation.
 * @property slug - Identifiant URL-safe unique.
 * @property role - Rôle de l'utilisateur au sein de l'organisation.
 * @property plan - Plan de facturation de l'organisation.
 * @property ownerId - Identifiant du propriétaire fondateur.
 */
export interface ResolvedOrg {
  id: string;
  name: string;
  slug: string;
  role: string;
  plan: string;
  ownerId: string;
}

/**
 * Document Organisation dans Firestore.
 * Miroir simplifié du type complet de `@/lib/multi-tenant/types`.
 */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: string;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Document Membre d'organisation dans Firestore.
 */
export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: Date;
  permissions?: string[];
}

/**
 * Rôles valides pour un membre d'organisation.
 */
const VALID_MEMBER_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;

/**
 * Normalise un rôle de membre vers une valeur valide.
 * Fallback sur `member` pour les valeurs inconnues.
 *
 * @param role - Rôle brut (provenant de la persistance ou de l'entrée utilisateur).
 * @returns Rôle normalisé.
 */
function normalizeMemberRole(role: string): OrgMember['role'] {
  if ((VALID_MEMBER_ROLES as readonly string[]).includes(role)) {
    return role as OrgMember['role'];
  }
  return 'member';
}

// ============================================================
// Résolution de tenant
// ============================================================

/**
 * Résout l'organisation active d'un utilisateur.
 * Recherche l'adhésion active la plus récente, puis charge
 * les informations de l'organisation associée.
 *
 * @param userId - Identifiant Firebase Auth de l'utilisateur.
 * @returns Organisation résolue avec le rôle de l'utilisateur, ou `null` si l'utilisateur n'appartient à aucune organisation.
 *
 * @example
 * ```ts
 * const org = await resolveTenant(userId);
 * if (org) {
 *   const quotaCheck = await checkQuota(org.id, org.plan, 'agents');
 * }
 * ```
 */
export async function resolveTenant(userId: string): Promise<ResolvedOrg | null> {
  try {
    // Recherche l'adhésion active de l'utilisateur
    const membership = await db.membership.findFirst({
      where: [
        { field: 'userId', op: '==', value: userId },
        { field: 'status', op: '==', value: 'active' },
      ],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      limit: 1,
    }) as Record<string, unknown> | null;

    if (!membership) return null;

    const orgId = membership.orgId as string;

    // Charge l'organisation
    const org = await db.organization.findUnique({
      where: { id: orgId },
    }) as Record<string, unknown> | null;

    if (!org) return null;

    return {
      id: org.id as string,
      name: org.name as string,
      slug: org.slug as string,
      role: (membership.role as string) || 'member',
      plan: (org.plan as string) || 'free',
      ownerId: org.ownerId as string,
    };
  } catch (error) {
    console.error('[multi-tenant] Erreur lors de la résolution du tenant:', error);
    return null;
  }
}

// ============================================================
// CRUD — Organisations
// ============================================================

/**
 * Résultat de la création d'une organisation.
 */
export interface CreateOrgResult {
  organization: Organization;
  membership: OrgMember;
}

/**
 * Crée une nouvelle organisation et ajoute le créateur comme `owner`.
 * Vérifie que le créateur n'appartient pas déjà à une organisation
 * active (invariant single-tenant).
 *
 * @param data - Données de création de l'organisation.
 * @param data.name - Nom d'affichage de l'organisation.
 * @param data.slug - Identifiant URL-safe (optionnel, généré sinon).
 * @param data.ownerId - Identifiant du propriétaire fondateur.
 * @returns Organisation et adhésion créées.
 * @throws {Error} Si le propriétaire appartient déjà à une organisation active.
 *
 * @example
 * ```ts
 * const { organization } = await createOrganization({
 *   name: 'Acme Corp',
 *   slug: 'acme-corp',
 *   ownerId: userId,
 * });
 * ```
 */
export async function createOrganization(data: {
  name: string;
  slug: string;
  ownerId: string;
}): Promise<Organization> {
  // Vérifie que le propriétaire n'a pas déjà une organisation
  const existingMembership = await db.membership.findFirst({
    where: [
      { field: 'userId', op: '==', value: data.ownerId },
      { field: 'status', op: '==', value: 'active' },
    ],
    limit: 1,
  });

  if (existingMembership) {
    throw new Error(
      'ORG_ALREADY_MEMBER: cet utilisateur appartient déjà à une organisation active',
    );
  }

  const now = new Date();

  // Crée l'organisation
  const org = await db.organization.create({
    data: {
      name: data.name.trim(),
      slug: data.slug.trim(),
      ownerId: data.ownerId,
      plan: 'free',
      status: 'active',
      settings: {},
      createdAt: now,
      updatedAt: now,
    },
  }) as unknown as Organization;

  // Crée l'adhésion owner
  const membershipId = `${data.ownerId}_${org.id}`;
  await db.membership.create({
    data: {
      id: membershipId,
      orgId: org.id,
      userId: data.ownerId,
      role: 'owner',
      status: 'active',
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });

  return org;
}

// ============================================================
// Gestion des membres
// ============================================================

/**
 * Ajoute un membre à une organisation.
 * Vérifie que l'utilisateur n'est pas déjà membre actif d'une
 * organisation (invariant single-tenant).
 *
 * @param orgId - Identifiant de l'organisation.
 * @param userId - Identifiant de l'utilisateur à ajouter.
 * @param role - Rôle dans l'organisation (défaut `member`).
 * @throws {Error} Si l'utilisateur est déjà membre d'une organisation.
 */
export async function addOrgMember(
  orgId: string,
  userId: string,
  role: string = 'member',
): Promise<void> {
  // Vérifie l'existence de l'organisation
  const org = await db.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    throw new Error('ORG_NOT_FOUND: organisation introuvable');
  }

  // Vérifie que l'utilisateur n'est pas déjà membre actif
  const existingMembership = await db.membership.findFirst({
    where: [
      { field: 'userId', op: '==', value: userId },
      { field: 'status', op: '==', value: 'active' },
    ],
    limit: 1,
  });

  if (existingMembership) {
    throw new Error(
      'MEMBER_ALREADY_ACTIVE: cet utilisateur est déjà membre d\'une organisation',
    );
  }

  const now = new Date();
  const normalizedRole = normalizeMemberRole(role);
  const membershipId = `${userId}_${orgId}`;

  await db.membership.create({
    data: {
      id: membershipId,
      orgId,
      userId,
      role: normalizedRole,
      status: 'active',
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });
}

/**
 * Retire un membre d'une organisation (passe le statut à `removed`).
 * Empêche le retrait du dernier `owner` (invariant de propriété).
 *
 * @param orgId - Identifiant de l'organisation.
 * @param userId - Identifiant du membre à retirer.
 * @throws {Error} Si l'adhésion n'existe pas ou si c'est le dernier owner.
 */
export async function removeOrgMember(orgId: string, userId: string): Promise<void> {
  const membershipId = `${userId}_${orgId}`;
  const membership = await db.membership.findUnique({
    where: { id: membershipId },
  }) as Record<string, unknown> | null;

  if (!membership || membership.status !== 'active') {
    throw new Error('MEMBERSHIP_NOT_FOUND: adhésion introuvable ou inactive');
  }

  // Vérifie qu'on ne retire pas le dernier owner
  if (membership.role === 'owner') {
    const otherOwners = await db.membership.findMany({
      where: [
        { field: 'orgId', op: '==', value: orgId },
        { field: 'role', op: '==', value: 'owner' },
        { field: 'status', op: '==', value: 'active' },
      ],
      limit: 10,
    });
    const ownerCount = (otherOwners as Record<string, unknown>[]).filter(
      (m) => m.userId !== userId,
    ).length;

    if (ownerCount === 0) {
      throw new Error(
        'LAST_OWNER: impossible de retirer le dernier propriétaire de l\'organisation',
      );
    }
  }

  await db.membership.update({
    where: { id: membershipId },
    data: {
      status: 'removed',
      updatedAt: new Date(),
    },
  });
}

/**
 * Récupère la liste des membres actifs d'une organisation.
 *
 * @param orgId - Identifiant de l'organisation.
 * @returns Tableau des membres actifs triés par date d'adhésion.
 */
export async function getOrgMembers(orgId: string): Promise<OrgMember[]> {
  const members = await db.membership.findMany({
    where: [
      { field: 'orgId', op: '==', value: orgId },
      { field: 'status', op: '==', value: 'active' },
    ],
    orderBy: [{ field: 'createdAt', direction: 'asc' }],
    limit: 500,
  });

  return (members as unknown as OrgMember[]).map((m) => ({
    ...m,
    role: normalizeMemberRole(m.role as string),
  }));
}
