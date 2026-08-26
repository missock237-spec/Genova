import { NextRequest, NextResponse } from 'next/server';

/**
 * /api/generation — Interface de travail de génération (images).
 *
 * Surcouche NON destructive : réutilise `imageGenerator` (fallback Hugging Face
 * + persistance Firestore) sans modifier le générateur ni les routes existantes.
 *
 *  GET  /api/generation?userId=..&mode=meta
 *        -> modèles / résolutions / styles disponibles (pour l'UI)
 *  GET  /api/generation?userId=..&page=1&limit=24
 *        -> historique persévé de l'utilisateur + catalogue de modèles
 *  POST /api/generation
 *        { userId, prompt, negativePrompt?, model?, resolution?, style?, count?, seed? }
 *        -> génère de 1 à 4 images et retourne leurs data-URL
 */
export const dynamic = 'force-dynamic';

import { imageGenerator } from '@/lib/image-generator';

const RESOLUTIONS = {
  '1024:1024': { label: '1024 × 1024 (carré)', width: 1024, height: 1024 },
  '1920:1080': { label: '1920 × 1080 (paysage)', width: 1920, height: 1080 },
  '1080:1920': { label: '1080 × 1920 (portrait)', width: 1080, height: 1920 },
} as const;

const STYLES = {
  photorealistic: {
    label: 'Photorealistic',
    suffix: ', photorealistic, sharp focus, natural lighting, ultra detailed, 8k',
  },
  anime: {
    label: 'Anime',
    suffix: ', anime style, vibrant colors, high quality anime illustration, clean line art',
  },
  'digital-art': {
    label: 'Digital Art',
    suffix: ', digital art, modern digital painting, rich colors, intricate details',
  },
  cinematic: {
    label: 'Cinematic',
    suffix: ', cinematic, dramatic lighting, film still, shallow depth of field, widescreen composition',
  },
} as const;

type ResolutionKey = keyof typeof RESOLUTIONS;
type StyleKey = keyof typeof STYLES;

// Petit utilitaire client, injecté pour éviter tout état partagé entre requêtes.
function metaPayload() {
  return {
    models: imageGenerator.listModels().map((m) => ({
      label: m.label,
      hfId: m.hfId,
      defaultSteps: m.defaultSteps,
      defaultGuidance: m.defaultGuidance,
      maxPixels: m.maxPixels,
      supportsLora: m.supportsLora,
    })),
    resolutions: Object.entries(RESOLUTIONS).map(([key, r]) => ({ key, ...r })),
    styles: Object.entries(STYLES).map(([key, s]) => ({ key, label: s.label })),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const mode = searchParams.get('mode') ?? 'history';

    if (mode === 'meta') {
      return NextResponse.json({ success: true, data: metaPayload() });
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '24', 10)));

    const history = await imageGenerator.getHistory(userId, page, limit);
    return NextResponse.json({
      success: true,
      data: { images: history.images, pagination: history.pagination },
    });
  } catch {
    return NextResponse.json({ error: 'Erreur lors de la lecture de l’historique' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      prompt,
      negativePrompt = '',
      model,
      resolution = '1024:1024',
      style = 'photorealistic',
      count = 1,
      seed,
    } = (body ?? {}) as {
      userId?: string;
      prompt?: string;
      negativePrompt?: string;
      model?: string;
      resolution?: string;
      style?: string;
      count?: number;
      seed?: number;
    };

    if (!userId || !prompt || !String(prompt).trim()) {
      return NextResponse.json({ error: 'userId et prompt sont requis' }, { status: 400 });
    }
    if (String(prompt).trim().length > 1000) {
      return NextResponse.json({ error: 'Prompt trop long (1000 caractères max)' }, { status: 400 });
    }

    const res = RESOLUTIONS[(resolution as ResolutionKey) in RESOLUTIONS ? resolution as ResolutionKey : '1024:1024'];
    const styleCfg = STYLES[(style as StyleKey) in STYLES ? style as StyleKey : 'photorealistic'];
    const n = Math.min(4, Math.max(1, Number(count) || 1));

    // Graine déterministe : on utilise celle fournie par l'UI si elle est positive,
    // sinon on en génère une aléatoire pour différencier les images multiples.
    const effectiveSeed = Number(seed) && Number(seed) > 0 ? Number(seed) : Math.floor(Math.random() * 1_000_000_000);
    const basePrompt = `${String(prompt).trim()}${styleCfg.suffix}`;

    const results: Array<{
      id?: string;
      imageUrl?: string;
      model?: string;
      width: number;
      height: number;
    }> = [];

    for (let i = 0; i < n; i++) {
      const effectivePrompt = n > 1 ? `${basePrompt}, seed ${effectiveSeed + i}` : basePrompt;
      const r = await imageGenerator.generate({
        userId,
        prompt: effectivePrompt,
        model,
        negativePrompt: negativePrompt || '',
        width: res.width,
        height: res.height,
      });

      if (!r.success) {
        return NextResponse.json({ error: r.error || 'Échec de la génération' }, { status: 502 });
      }

      results.push({
        id: r.generationId,
        imageUrl: r.imageUrl,
        model: r.modelUsed,
        width: res.width,
        height: res.height,
      });
    }

    return NextResponse.json({
      success: true,
      data: { results, meta: metaPayload() },
    });
  } catch {
    return NextResponse.json({ error: 'Erreur interne lors de la génération' }, { status: 500 });
  }
}
