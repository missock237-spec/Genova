import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { getServerSession } from '@/lib/auth';
import crypto from 'crypto';
import {
  generateApiKey,
  hashApiKey,
  keyPrefix,
  normalizeExpiryDays,
} from '@/lib/api-key';

export const dynamic = 'force-dynamic';
const log = createLogger('api-keys');

const VALID_SCOPES = ['agents:read', 'agents:write', 'agents:execute', 'voice:call', 'messages:send', 'billing:read', 'admin:read'];

/**
 * Convertit une valeur de date Firestore/Firebase en ISO (toujours sûr).
 * Les timestamps mal sérialisés (bug historique {_methodName}) deviennent null.
 */
function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function parseScopes(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const valid = (raw.filter((s): s is string => typeof s === 'string')
    .filter((s) => VALID_SCOPES.includes(s)))
    .filter((v, i, arr) => arr.indexOf(v) === i); // dédupliqué
  return valid.length === 0 ? null : valid;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 });
    }

    const scopes = parseScopes(body.scopes ?? ['agents:read']);
    if (!scopes) {
      return NextResponse.json({
        error: 'Aucun scope valide fourni',
        validScopes: VALID_SCOPES,
      }, { status: 400 });
    }

    // expiresInDays : entier borné ([1, MAX_EXPIRY_DAYS]) ou null = sans expiration.
    const validatedExpiry = normalizeExpiryDays(body.expiresInDays);
    if (validatedExpiry === 'invalid') {
      return NextResponse.json({
        error: 'expiresInDays doit être un entier positif',
      }, { status: 400 });
    }
    const expiresAt = validatedExpiry ? new Date(Date.now() + validatedExpiry * 86400000) : null;

    // Sécurité : on ne persiste JAMAIS la clé brute — seulement son empreinte.
    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const id = `key_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    await db.apiKey.createWithId(id, {
      userId: session.user.id,
      name,
      keyHash,
      prefix: keyPrefix(rawKey),
      scopes,
      expiresAt: expiresAt?.toISOString() ?? null,
      isActive: true,
    });

    log.info('API key created', { name, scopes, userId: session.user.id });

    // La clé brute n'est retournée qu'ici, une seule fois.
    return NextResponse.json({
      success: true,
      key: rawKey,
      prefix: keyPrefix(rawKey),
      name,
      scopes,
      expiresAt: expiresAt?.toISOString() ?? null,
    });
  } catch (error) {
    log.error('API key creation error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const where: never = [{ field: 'userId', op: '==', value: session.user.id }] as never;

    // Tri DESC par createdAt. Le filtre = où + orderBy nécessite un index
    // composite Firestore (userId ASC, createdAt DESC). Si l'index n'est pas
    // encore déployé, la query lève une erreur : on retombe sur un tri en
    // mémoire plutôt que d'échouer (« Failed to fetch keys »).
    let keys: Array<Record<string, unknown>>;
    try {
      keys = (await db.apiKey.findMany({
        where,
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
      })) as Array<Record<string, unknown>>;
    } catch {
      keys = (await db.apiKey.findMany({ where })) as Array<Record<string, unknown>>;
      keys.sort((a, b) => {
        const ta = new Date(toIso(a.createdAt) ?? 0).getTime();
        const tb = new Date(toIso(b.createdAt) ?? 0).getTime();
        return tb - ta;
      });
    }

    return NextResponse.json({
      success: true,
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        key: `${k.prefix ?? ''}${'•'.repeat(32)}`,
        prefix: k.prefix ?? null,
        scopes: Array.isArray(k.scopes)
          ? k.scopes
          : typeof k.scopes === 'string'
            ? JSON.parse(k.scopes)
            : [],
        lastUsed: toIso(k.lastUsed),
        expiresAt: toIso(k.expiresAt),
        isActive: k.isActive ?? true,
        createdAt: toIso(k.createdAt),
      })),
    });
  } catch (error) {
    log.error('API keys listing error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Erreur de lecture' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // Accepte id depuis searchParams ou corps JSON.
    let keyId: string | null = new URL(request.url).searchParams.get('id');
    if (!keyId) {
      const body = await request.json().catch(() => null);
      keyId = typeof body?.id === 'string' ? body.id : null;
    }

    if (!keyId) {
      return NextResponse.json({ error: 'ID de clé requis' }, { status: 400 });
    }

    // Piège façade Firestore : on ne filtre JAMAIS sur le champ `id` dans
    // `where` (les docs n'ont pas de champ id en données — il est injecté
    // côté client et un filtre où: id == x ne matche rien). On passe donc
    // par findUnique (rappel : traite id comme clé du document), on vérifie
    // l'appartenance, puis on met à jour via l'id résolu.
    const existing = await db.apiKey.findUnique({
      where: { id: keyId },
      select: ['userId', 'isActive'],
    }) as Record<string, unknown> | null;

    if (!existing) {
      return NextResponse.json({ error: 'Clé introuvable' }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    await db.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    log.info('API key revoked', { keyId, userId: session.user.id });

    return NextResponse.json({ success: true, message: 'Clé révoquée' });
  } catch (error) {
    log.error('API key revocation error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Erreur lors de la révocation' }, { status: 500 });
  }
}
