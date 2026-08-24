// ============================================================
// Plugin Engine — Gestion sécurisée des identifiants
// Chiffrement AES-256-GCM via Web Crypto API
// ============================================================

import type { PluginConnectRequest, UserPluginConnection } from './types';

const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

/** Dérive une clé de chiffrement propre à chaque utilisateur + app */
async function deriveKey(userId: string, appId: string): Promise<CryptoKey> {
  const material = `gen3ia:plugin-creds:${userId}:${appId}`;
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(material).slice(0, 32),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  // Salt fixe pour déterminisme — en production, utiliser un sel aléatoire stocké
  const salt = encoder.encode('gen3ia-plugin-salt-v1');
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGO, length: KEY_LENGTH },
    ['encrypt', 'decrypt']
  );
}

/** Chiffre les identifiants d'un plugin */
export async function encryptCredentials(
  userId: string,
  appId: string,
  credentials: PluginConnectRequest['credentials']
): Promise<{ encryptedCredentials: string; iv: string }> {
  const key = await deriveKey(userId, appId);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    encoder.encode(JSON.stringify(credentials))
  );
  return {
    encryptedCredentials: Buffer.from(encrypted).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
  };
}

/** Déchiffre les identifiants d'un plugin */
export async function decryptCredentials(
  userId: string,
  appId: string,
  encryptedCredentials: string,
  iv: string
): Promise<PluginConnectRequest['credentials']> {
  const key = await deriveKey(userId, appId);
  const ivBuffer = Uint8Array.from(Buffer.from(iv, 'base64'));
  const encryptedBuffer = Uint8Array.from(Buffer.from(encryptedCredentials, 'base64'));
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGO, iv: ivBuffer },
    key,
    encryptedBuffer
  );
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decrypted));
}

/** Construit les headers d'authentification selon le type */
export function buildAuthHeaders(
  authType: string,
  credentials: PluginConnectRequest['credentials'],
  appId?: string
): Record<string, string> {
  if (!credentials) return {};

  switch (authType) {
    case 'bearer':
      return { Authorization: `Bearer ${credentials.accessToken || credentials.apiKey || ''}` };

    case 'basic': {
      const user = credentials.username || appId || '';
      const pass = credentials.apiKey || credentials.password || '';
      return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` };
    }

    case 'token':
      return { Authorization: `token ${credentials.accessToken || credentials.apiKey || ''}` };

    case 'api_key_header': {
      const hdrs: Record<string, string> = { 'x-api-key': credentials.apiKey || '' };
      if (appId === 'anthropic') hdrs['anthropic-version'] = '2023-06-01';
      if (appId === 'datadog') { hdrs['DD-API-KEY'] = credentials.apiKey || ''; hdrs['DD-APPLICATION-KEY'] = credentials.apiSecret || ''; delete hdrs['x-api-key']; }
      return hdrs;
    }

    case 'oauth2':
      return { Authorization: `Bearer ${credentials.accessToken || ''}` };

    case 'none':
    default:
      return {};
  }
}
