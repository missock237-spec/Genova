// ============================================================
// Gen3ia — Contrôle d'Accès Basé sur les Rôles (RBAC)
// ============================================================
//  Système centralisé de gestion des permissions granulaires.
//  Définit les rôles prédéfinis, les permissions associées et
//  l'héritage entre rôles. Toute vérification de permission dans
//  le plan de contrôle passe par ce module.
//
//  Principes :
//    - Les permissions sont des chaînes `ressource:action`.
//    - Les rôles héritent implicitement d'un rôle parent (chaîne
//      d'héritage résolue par `getEffectivePermissions`).
//    - `requirePermission` retourne un résultat détaillé pour les
//      erreurs 403 (liste des permissions manquantes).
// ============================================================

/**
 * Union de toutes les permissions reconnues par le système.
 * Format : `<ressource>:<action>`. Chaque permission est fine-
 * grained pour permettre une politique de moindre privilège.
 *
 * @example
 * ```ts
 * import { hasPermission, Permission } from '@/lib/control-plane/rbac';
 * if (hasPermission('admin', 'agents:execute')) { ... }
 * ```
 */
export type Permission =
  | 'agents:read'
  | 'agents:write'
  | 'agents:delete'
  | 'agents:execute'
  | 'tasks:read'
  | 'tasks:write'
  | 'tasks:delete'
  | 'workflows:read'
  | 'workflows:write'
  | 'workflows:execute'
  | 'models:read'
  | 'models:configure'
  | 'tools:read'
  | 'tools:configure'
  | 'users:read'
  | 'users:manage'
  | 'billing:read'
  | 'billing:manage'
  | 'org:read'
  | 'org:manage'
  | 'org:admin'
  | 'system:admin'
  | 'audit:read'
  | 'policies:read'
  | 'policies:write';

/**
 * Définition d'un rôle RBAC.
 * Chaque rôle possède un nom, une liste de permissions directes
 * et, optionnellement, un rôle parent dont il hérite des permissions.
 *
 * @property name - Identifiant unique du rôle (ex: `admin`).
 * @property permissions - Liste des permissions accordées directement.
 * @property inherits - Nom du rôle parent. Les permissions du parent
 *   sont fusionnées avec celles du rôle courant (pas de surcharge).
 */
export interface RoleDefinition {
  name: string;
  permissions: Permission[];
  inherits?: string;
}

// ============================================================
// Rôles prédéfinis
// ============================================================

/** Rôle en lecture seule — consultation des agents, tâches et workflows. */
const VIEWER: RoleDefinition = {
  name: 'viewer',
  permissions: [
    'agents:read',
    'tasks:read',
    'workflows:read',
    'models:read',
    'tools:read',
    'users:read',
    'billing:read',
    'org:read',
    'audit:read',
    'policies:read',
  ],
};

/** Rôle utilisateur standard — lecture + création/exécution d'agents. */
const USER: RoleDefinition = {
  name: 'user',
  permissions: [
    'agents:read',
    'agents:write',
    'agents:execute',
    'tasks:read',
    'tasks:write',
    'workflows:read',
    'workflows:execute',
    'models:read',
    'tools:read',
    'users:read',
    'billing:read',
    'org:read',
    'policies:read',
  ],
  inherits: 'viewer',
};

/** Rôle créateur — peut supprimer ses ressources et configurer des outils. */
const CREATOR: RoleDefinition = {
  name: 'creator',
  permissions: [
    'agents:delete',
    'tasks:delete',
    'tools:configure',
  ],
  inherits: 'user',
};

/** Rôle administrateur — gestion des utilisateurs, facturation et organisation. */
const ADMIN: RoleDefinition = {
  name: 'admin',
  permissions: [
    'users:manage',
    'billing:manage',
    'org:manage',
    'org:admin',
    'models:configure',
    'policies:write',
    'workflows:write',
  ],
  inherits: 'creator',
};

/** Rôle super-administrateur — accès total au système, y compris l'administration système. */
const SUPER_ADMIN: RoleDefinition = {
  name: 'super_admin',
  permissions: [
    'system:admin',
  ],
  inherits: 'admin',
};

/**
 * Registre de tous les rôles définis dans le système.
 * Clé = nom du rôle, valeur = définition complète.
 * Ce registre peut être étendu dynamiquement pour les rôles
 * personnalisés (multi-tenant) via un appel à
 * `registerCustomRole()` dans une future version.
 */
export const ROLE_DEFINITIONS: Record<string, RoleDefinition> = {
  viewer: VIEWER,
  user: USER,
  creator: CREATOR,
  admin: ADMIN,
  super_admin: SUPER_ADMIN,
};

// ============================================================
// Cache d'héritage (optimisation en lecture)
// ============================================================

/** Cache LRU interne pour les permissions effectives résolues. */
const effectivePermissionsCache = new Map<string, Permission[]>();

/** Taille maximale du cache (plafonné pour éviter les fuites mémoire). */
const CACHE_MAX_SIZE = 256;

/**
 * Résout l'ensemble des permissions effectives d'un rôle,
 * en remontant la chaîne d'héritage.
 *
 * L'héritage est transitif : si `admin` hérite de `creator`,
 * qui hérite de `user`, qui hérite de `viewer`, alors `admin`
 * possède toutes les permissions de `viewer`, `user` et `creator`
 * plus les siennes.
 *
 * Les résultats sont mis en cache pour éviter de parcourir la
 * chaîne d'héritage à chaque appel.
 *
 * @param role - Nom du rôle à résoudre (ex: `admin`).
 * @returns Ensemble des permissions (sans doublon) dont le rôle dispose.
 *
 * @example
 * ```ts
 * const perms = getEffectivePermissions('creator');
 * // Contient : permissions de viewer + user + creator
 * ```
 */
export function getEffectivePermissions(role: string): Permission[] {
  // Vérifie le cache
  const cached = effectivePermissionsCache.get(role);
  if (cached) return cached;

  const visited = new Set<string>();
  const result = new Set<Permission>();

  /** Fonction récursive interne de résolution. */
  function resolve(currentRole: string): void {
    // Protection contre les cycles d'héritage
    if (visited.has(currentRole)) return;
    visited.add(currentRole);

    const definition = ROLE_DEFINITIONS[currentRole];
    if (!definition) return;

    // Ajoute les permissions directes
    for (const perm of definition.permissions) {
      result.add(perm);
    }

    // Résout le rôle parent
    if (definition.inherits) {
      resolve(definition.inherits);
    }
  }

  resolve(role);
  const permissions = Array.from(result);

  // Met à jour le cache avec éviction LRU simple
  if (effectivePermissionsCache.size >= CACHE_MAX_SIZE) {
    const firstKey = effectivePermissionsCache.keys().next().value;
    if (firstKey !== undefined) effectivePermissionsCache.delete(firstKey);
  }
  effectivePermissionsCache.set(role, permissions);

  return permissions;
}

/**
 * Vérifie si un rôle donné possède une permission spécifique.
 * Résout l'héritage automatiquement via `getEffectivePermissions`.
 *
 * @param userRole - Nom du rôle de l'utilisateur.
 * @param requiredPermission - Permission requise.
 * @returns `true` si la permission est accordée, `false` sinon.
 *
 * @example
 * ```ts
 * if (!hasPermission(user.role, 'agents:delete')) {
 *   return NextResponse.json({ error: 'Interdit' }, { status: 403 });
 * }
 * ```
 */
export function hasPermission(userRole: string, requiredPermission: Permission): boolean {
  const permissions = getEffectivePermissions(userRole);
  return permissions.includes(requiredPermission);
}

/**
 * Vérifie les permissions requises et retourne un résultat détaillé.
 * Contrairement à `hasPermission` (booléen), cette fonction retourne
 * la liste des permissions manquantes, utile pour les messages d'erreur
 * HTTP 403 ou les logs d'audit.
 *
 * @param userRole - Nom du rôle de l'utilisateur.
 * @param requiredPermission - Permission requise.
 * @returns Objet contenant `allowed` (booléen) et, si `false`,
 *   la liste `missing` des permissions non accordées.
 *
 * @example
 * ```ts
 * const result = requirePermission(user.role, 'system:admin');
 * if (!result.allowed) {
 *   console.warn('Permissions manquantes:', result.missing);
 * }
 * ```
 */
export function requirePermission(
  userRole: string,
  requiredPermission: Permission,
): { allowed: boolean; missing?: Permission[] } {
  const permissions = getEffectivePermissions(userRole);

  if (permissions.includes(requiredPermission)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    missing: [requiredPermission],
  };
}

/**
 * Invalide le cache des permissions effectives.
 * Utile après l'enregistrement dynamique d'un nouveau rôle
 * ou la modification d'une définition existante.
 */
export function invalidatePermissionCache(): void {
  effectivePermissionsCache.clear();
}
