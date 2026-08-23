// ============================================================
// GET /api/app-version — Version de l'application pour le client
// ============================================================
// Endpoint public (pas d'auth) utilisé par le système d'auto-update
// pour détecter quand une nouvelle version est déployée.
//
// Retourne la version, le SHA du build, et un flag forceUpdate
// que le client peut utiliser pour décider s'il doit recharger.
//
// Cache HTTP STRICTEMENT désactivé (no-store) : chaque push GitHub
// déclenche un déploiement Vercel, et le navigateur doit charger la
// nouvelle version de façon instantanée. Toute cache (navigateur,
// CDN, Vercel) est explicitement désactivée pour cet endpoint.
// ============================================================

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const startTime = Date.now();

interface AppVersionResponse {
  version: string;
  gitSha: string;
  gitBranch: string;
  buildTime: string;
  buildId: string;
  buildEnv: string;
  forceUpdate: boolean;
  minSupportedVersion?: string;
  /** Timestamp du dernier déploiement (epoch ms) */
  deployedAt: number;
  uptime: number;
}

/**
 * Version minimale supportée. Si un client a une version
 * antérieure, il DOIT mettre à jour (pas de choix).
 *
 * Format semver: 'X.Y.Z'. Les clients comparent avec semver-coerce
 * (ignore les pré-release tags).
 *
 * Mettre à jour cette constante quand une breaking change
 * rend les anciens clients incompatibles.
 */
const MIN_SUPPORTED_VERSION = '0.10.0';

/**
 * Map de versions qui nécessitent une mise à jour forcée.
 * La clé est la version client, la valeur est la version minimale requise.
 * Si la version du client est dans cette map OU est < MIN_SUPPORTED_VERSION,
 * forceUpdate sera true.
 */
const FORCE_UPDATE_VERSIONS: Record<string, string> = {
  // Exemple: '0.8.5': '0.10.0', // Les utilisateurs de 0.8.5 doivent au moins être en 0.10.0
};

function semverCoerce(v: string): [number, number, number] {
  const match = v.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function semverGte(a: string, b: string): boolean {
  const [amaj, amin, apatch] = semverCoerce(a);
  const [bmaj, bmin, bpatch] = semverCoerce(b);
  if (amaj !== bmaj) return amaj > bmaj;
  if (amin !== bmin) return amin > bmin;
  return apatch >= bpatch;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientVersion = searchParams.get('v') || '';
  const clientBuildId = searchParams.get('buildId') || '';

  const version = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';
  const gitSha = process.env.NEXT_PUBLIC_GIT_SHA || 'unknown';
  const gitBranch = process.env.NEXT_PUBLIC_GIT_BRANCH || 'unknown';
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString();
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID || `${version}-${gitSha}`;
  const buildEnv = process.env.NEXT_PUBLIC_BUILD_ENV || process.env.NODE_ENV || 'unknown';

  // Déterminer si le client doit mettre à jour
  let forceUpdate = false;
  let minSupportedVersion: string | undefined;

  if (clientVersion) {
    // 1. Vérifier la version minimale supportée
    if (!semverGte(clientVersion, MIN_SUPPORTED_VERSION)) {
      forceUpdate = true;
      minSupportedVersion = MIN_SUPPORTED_VERSION;
    }

    // 2. Vérifier les versions forcées spécifiques
    if (!forceUpdate && FORCE_UPDATE_VERSIONS[clientVersion]) {
      forceUpdate = true;
      minSupportedVersion = FORCE_UPDATE_VERSIONS[clientVersion];
    }
  }

  // 3. Si le buildId du client est différent du serveur, une mise à jour est disponible
  //    Toujours un booléen strict (pas de chaîne vide), pour une API prévisible.
  const updateAvailable = Boolean(clientBuildId && clientBuildId !== buildId);

  const response: AppVersionResponse = {
    version,
    gitSha,
    gitBranch,
    buildTime,
    buildId,
    buildEnv,
    forceUpdate,
    minSupportedVersion,
    deployedAt: startTime,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };

  return NextResponse.json(
    { ...response, updateAvailable },
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Aucune cache nulle part : le navigateur doit voir la nouvelle
        // version dès le déploiement Vercel terminé.
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
        // Version actuelle en header pour les outils de monitoring
        'X-App-Version': version,
        'X-Build-Id': buildId,
      },
    }
  );
}
