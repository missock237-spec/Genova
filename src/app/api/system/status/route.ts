/**
 * System Status API — Check all API integrations and service health
 *
 * Returns a comprehensive status of all configured API providers,
 * database connectivity, and system health. Used by the dashboard
 * to display which integrations are active.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────

interface ProviderStatus {
  name: string;
  configured: boolean;
  keyPresent: boolean;
  status: 'active' | 'not_configured' | 'error';
  message: string;
  category: string;
}

// ── Provider Check Functions ──────────────────────────────────

function checkAIProviders(): ProviderStatus[] {
  return [
    {
      name: 'Groq',
      configured: !!process.env.GROQ_API_KEY,
      keyPresent: !!process.env.GROQ_API_KEY,
      status: process.env.GROQ_API_KEY ? 'active' : 'not_configured',
      message: process.env.GROQ_API_KEY
        ? 'Groq API configuré — LLM rapide + STT Whisper'
        : 'Non configuré. Obtenez une clé gratuite sur console.groq.com',
      category: 'AI / LLM',
    },
    {
      name: 'OpenRouter',
      configured: !!process.env.OPENROUTER_API_KEY,
      keyPresent: !!process.env.OPENROUTER_API_KEY,
      status: process.env.OPENROUTER_API_KEY ? 'active' : 'not_configured',
      message: process.env.OPENROUTER_API_KEY
        ? 'OpenRouter configuré — LLM + Génération d\'images'
        : 'Non configuré. Obtenez une clé sur openrouter.ai',
      category: 'AI / LLM',
    },
    {
      name: 'OpenAI',
      configured: !!process.env.OPENAI_API_KEY,
      keyPresent: !!process.env.OPENAI_API_KEY,
      status: process.env.OPENAI_API_KEY ? 'active' : 'not_configured',
      message: process.env.OPENAI_API_KEY
        ? 'OpenAI configuré — TTS, STT, Embeddings'
        : 'Non configuré. Obtenez une clé sur platform.openai.com',
      category: 'AI / Voice',
    },
    {
      name: 'z-ai-sdk (Fallback)',
      configured: true,
      keyPresent: true,
      status: 'active',
      message: 'SDK universel toujours disponible — Chat, Streaming, Images',
      category: 'AI / Fallback',
    },
  ];
}

function checkVoiceProviders(): ProviderStatus[] {
  return [
    {
      name: 'WhatsApp Business API',
      configured: !!(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
      keyPresent: !!process.env.WHATSAPP_API_TOKEN,
      status: process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
        ? 'active' : 'not_configured',
      message: process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
        ? 'WhatsApp Cloud API configuré'
        : 'Non configuré. Requis: WHATSAPP_API_TOKEN + WHATSAPP_PHONE_NUMBER_ID',
      category: 'Messaging',
    },
    {
      name: 'Twilio',
      configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      keyPresent: !!process.env.TWILIO_ACCOUNT_SID,
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
      name: 'Génération d\'images',
      configured: !!process.env.OPENROUTER_API_KEY,
      keyPresent: !!process.env.OPENROUTER_API_KEY,
      status: process.env.OPENROUTER_API_KEY ? 'active' : 'not_configured',
      message: process.env.OPENROUTER_API_KEY
        ? 'OpenRouter configuré — Flux, Stable Diffusion'
        : 'Fallback: z-ai-sdk utilisé pour la génération d\'images',
      category: 'Media',
    },
    {
      name: 'Génération de vidéos (Local)',
      configured: false,
      keyPresent: false,
      status: 'not_configured',
      message: `API locale non détectée sur ${process.env.VIDEO_API_URL || 'http://localhost:8189'}`,
      category: 'Media',
    },
    {
      name: 'Génération de vidéos (Cloud)',
      configured: !!process.env.REPLICATE_API_TOKEN,
      keyPresent: !!process.env.REPLICATE_API_TOKEN,
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
      keyPresent: !!process.env.RESEND_API_KEY,
      status: process.env.RESEND_API_KEY ? 'active' : 'not_configured',
      message: process.env.RESEND_API_KEY
        ? 'Resend configuré — Emails transactionnels'
        : 'Non configuré. Vérification email et reset password indisponibles',
      category: 'Services',
    },
    {
      name: 'Embeddings (OpenAI)',
      configured: !!process.env.OPENAI_API_KEY,
      keyPresent: !!process.env.OPENAI_API_KEY,
      status: process.env.OPENAI_API_KEY ? 'active' : 'not_configured',
      message: process.env.OPENAI_API_KEY
        ? 'Embeddings sémantiques OpenAI configurés'
        : 'Fallback: Embeddings déterministes TF-IDF utilisés',
      category: 'Services',
    },
    {
      name: 'Sandbox (E2B)',
      configured: !!process.env.E2B_API_KEY,
      keyPresent: !!process.env.E2B_API_KEY,
      status: process.env.E2B_API_KEY ? 'active' : 'not_configured',
      message: process.env.E2B_API_KEY
        ? 'E2B cloud sandbox configuré'
        : 'Fallback: Subprocess local utilisé pour l\'exécution de code',
      category: 'Services',
    },
    {
      name: 'Vector Store (Qdrant)',
      configured: !!(process.env.VECTOR_STORE_TYPE === 'qdrant' && process.env.QDRANT_URL),
      keyPresent: !!process.env.QDRANT_URL,
      status: process.env.VECTOR_STORE_TYPE === 'qdrant' && process.env.QDRANT_URL
        ? 'active' : 'not_configured',
      message: process.env.VECTOR_STORE_TYPE === 'qdrant'
        ? 'Qdrant vector store configuré'
        : 'SQLite vector store utilisé (par défaut)',
      category: 'Services',
    },
  ];
}

// ── Main Handler ──────────────────────────────────────────────

export async function GET() {
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
    if (!process.env.AUTH_SECRET) criticalIssues.push('AUTH_SECRET manquant — L\'authentification ne fonctionnera pas');
    if (!process.env.AUTH_SALT) criticalIssues.push('AUTH_SALT manquant — La vérification des mots de passe échouera');
    if (dbStatus === 'error') criticalIssues.push('Base de données inaccessible');

    return NextResponse.json({
      status: criticalIssues.length > 0 ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        message: dbMessage,
        provider: 'sqlite',
      },
      providers: {
        configured,
        total,
        details: providers,
      },
      criticalIssues: criticalIssues.length > 0 ? criticalIssues : undefined,
      fallbackInfo: {
        message: 'Le SDK z-ai-web-dev-sdk est toujours disponible comme fallback universel pour: Chat, Streaming, Génération d\'images',
        alwaysAvailable: ['z-ai-sdk Chat', 'z-ai-sdk Streaming', 'z-ai-sdk Image Gen', 'Déterministic Embeddings', 'Subprocess Sandbox', 'SQLite Vector Store'],
      },
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Failed to check system status' },
      { status: 500 }
    );
  }
}
