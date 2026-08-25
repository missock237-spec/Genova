// ============================================================
// SNYK CLIENT — Scan de vulnérabilités des dépendances
//
// Client production pour l'API Snyk (https://snyk.io/) via fetch brut,
// sans dépendance tierce. Permet de lister les projets/organisations et
// de retrouver les vulnérabilités (issues) des dépendances d'un projet.
//
// Configuration (variables d'environnement) :
//   SNYK_TOKEN    — jeton d'API Snyk (obligatoire pour tout appel)
//   SNYK_ORG_ID   — identifiant de l'organisation Snyk (optionnel,
//                   requis uniquement pour les méthodes par org)
//   SNYK_API_URL  — URL de base (défaut : https://api.snyk.io)
//
// Méthodes exposées :
//   isConfigured()          — true si SNYK_TOKEN est présent
//   listOrganizations()     — liste les organisations accessibles
//   listProjects(orgId)     — liste les projets d'une organisation
//   getProjectIssues(...)   — vulnérabilités/améliorations d'un projet
//   getDependencyGraph(orgId, projectId)
// ============================================================

import { createLogger } from './logger';

const log = createLogger('snyk');

const SNYK_API_URL = process.env.SNYK_API_URL || 'https://api.snyk.io';
const API_VERSION = '2024-01-23';

/** État d'une vulnérabilité/issue Snyk (shape utile). */
export interface SnykIssueSummary {
  id: string;
  type: string;
  title: string;
  severity: string;
  status: string;
  url?: string;
}

export interface SnykProjectSummary {
  id: string;
  name: string;
  type: string;
  origin: string;
  issueCounts?: Record<string, number>;
}

/** @returns le jeton Snyk configuré ('' si absent). */
function token(): string {
  return process.env.SNYK_TOKEN || '';
}

/** @returns true si Snyk est configuré (jeton présent). */
export function isSnykConfigured(): boolean {
  return Boolean(process.env.SNYK_TOKEN);
}

/** @returns les en-têtes d'authentification Snyk. */
function authHeaders(): Record<string, string> {
  return {
    Authorization: `token ${token()}`,
    'Content-Type': 'application/json',
    'snyk-version': API_VERSION,
  };
}

/** Enveloppe un appel fetch vers Snyk avec gestion d'erreur. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isSnykConfigured()) {
    throw new Error('Snyk non configuré : SNYK_TOKEN manquant');
  }
  const res = await fetch(`${SNYK_API_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers || {}) },
    signal: init.signal ?? AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Snyk ${init.method || 'GET'} ${path} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Client Snyk.
 */
export class SnykClient {
  /**
   * Liste les organisations accessibles avec le jeton courant.
   * Endpoint : GET /v1/orgs (API REST v1).
   */
  async listOrganizations(): Promise<Array<{ id: string; name: string; slug?: string }>> {
    const data = await request<{ orgs?: Array<{ id: string; name: string; slug?: string }> }>('/v1/orgs');
    return (data.orgs || []).map((o) => ({ id: o.id, name: o.name, slug: o.slug }));
  }

  /**
   * Liste les projets d'une organisation.
   * Endpoint : GET /rest/orgs/{orgId}/projects
   */
  async listProjects(orgId?: string): Promise<SnykProjectSummary[]> {
    const id = orgId || process.env.SNYK_ORG_ID || '';
    if (!id) throw new Error('SNYK_ORG_ID requis pour lister les projets');
    const data = await request<{ data?: Array<Record<string, unknown>> }>(`/rest/orgs/${id}/projects?version=${API_VERSION}&limit=100`);
    return (data.data || []).map((p) => ({
      id: (p.id as string) || '',
      name: ((p.attributes as Record<string, unknown>)?.name as string) || '',
      type: ((p.attributes as Record<string, unknown>)?.type as string) || '',
      origin: ((p.attributes as Record<string, unknown>)?.origin as string) || '',
      ...(p.meta?.latest_issue_counts ? { issueCounts: p.meta.latest_issue_counts as Record<string, number> } : {}),
    }));
  }

  /**
   * Récupère les vulnérabilités/améliorations d'un projet.
   * Endpoint : GET /rest/orgs/{orgId}/projects/{projectId}/issues
   */
  async getProjectIssues(
    projectId: string,
    orgId?: string,
  ): Promise<SnykIssueSummary[]> {
    const id = orgId || process.env.SNYK_ORG_ID || '';
    if (!id) throw new Error('SNYK_ORG_ID requis pour lister les issues');
    const data = await request<{ data?: Array<Record<string, unknown>> }>(
      `/rest/orgs/${id}/projects/${projectId}/issues?version=${API_VERSION}&limit=100`,
    );
    return (data.data || []).map((i) => {
      const attrs = (i.attributes as Record<string, unknown>) || {};
      const issues = attrs.issues as Array<Record<string, unknown>> | undefined;
      const first = issues?.[0] || {};
      return {
        id: (i.id as string) || '',
        type: (i.type as string) || '',
        title: (first.title as string) || (attrs.title as string) || '',
        severity: ((first.severity as Record<string, unknown>)?.value as string)
          || ((attrs.severity as Record<string, unknown>)?.value as string)
          || '',
        status: (attrs.status as string) || '',
        url: (first.url as string) || undefined,
      };
    });
  }

  /**
   * Récupère le graphe de dépendances d'un projet.
   * Endpoint : GET /rest/orgs/{orgId}/projects/{projectId}/dep-graph
   */
  async getDependencyGraph(projectId: string, orgId?: string): Promise<Record<string, unknown>> {
    const id = orgId || process.env.SNYK_ORG_ID || '';
    if (!id) throw new Error('SNYK_ORG_ID requis pour le graphe de dépendances');
    const data = await request<{ data?: Record<string, unknown> }>(
      `/rest/orgs/${id}/projects/${projectId}/dep-graph?version=${API_VERSION}`,
    );
    return (data.data || {}) as Record<string, unknown>;
  }
}

export const snyk = new SnykClient();
export default snyk;
