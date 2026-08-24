import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { getServerSession } from '@/lib/auth';
import crypto from 'crypto';

export const dynamic = "force-dynamic";
const log = createLogger('api-keys');

const VALID_SCOPES = ['agents:read', 'agents:write', 'agents:execute', 'voice:call', 'messages:send', 'billing:read', 'admin:read'];
const PREFIX = 'gva_';
const KEY_BYTES = 48;

function generateApiKey(): string {
  const raw = crypto.randomBytes(KEY_BYTES).toString('base64url');
  return `${PREFIX}${raw}`;
}

function hashKeySha256(key: string): string {
  return crypto.scryptSync(key, 'gen3ia-api-key-salt', 64).toString('hex');
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json();
    const { name, scopes = ['agents:read'], expiresInDays } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 });
    }

    const validScopes = scopes.filter((s: string) => VALID_SCOPES.includes(s));
    if (validScopes.length === 0) {
      return NextResponse.json({
        error: 'Aucun scope valide fourni',
        validScopes: VALID_SCOPES,
      }, { status: 400 });
    }

    const rawKey = generateApiKey();
    const keyHash = hashKeySha256(rawKey);
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86400000)
      : null;
    const id = `key_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Collection Firestore `api_keys` — le champ `keyValue` est lu par
    // src/lib/security.ts (authenticateApiKey) via db.apiKey.findFirst.
    await db.apiKey.createWithId(id, {
      userId: session.user.id,
      name: name.trim(),
      keyValue: rawKey,
      keyHash,
      prefix: rawKey.substring(0, 8),
      scopes: validScopes,
      expiresAt: expiresAt?.toISOString() ?? null,
      isActive: true,
    });

    log.info('API key created', { name: name.trim(), scopes: validScopes, userId: session.user.id });

    return NextResponse.json({
      success: true,
      key: rawKey,
      prefix: rawKey.substring(0, 8),
      name: name.trim(),
      scopes: validScopes,
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

    const keys = await db.apiKey.findMany({
      where: [{ field: 'userId', op: '==', value: session.user.id }],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });

    return NextResponse.json({
      success: true,
      keys: keys.map((k: Record<string, unknown>) => ({
        id: k.id,
        name: k.name,
        key: `${k.prefix}${'•'.repeat(32)}`,
        prefix: k.prefix,
        scopes: Array.isArray(k.scopes)
          ? k.scopes
          : typeof k.scopes === 'string'
            ? JSON.parse(k.scopes)
            : [],
// @ts-ignore — type narrowing pending, see refactor ticket
        lastUsed: (k.lastUsed as Date | string | null)?.toISOString?.() ?? k.lastUsed ?? null,
        expiresAt: k.expiresAt ?? null,
        isActive: k.isActive ?? true,
// @ts-ignore — type narrowing pending, see refactor ticket
        createdAt: (k.createdAt as Date | string | null)?.toISOString?.() ?? k.createdAt ?? null,
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

    // Accept id from either searchParams or JSON body
    let keyId: string | null;
    const { searchParams } = new URL(request.url);
    keyId = searchParams.get('id');
    if (!keyId) {
      try {
        const body = await request.json();
        keyId = body?.id || null;
      } catch {
        // no body
      }
    }

    if (!keyId) {
      return NextResponse.json({ error: 'ID de clé requis' }, { status: 400 });
    }

    await db.apiKey.updateMany({
      where: [
        { field: 'id', op: '==', value: keyId },
        { field: 'userId', op: '==', value: session.user.id },
      ],
      data: { isActive: false },
    });

    log.info('API key revoked', { keyId, userId: session.user.id });

    return NextResponse.json({ success: true, message: 'Clé révoquée' });
  } catch (error) {
    log.error('API key revocation error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Erreur lors de la révocation' }, { status: 500 });
  }
}
