// ============================================================
// Plugin Engine — Types Production
// Système de proxy API sécurisé pour 300+ applications
// ============================================================

export type AuthType = 'bearer' | 'basic' | 'token' | 'oauth2' | 'api_key_header' | 'none';

export interface PluginActionParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  defaultValue?: unknown;
}

export interface PluginAction {
  id: string;
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Endpoint avec variables : "/repos/{owner}/{repo}/issues" */
  endpoint: string;
  params: PluginActionParam[];
  /** Les paramètres marqués urlParam: true sont injectés dans l'URL */
  urlParams?: string[];
  /** Les paramètres marqués body: true vont dans le body JSON */
  bodyParams?: string[];
  timeoutMs?: number;
}

export interface PluginCatalogEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** URL du logo officiel de l'application (affiché dans le frontend) */
  logoUrl?: string;
  categories: string[];
  baseUrl: string;
  authType: AuthType;
  docsUrl: string;
  website: string;
  popularityRank: number;
  actions: Record<string, PluginAction>;
}

export interface UserPluginConnection {
  id?: string;
  userId: string;
  appId: string;
  /** Identifiants chiffrés AES-256-GCM */
  encryptedCredentials: string;
  /** IV utilisé pour le chiffrement */
  iv: string;
  /** Méta non sensibles (ex: email partiel pour identification) */
  displayLabel?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ExecuteActionRequest {
  appId: string;
  actionId: string;
  params: Record<string, unknown>;
}

export interface ExecuteActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  status?: number;
  durationMs: number;
}

export interface PluginConnectRequest {
  appId: string;
  credentials: {
    apiKey?: string;
    apiSecret?: string;
    username?: string;
    password?: string;
    accessToken?: string;
    refreshToken?: string;
  };
  displayLabel?: string;
}
