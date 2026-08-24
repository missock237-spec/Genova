// ============================================================
// Plugin Engine — Moteur d'exécution production
// Proxy API sécurisé avec retry, audit, SSRF protection
// ============================================================

import type {  PluginCatalogEntry,
  PluginAction,
  ExecuteActionRequest,
  ExecuteActionResult,
  PluginConnectRequest,
  UserPluginConnection,
} from './types';
import { PLUGIN_CATALOG } from './catalog';
import { encryptCredentials, decryptCredentials, buildAuthHeaders } from './credentials';
import { createLogger } from '@/lib/logger';

const log = createLogger('plugin-engine');

// ─── SSRF Protection v2 — couvre 43+ APIs du catalogue ───
const ALLOWED_HOSTNAME_PATTERNS = [
  /^api\./, /^www\./, /^app\./, /^cdn\./, /^hooks\./,
  // Google
  /\.googleapis\.com$/, /\.google\.com$/,
  // Communication
  /\.slack\.com$/, /discord\.com$/, /\.twitter\.com$/, /\.x\.com$/,
  /graph\.facebook\.com$/, /api\.linkedin\.com$/, /api\.intercom\.io$/,
  /graph\.microsoft\.com$/, /api\.zoom\.us$/,
  // DevOps
  /\.github\.com$/, /\.gitlab\.com$/, /api\.linear\.app$/,
  /circleci\.com$/, /api\.datadoghq\.com$/, /api\.pagerduty\.com$/,
  // Productivité
  /\.notion\.so$/, /api\.airtable\.com$/, /api\.figma\.com$/,
  /api\.typeform\.com$/,
  // Paiement & Finance
  /\.stripe\.com$/, /quickbooks\.api\.intuit\.com$/,
  // Email & Notification
  /\.sendgrid\.com$/, /\.twilio\.com$/, /api\.pushover\.net$/,
  // Marketing & CRM
  /\.hubapi\.com$/, /\.mailchimp\.com$/,
  // Stockage & Cloud
  /\.dropboxapi\.com$/, /\.vercel\.com$/, /\.amazonaws\.com$/,
  /\.myshopify\.com$/, /\.supabase\.co$/,
  // Project Management
  /\.atlassian\.net$/, /\.trello\.com$/, /\.asana\.com$/,
  // IA
  /\.openai\.com$/, /\.anthropic\.com$/,
];

const BLOCKED_HOSTNAMES = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', 'metadata.google.internal'];

function isUrlAllowed(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (BLOCKED_HOSTNAMES.includes(hostname)) return false;
  if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return false;
  return ALLOWED_HOSTNAME_PATTERNS.some((p) => p.test(hostname));
}

// ─── Retry (exponential backoff) ───
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 500
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < maxRetries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, i)));
      }
    }
  }
  throw lastErr;
}

// ─── URL Substitution ───
function substituteUrlParams(
  endpoint: string,
  params: Record<string, unknown>,
  urlParamNames: string[]
): { url: string; bodyParams: Record<string, unknown> } {
  let resolvedEndpoint = endpoint;
  const bodyParams: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (urlParamNames.includes(key)) {
      resolvedEndpoint = resolvedEndpoint.replace(`{${key}}`, String(value));
    } else {
      bodyParams[key] = value;
    }
  }

  return { url: resolvedEndpoint, bodyParams };
}

// ─── Public API ───

/** Liste les plugins du catalogue (avec filtre optionnel) */
export function listCatalog(category?: string, query?: string) {
  let entries = Object.values(PLUGIN_CATALOG);
  if (category) {
    entries = entries.filter((e) => e.categories.includes(category));
  }
  if (query) {
    const q = query.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
    );
  }
  return entries
    .sort((a, b) => a.popularityRank - b.popularityRank)
    .map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      icon: e.icon,
      categories: e.categories,
      authType: e.authType,
      docsUrl: e.docsUrl,
      website: e.website,
      actionCount: Object.keys(e.actions).length,
      actions: Object.fromEntries(
        Object.entries(e.actions).map(([key, action]) => [
          key,
          {
            id: key,
            name: action.name,
            description: action.description,
            method: action.method,
            endpoint: action.endpoint,
            params: action.params,
          },
        ])
      ),
    }));
}

/** Récupère les détails d'un plugin */
export function getPluginDetail(appId: string) {
  const entry = PLUGIN_CATALOG[appId];
  if (!entry) return null;
  return {
    ...entry,
    actionCount: Object.keys(entry.actions).length,
  };
}

/** Exécute une action sur un plugin connecté */
export async function executeAction(
  userId: string,
  request: ExecuteActionRequest,
  getStoredConnection: (appId: string) => Promise<UserPluginConnection | null>,
  logExecution: (data: Record<string, unknown>) => Promise<void>
): Promise<ExecuteActionResult> {
  const startTime = Date.now();
  const { appId, actionId, params } = request;

  // 1. Vérifier que le plugin existe
  const plugin = PLUGIN_CATALOG[appId];
  if (!plugin) {
    return { success: false, error: `Plugin « ${appId} » introuvable dans le catalogue.`, durationMs: Date.now() - startTime };
  }

  // 2. Vérifier l'action
  const action: PluginAction | undefined = plugin.actions[actionId];
  if (!action) {
    return { success: false, error: `Action « ${actionId} » non disponible pour ${plugin.name}. Actions: ${Object.keys(plugin.actions).join(', ')}`, durationMs: Date.now() - startTime };
  }

  // 3. Vérifier les paramètres requis
  for (const p of action.params) {
    if (p.required && params[p.name] === undefined) {
      return { success: false, error: `Paramètre requis manquant: ${p.name} (${p.description})`, durationMs: Date.now() - startTime };
    }
  }

  // 4. Récupérer les identifiants chiffrés
  let connection: UserPluginConnection | null;
  try {
    connection = await getStoredConnection(appId);
  } catch (err) {
    log.error('credential_fetch_failed', { appId, userId, error: String(err) });
    return { success: false, error: 'Impossible de récupérer les identifiants.', durationMs: Date.now() - startTime };
  }

  if (!connection || !connection.isActive) {
    return { success: false, error: `Plugin « ${plugin.name} » non connecté. Connectez-le d'abord.`, durationMs: Date.now() - startTime };
  }

  // 5. Déchiffrer les identifiants
  let credentials: Record<string, string | undefined>;
  try {
    credentials = await decryptCredentials(userId, appId, connection.encryptedCredentials, connection.iv);
  } catch (err) {
    log.error('credential_decrypt_failed', { appId, userId, error: String(err) });
    return { success: false, error: 'Erreur de déchiffrement des identifiants.', durationMs: Date.now() - startTime };
  }

  // 6. Construire l'URL
  const { url: endpointPath, bodyParams } = substituteUrlParams(
    action.endpoint,
    params,
    action.urlParams || []
  );
  const fullUrl = `${plugin.baseUrl}${endpointPath}`;

  // 7. SSRF protection
  if (!isUrlAllowed(fullUrl)) {
    log.warn('ssrf_blocked', { appId, actionId, url: fullUrl });
    return { success: false, error: 'URL bloquée (politique de sécurité).', durationMs: Date.now() - startTime };
  }

  // 8. Headers
  const headers: Record<string, string> = {
    ...buildAuthHeaders(plugin.authType, credentials, appId),
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'Gen3ia-PluginEngine/1.0',
  };

  // Notion requiert un header spécifique
  if (appId === 'notion') {
    headers['Notion-Version'] = '2022-06-28';
  }
  // Asana requiert l'accept
  if (appId === 'asana') {
    headers['Accept'] = 'application/json';
  }

  // 9. Exécuter avec retry
  try {
    const result = await withRetry(async () => {
      const fetchOptions: RequestInit = {
        method: action.method,
        headers,
        signal: AbortSignal.timeout(action.timeoutMs || 15000),
      };
      if (action.method !== 'GET' && action.method !== 'HEAD') {
        fetchOptions.body = JSON.stringify(bodyParams);
      }
      const response = await fetch(fullUrl, fetchOptions);
      const contentType = response.headers.get('content-type') || '';
      let data: unknown;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }
      if (!response.ok) {
        const status = response.status;
        const errMsg = typeof data === 'object' && data !== null && 'message' in (data as Record<string, unknown>)
          ? String((data as Record<string, unknown>).message)
          : `HTTP ${status}`;
        throw Object.assign(new Error(errMsg), { status });
      }
      return { success: true as const, data, status: response.status };
    });

    // 10. Audit log (fire-and-forget)
    logExecution({
      userId,
      appId,
      actionId,
      status: 'success',
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    log.info('plugin_action_executed', { appId, actionId, durationMs: Date.now() - startTime });
    return { ...result, durationMs: Date.now() - startTime };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number }).status;

    logExecution({
      userId,
      appId,
      actionId,
      status: 'failed',
      error,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    log.error('plugin_action_failed', { appId, actionId, error, durationMs: Date.now() - startTime });
    return { success: false, error, status, durationMs: Date.now() - startTime };
  }
}

/** Connecte un plugin (stocke les identifiants chiffrés) */
export async function connectPlugin(
  userId: string,
  request: PluginConnectRequest,
  saveConnection: (data: Record<string, unknown>) => Promise<string>
): Promise<{ success: boolean; connectionId: string; error?: string }> {
  const { appId, credentials, displayLabel } = request;
  const plugin = PLUGIN_CATALOG[appId];
  if (!plugin) {
    return { success: false, connectionId: '', error: `Plugin « ${appId} » introuvable.` };
  }

  if (!credentials?.apiKey && !credentials?.accessToken && !credentials?.username) {
    return { success: false, connectionId: '', error: 'Au moins un identifiant est requis (apiKey, accessToken ou username).' };
  }

  try {
    const { encryptedCredentials, iv } = await encryptCredentials(userId, appId, credentials);
    const connectionId = await saveConnection({
      userId,
      appId,
      encryptedCredentials,
      iv,
      displayLabel: displayLabel || `${plugin.name} (${credentials.username || '***'})`,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    log.info('plugin_connected', { appId, userId });
    return { success: true, connectionId };
  } catch (err) {
    log.error('plugin_connect_failed', { appId, userId, error: String(err) });
    return { success: false, connectionId: '', error: String(err) };
  }
}

/** Déconnecte un plugin */
export async function disconnectPlugin(
  userId: string,
  appId: string,
  deleteConnection: (appId: string) => Promise<void>
): Promise<{ success: boolean; error?: string }> {
  try {
    await deleteConnection(appId);
    log.info('plugin_disconnected', { appId, userId });
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
