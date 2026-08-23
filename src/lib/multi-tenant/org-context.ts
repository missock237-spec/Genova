// ============================================================
// Gen3ia — Organisation context (enrichissement de session)
// ============================================================
//  Expose la résolution de l'organisation courante pour un utilisateur
//  authentifié, prête à brancher dans `withAuth` / `applySecurity`.
//
//  Usage côté API :
//    const orgCtx = await getOrgContext(auth.userId);
//    if (orgCtx.member) { /* scope les requêtes par orgCtx.org!.org.id */ }
// ============================================================

import { getOrgForUser } from './org-service';
import { hasOrgPermission, type OrgRole, type ResolvedOrg } from './types';

export interface OrgContext {
  member: boolean;
  org?: ResolvedOrg;
  role?: OrgRole;
  can: (permission: string) => boolean;
}

/**
 * Résout le contexte d'organisation d'un utilisateur. Léger et n'échoue
 * jamais (retourne `member: false` si l'utilisateur n'a pas d'org),
 * pour ne pas casser les routes existantes mono-utilisateur.
 */
export async function getOrgContext(userId: string): Promise<OrgContext> {
  const result = await getOrgForUser(userId);
  if (!result) {
    return {
      member: false,
      can: () => false,
    };
  }

  const resolved: ResolvedOrg = {
    org: result.org,
    membership: result.membership,
    role: result.membership.role,
    permissions: [],
  };

  return {
    member: true,
    org: resolved,
    role: result.membership.role,
    can: (permission: string) => hasOrgPermission(result.membership.role, permission),
  };
}
