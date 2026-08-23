// ============================================================
// Gen3ia — Organisation service (multi-tenant core)
// ============================================================
//  Fournit les opérations CRUD + invariants métier sur les
//  organisations et leurs adhésions. S'appuie sur la façade `db`
//  existante (`db.organization` / `db.membership`, voir firestore-extra).
//
//  Invariants garantis :
//    1. Un utilisateur est membre d'au plus UNE organisation active
//       (single-tenant membership — simplifie l'isolation des données).
//    2. Une organisation a toujours au moins un owner.
//    3. Le slug est unique (utilisé pour les URLs publiques / marketplace).
//
//  Toutes les écritures passent par la façade `db` (Firestore).
// ============================================================

import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import {
  normalizeOrgRole,
  normalizeOrgStatus,
  ORG_COLLECTIONS,
  type Membership,
  type OrgRole,
  type OrgStatus,
  type Organization,
} from './types';

// ============================================================
// Helpers (slug, identifiants)
// ============================================================

/** Génère un slug URL-safe unique à partir d'un nom. */
function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const suffix = randomUUID().slice(0, 8);
  return `${base || 'org'}-${suffix}`;
}

/** Construit un document Organization valide. */
function buildOrg(input: Pick<Organization, 'name' | 'ownerId'> & Partial<Organization>): Organization {
  const now = new Date();
  const slug = input.slug ? input.slug : slugify(input.name);
  return {
    id: input.id ?? `org_${randomUUID()}`,
    name: input.name.trim(),
    slug,
    status: normalizeOrgStatus(input.status ?? 'active'),
    plan: input.plan ?? 'free',
    ownerId: input.ownerId,
    billingEmail: input.billingEmail,
    seatLimit: input.seatLimit ?? 5,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
}

/** Construit un document Membership valide. */
function buildMembership(input: {
  orgId: string;
  userId: string;
  role: OrgRole;
  invitedBy?: string;
}): Membership {
  const now = new Date();
  return {
    id: `mbr_${randomUUID()}`,
    orgId: input.orgId,
    userId: input.userId,
    role: normalizeOrgRole(input.role),
    status: 'active',
    invitedBy: input.invitedBy,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================
// CRUD — Organisations
// ============================================================

export interface CreateOrgInput {
  name: string;
  ownerId: string;
  plan?: Organization['plan'];
  billingEmail?: string;
  seatLimit?: number;
}

export interface CreateOrgResult {
  org: Organization;
  membership: Membership;
}

/**
 * Crée une organisation et ajoute le fondateur comme `owner`. Vérifie
 * que le fondateur n'appartient pas déjà à une organisation active
 * (invariant single-tenant).
 */
export async function createOrganization(input: CreateOrgInput): Promise<CreateOrgResult> {
  const existing = await db.membership.findFirst({
    where: [
      { field: 'userId', op: '==', value: input.ownerId },
      { field: 'status', op: '==', value: 'active' },
    ],
    limit: 1,
  });
  if (existing) {
    throw new Error('ORG_ALREADY_MEMBER: cet utilisateur appartient déjà à une organisation active');
  }

  const org = buildOrg({
    name: input.name,
    ownerId: input.ownerId,
    plan: input.plan,
    billingEmail: input.billingEmail,
    seatLimit: input.seatLimit,
  });
  const membership = buildMembership({ orgId: org.id, userId: input.ownerId, role: 'owner' });

  await db.organization.create({ data: { ...org } });
  await db.membership.create({ data: { ...membership } });

  return { org, membership };
}

/**
 * Retrouve l'organisation active d'un utilisateur, ou null.
 * Centralise LE point d'entrée de résolution de tenant.
 */
export async function getOrgForUser(userId: string): Promise<{ org: Organization; membership: Membership } | null> {
  const membership = (await db.membership.findFirst({
    where: [
      { field: 'userId', op: '==', value: userId },
      { field: 'status', op: '==', value: 'active' },
    ],
    limit: 1,
  })) as Membership | null;
  if (!membership) return null;

  const org = await db.organization.findUnique({ where: { id: membership.orgId } });
  if (!org) return null;

  return { org: org as Organization, membership };
}

/**
 * Résout une organisation par id, en vérifiant que l'utilisateur en est
 * membre actif (contrôle d'accès par organisation).
 */
export async function getOrgForUserById(
  userId: string,
  orgId: string,
): Promise<{ org: Organization; membership: Membership } | null> {
  const membership = (await db.membership.findFirst({
    where: [
      { field: 'userId', op: '==', value: userId },
      { field: 'orgId', op: '==', value: orgId },
      { field: 'status', op: '==', value: 'active' },
    ],
    limit: 1,
  })) as Membership | null;
  if (!membership) return null;

  const org = await db.organization.findUnique({ where: { id: orgId } });
  if (!org) return null;

  return { org: org as Organization, membership };
}

/**
 * Liste les membres actifs d'une organisation (avec leur rôle).
 * Retourne un tableau de Membership — enrichi côté appelant avec les profils.
 */
export async function listOrgMembers(orgId: string): Promise<Membership[]> {
  const members = await db.membership.findMany({
    where: [
      { field: 'orgId', op: '==', value: orgId },
      { field: 'status', op: '==', value: 'active' },
    ],
    orderBy: [{ field: 'createdAt', direction: 'asc' }],
    limit: 200,
  });
  return (members as Membership[]).map((m) => ({ ...m, role: normalizeOrgRole(m.role) }));
}

// ============================================================
// Gestion des membres
// ============================================================

export interface AddMemberInput {
  orgId: string;
  userId: string;
  role?: OrgRole;
  invitedBy?: string;
}

/**
 * Ajoute un membre à une organisation. Garantit l'invariant single-tenant
 * en refusant un utilisateur déjà membre actif d'une autre organisation.
 */
export async function addMember(input: AddMemberInput): Promise<Membership> {
  const alreadyActive = await db.membership.findFirst({
    where: [
      { field: 'userId', op: '==', value: input.userId },
      { field: 'status', op: '==', value: 'active' },
    ],
    limit: 1,
  });
  if (alreadyActive) {
    throw new Error('MEMBER_ALREADY_ACTIVE: cet utilisateur est déjà membre d’une organisation');
  }

  const membership = buildMembership({
    orgId: input.orgId,
    userId: input.userId,
    role: input.role ?? 'member',
    invitedBy: input.invitedBy,
  });
  await db.membership.create({ data: { ...membership } });
  return membership;
}

/**
 * Met à jour le rôle d'un membre. Refuse de dégrader le dernier `owner`
 * (invariant : une org a toujours au moins un owner).
 */
export async function updateMemberRole(membershipId: string, newRole: OrgRole): Promise<void> {
  const membership = (await db.membership.findUnique({
    where: { id: membershipId },
  })) as Membership | null;
  if (!membership) throw new Error('MEMBERSHIP_NOT_FOUND');

  if (membership.role === 'owner' && newRole !== 'owner') {
    const otherOwners = await db.membership.findMany({
      where: [
        { field: 'orgId', op: '==', value: membership.orgId },
        { field: 'role', op: '==', value: 'owner' },
        { field: 'status', op: '==', value: 'active' },
      ],
      limit: 10,
    });
    const ownerCount = (otherOwners as Membership[]).filter((m) => m.id !== membershipId).length;
    if (ownerCount === 0) {
      throw new Error('LAST_OWNER: impossible de dégrader le dernier owner');
    }
  }

  await db.membership.update({
    where: { id: membershipId },
    data: { role: newRole, updatedAt: new Date() },
  });
}

/**
 * Retire un membre (statut `removed`). Refuse de retirer le dernier owner.
 */
export async function removeMember(membershipId: string): Promise<void> {
  const membership = (await db.membership.findUnique({
    where: { id: membershipId },
  })) as Membership | null;
  if (!membership) throw new Error('MEMBERSHIP_NOT_FOUND');

  if (membership.role === 'owner') {
    const otherOwners = await db.membership.findMany({
      where: [
        { field: 'orgId', op: '==', value: membership.orgId },
        { field: 'role', op: '==', value: 'owner' },
        { field: 'status', op: '==', value: 'active' },
      ],
      limit: 10,
    });
    const ownerCount = (otherOwners as Membership[]).filter((m) => m.id !== membershipId).length;
    if (ownerCount === 0) {
      throw new Error('LAST_OWNER: impossible de retirer le dernier owner');
    }
  }

  await db.membership.update({
    where: { id: membershipId },
    data: { status: 'removed', updatedAt: new Date() },
  });
}

// ============================================================
// Statut / plan
// ============================================================

/** Change le statut d'une organisation (trial -> active, suspend, cancel). */
export async function setOrgStatus(orgId: string, status: OrgStatus): Promise<void> {
  await db.organization.update({
    where: { id: orgId },
    data: { status, updatedAt: new Date() },
  });
}

/** Met à jour le plan et, optionnellement, la limite de sièges. */
export async function setOrgPlan(orgId: string, plan: Organization['plan'], seatLimit?: number): Promise<void> {
  const data: Record<string, unknown> = { plan, updatedAt: new Date() };
  if (typeof seatLimit === 'number') data.seatLimit = seatLimit;
  await db.organization.update({ where: { id: orgId }, data });
}

/** Compte les membres actifs (pour appliquer la limite de sièges). */
export async function countActiveMembers(orgId: string): Promise<number> {
  const members = await db.membership.findMany({
    where: [
      { field: 'orgId', op: '==', value: orgId },
      { field: 'status', op: '==', value: 'active' },
    ],
    limit: 1000,
  });
  return (members as Membership[]).length;
}

export { ORG_COLLECTIONS };
