// ============================================================
// GET /api/version — Version Information Endpoint
// ============================================================
// Returns current version, supported versions, deprecation status,
// and sunset dates. Public endpoint.
// Includes X-API-Version and Sunset headers in response.
// ============================================================

import { NextResponse } from 'next/server';
import {
  CURRENT_API_VERSION,
  SUPPORTED_API_VERSIONS,
  DEFAULT_API_VERSION,
  API_VERSION_CONFIGS,
  getApiVersion,
  getSunsetHeaderValue,
  isVersionDeprecated,
} from '@/lib/api-version';

// [server-04] Edge runtime — pas de DB, pas de Node.js APIs, pur calcul statique
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestedVersion = getApiVersion(request);
  const activeVersion = requestedVersion || CURRENT_API_VERSION;

  const responseHeaders: Record<string, string> = {
    'X-API-Version': CURRENT_API_VERSION,
    'Content-Type': 'application/json',
  };

  const sunsetHeader =
    getSunsetHeaderValue(activeVersion) || getSunsetHeaderValue(CURRENT_API_VERSION);
  if (sunsetHeader) {
    responseHeaders['Sunset'] = sunsetHeader;
  }

  const responsePayload = {
    currentVersion: CURRENT_API_VERSION,
    supportedVersions: SUPPORTED_API_VERSIONS,
    defaultVersion: DEFAULT_API_VERSION,
    requestedVersion,
    isDeprecated: isVersionDeprecated(activeVersion),
    versions: API_VERSION_CONFIGS,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(responsePayload, {
    status: 200,
    headers: responseHeaders,
  });
}
