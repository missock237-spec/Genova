/**
 * System Status API — Check all API integrations and service health
 *
 * Returns a comprehensive status of all configured API providers,
 * database connectivity, and system health. Used by the dashboard
 * to display which integrations are active.
 *
 * Requires authentication. The `keyPresent` field is intentionally
 * omitted from the response to avoid leaking which environment
 * variables are set on the server.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getAuthSecret, getAuthSalt } from "@/lib/auth-config";
import { db } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────

interface ProviderStatus {
  name: string;
  configured: boolean;
  status: 'active' | 'not_configured' | 'error';
  message: string;
  category: string;
}

// ── Provider Check Functions ──────────────────────────────────

function checkAIProviders(): ProviderStatus[] {
  return [
    {
      name: 'Fluro (Ollama)',
      configured: !!process.env.FLURO_API_URL,
      status: process.env.FLURO_API_URL ? 'active' : 'not_configured',
      message: process.env.FLURO_API_URL
        ? 'Fluro configuré — Moteur IA local (Ollama)'
        : 'Non configuré. Démarrez Ollama sur le port 11434',
      category: 'AI / LLM',
    },
    {
      name: 'OpenAI',
      configured: !!process.env.OPENAI_API_KEY,
      status: process.env.OPENAI_API_KEY ? 'active' : 'not_configured',
      message: process.env.OPENAI_API_KEY
        ? 'OpenAI configuré — TTS, STT, Embeddings'
        : 'Non configuré. Obtenez une clé sur platform.openai.com',
      category: 'AI / Voice',
    },
    {
      name: 'z-ai-sdk (Fallback)',
      configured: true,
      status: 'active',
      message: 'SDK universel toujours disponible — Chat, Streaming, Images',
      category: 'AI / Fallback',
    },
  ];
}

function checkVoiceProviders(): ProviderStatus[] {
  return [
    {
      name: 'WhatsApp (Baileys)',
      configured: !!process.env.BAILEYS_API_URL,
      status: process.env.BAILEYS_API_URL ? 'active' : 'not_configured',
      message: process.env.BAILEYS_API_URL
        ? 'Baileys WhatsApp Web API configuré'
        : 'Non configuré. Définissez BAILEYS_API_URL',
      category: 'Messaging',
    },
    {
      name: 'WhatsApp Business API',
      configured: !!(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
      status: process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
        ? 'active' : 'not_configured',
      message: process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
        ? 'WhatsApp Cloud API configuré (fallback)'
        : 'Non configuré. Requis: WHATSAPP_API_TOKEN + WHATSAPP_PHONE_NUMBER_ID',
      category: 'Messaging',
    },
    {
      name: 'SpeechBrain (STT)',
      configured: !!process.env.SPEECHBRAIN_API_URL,
      status: process.env.SPEECHBRAIN_API_URL ? 'active' : 'not_configured',
      message: process.env.SPEECHBRAIN_API_URL
        ? 'SpeechBrain ASR configuré — Reconnaissance vocale avancée'
        : 'Non configuré. Fallback: Fluro Whisper → z-ai-sdk',
      category: 'Voice / STT',
    },
    {
      name: 'Twilio',
      configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      status: process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
        ? 'active' : 'not_configured',
      message: process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
        ? 'Twilio configuré — Appels vocaux IA'
        : 'Non configuré. Requis: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN',
      category: 'Voice Calls',
    },
  ];
}

function checkMediaProviders(): ProviderStatus[] {
  return [
    {
      name: 'Fluro (Génération d\'images)',
      configured: !!process.env.FLURO_API_URL,
      status: process.env.FLURO_API_URL ? 'active' : 'not_configured',
      message: process.env.FLURO_API_URL
        ? 'Fluro configuré — Génération d\'images locale (Ollama)'
        : 'Non configuré. Fallback: z-ai-sdk utilisé pour la génération d\'images',
      category: 'Media',
    },
    {
      name: 'Génération de vidéos (Local)',
      configured: !!process.env.VIDEO_API_URL,
      status: process.env.VIDEO_API_URL ? 'active' : 'not_configured',
      message: process.env.VIDEO_API_URL
        ? 'API vidéo locale configurée'
        : 'Non configuré',
      category: 'Media',
    },
    {
      name: 'Génération de vidéos (Cloud)',
      configured: !!process.env.REPLICATE_API_TOKEN,
      status: process.env.REPLICATE_API_TOKEN ? 'active' : 'not_configured',
      message: process.env.REPLICATE_API_TOKEN
        ? 'Replicate configuré — CogVideoX'
        : 'Non configuré. Obtenez un token sur replicate.com',
      category: 'Media',
    },
  ];
}

function checkServiceProviders(): ProviderStatus[] {
  return [
    {
      name: 'Email (Resend)',
      configured: !!process.env.RESEND_API_KEY,
      status: process.env.RESEND_API_KEY ? 'active' : 'not_configured',
      message: process.env.RESEND_API_KEY
        ? 'Resend configuré — Emails transactionnels'
        : 'Non configuré. Vérification email et reset password indisponibles',
      category: 'Services',
    },
    {
      name: 'Embeddings (OpenAI)',
      configured: !!process.env.OPENAI_API_KEY,
      status: process.env.OPENAI_API_KEY ? 'active' : 'not_configured',
      message: process.env.OPENAI_API_KEY
        ? 'Embeddings sémantiques OpenAI configurés'
        : 'Fallback: Embeddings déterministes TF-IDF utilisés',
      category: 'Services',
    },
    {
      name: 'Sandbox (E2B)',
      configured: !!process.env.E2B_API_KEY,
      status: process.env.E2B_API_KEY ? 'active' : 'not_configured',
      message: process.env.E2B_API_KEY
        ? 'E2B cloud sandbox configuré'
        : 'Fallback: Subprocess local utilisé pour l\'exécution de code',
      category: 'Services',
    },
    {
      name: 'Vector Store (Qdrant)',
      configured: !!(process.env.VECTOR_STORE_TYPE === 'qdrant' && process.env.QDRANT_URL),
      status: process.env.VECTOR_STORE_TYPE === 'qdrant' && process.env.QDRANT_URL
        ? 'active' : 'not_configured',
      message: process.env.VECTOR_STORE_TYPE === 'qdrant'
        ? 'Qdrant vector store configuré'
        : 'SQLite vector store utilisé (par défaut)',
      category: 'Services',
    },
    {
      name: 'n8n (Workflows)',
      configured: !!process.env.N8N_API_URL,
      status: process.env.N8N_API_URL ? 'active' : 'not_configured',
      message: process.env.N8N_API_URL
        ? 'n8n configuré — Automatisation de workflows'
        : 'Non configuré. Définissez N8N_API_URL',
      category: 'Integrations',
    },
    {
      name: 'PocketBase',
      configured: !!process.env.POCKETBASE_URL,
      status: process.env.POCKETBASE_URL ? 'active' : 'not_configured',
      message: process.env.POCKETBASE_URL
        ? 'PocketBase configuré — Données agent & mémoire'
        : 'Non configuré. Définissez POCKETBASE_URL',
      category: 'Integrations',
    },
  ];
}

// ── Main Handler ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    // Check database connectivity
    let dbStatus: 'active' | 'error' = 'active';
    let dbMessage = 'Base de données connectée';
    try {
      await db.$queryRaw`SELECT 1`;
    } catch (dbError) {
      dbStatus = 'error';
      dbMessage = `Erreur base de données: ${dbError instanceof Error ? dbError.message : 'Unknown'}`;
    }

    // Collect all provider statuses
    const providers = [
      ...checkAIProviders(),
      ...checkVoiceProviders(),
      ...checkMediaProviders(),
      ...checkServiceProviders(),
    ];

    // Count configured vs total
    const configured = providers.filter(p => p.configured).length;
    const total = providers.length;

    // Check critical requirements
    const criticalIssues: string[] = [];
    if (!getAuthSecret()) criticalIssues.push('AUTH_SECRET manquant — L\'authentification ne fonctionnera pas');
    if (!getAuthSalt()) criticalIssues.push('AUTH_SALT manquant — La vérification des mots de passe échouera');
    if (dbStatus === 'error') criticalIssues.push('Base de données inaccessible');

    return secureResponse(
      NextResponse.json({
        status: criticalIssues.length > 0 ? 'degraded' : 'healthy',
        timestamp: new Date().toISOString(),
        database: {
          status: dbStatus,
          message: dbMessage,
          provider: 'postgresql',
        },
        providers: {
          configured,
          total,
          details: providers,
        },
        criticalIssues: criticalIssues.length > 0 ? criticalIssues : undefined,
        fallbackInfo: {
          message: 'Fluro → z-ai-sdk (chat) | Fluro → z-ai-sdk (STT) | Baileys → Cloud API (WhatsApp)',
          alwaysAvailable: ['z-ai-sdk Chat', 'z-ai-sdk Streaming', 'z-ai-sdk Image Gen', 'z-ai-sdk ASR', 'Déterministic Embeddings', 'Subprocess Sandbox', 'SQLite Vector Store'],
        },
      }),
      request
    );
  } catch (error) {
    return secureResponse(
      NextResponse.json(
        { status: 'error', message: 'Failed to check system status' },
        { status: 500 }
      ),
      request
    );
  }
}
