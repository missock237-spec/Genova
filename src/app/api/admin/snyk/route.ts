// ============================================================
// API Admin — Snyk (scan de vulnérabilités des dépendances)
//
// Route sécurisée (admin uniquement) exposant le client Snyk
// (src/lib/snyk-client.ts) pour inspecter les organisations,
// projets et vulnérabilités des dépendances du projet.
//
//   GET ?scope=orgs                    -> organisations accessibles
//   GET ?scope=projects[&orgId=]       -> projets d'une organisation
//   GET ?scope=issues&orgId=&projectId= -> vulnérabilités d'un projet
//   GET ?scope=deps&orgId=&projectId=   -> graphe de dépendances
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { snyk, isSnykConfigured } from '@/lib/snyk-client';
import { createLogger } from '@/lib/logger';

const log = createLogger('admin-snyk');

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Auth + RBAC : réservé aux admins (comme src/app/api/admin/route.ts).
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return secureResponse(NextResponse.json({ error: 'Non authentifie' }, { status: 401 }), request);
  }
  if (auth.role !== 'admin') {
    return secureResponse(NextResponse.json({ error: 'Acces reserve aux admins' }, { status: 403 }), request);
  }
  if (!isSnykConfigured()) {
    return secureResponse(NextResponse.json({ error: 'Snyk non configuré: SNYK_TOKEN manquant' }, { status: 503 }), request);
  }

  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'orgs';
    const orgId = url.searchParams.get('orgId') || process.env.SNYK_ORG_ID || undefined;
    const projectId = url.searchParams.get('projectId');

    switch (scope) {
      case 'orgs': {
        const orgs = await snyk.listOrganizations();
        return secureResponse(NextResponse.json({ success: true, orgs }), request);
      }

      case 'projects': {
        if (!orgId) {
          return secureResponse(NextResponse.json({ error: 'orgId ou SNYK_ORG_ID requis' }, { status: 400 }), request);
        }
        const projects = await snyk.listProjects(orgId);
        return secureResponse(NextResponse.json({ success: true, projects }), request);
      }

      case 'issues': {
        if (!orgId || !projectId) {
          return secureResponse(NextResponse.json({ error: 'orgId et projectId requis' }, { status: 400 }), request);
        }
        const issues = await snyk.getProjectIssues(projectId, orgId);
        return secureResponse(NextResponse.json({ success: true, issues }), request);
      }

      case 'deps': {
        if (!orgId || !projectId) {
          return secureResponse(NextResponse.json({ error: 'orgId et projectId requis' }, { status: 400 }), request);
        }
        const graph = await snyk.getDependencyGraph(projectId, orgId);
        return secureResponse(NextResponse.json({ success: true, dependencies: graph }), request);
      }

      default:
        return secureResponse(NextResponse.json({ error: 'Scope inconnu' }, { status: 400 }), request);
    }
  } catch (err) {
    log.error('snyk_admin_error', { error: (err as Error).message });
    return secureResponse(NextResponse.json({ error: (err as Error).message }, { status: 500 }), request);
  }
}
