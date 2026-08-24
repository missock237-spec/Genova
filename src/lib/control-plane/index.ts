// ============================================================
// Gen3ia — Plan de Contrôle (barrel export)
// ============================================================
//  Point d'entrée unique pour tous les modules du plan de contrôle.
//  Chaque sous-module est ré-exporté individuellement pour permettre
//  les imports granulaires si nécessaire :
//
//    import { hasPermission } from '@/lib/control-plane/rbac';
//    import { checkQuota } from '@/lib/control-plane/quotas';
//
//  Ou import groupé :
//
//    import { hasPermission, checkQuota, resolveTenant } from '@/lib/control-plane';
// ============================================================

// --- RBAC (Contrôle d'accès basé sur les rôles) ---
export {
  type Permission,
  type RoleDefinition,
  ROLE_DEFINITIONS,
  getEffectivePermissions,
  hasPermission,
  requirePermission,
  invalidatePermissionCache,
} from './rbac';

// --- Quotas (Gestion des limites par plan) ---
export {
  type QuotaType,
  type QuotaLimit,
  type QuotaCheckResult,
  PLAN_QUOTAS,
  checkQuota,
  incrementUsage,
  resetUsage,
} from './quotas';

// --- Multi-tenance (Organisations et adhésions) ---
export {
  type ResolvedOrg,
  type Organization,
  type OrgMember,
  resolveTenant,
  createOrganization,
  addOrgMember,
  removeOrgMember,
  getOrgMembers,
} from './multi-tenant';

// --- Clés API ---
export {
  type ApiKeySpecs,
  type ApiKeyCreateResult,
  type ApiKeyMasked,
  type ApiKeyValidation,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  validateApiKey,
} from './api-keys';

// --- Audit ---
export {
  type AuditEventType,
  type AuditSeverity,
  type AuditParams,
  type AuditEntry,
  audit,
  getUserAuditLog,
} from './audit';

// --- Santé du système ---
export {
  type HealthCheckResult,
  type HealthStatus,
  type SystemHealthResult,
  checkSystemHealth,
} from './health';
