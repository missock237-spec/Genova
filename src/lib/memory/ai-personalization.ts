/**
 * AI Personalization — Adapt AI behavior based on user preferences and patterns
 *
 * Auto-detects: communication style, technical level, preferred formats
 * Methods: getPersonalizedSystemPrompt, adaptResponse, getUserStyle
 */

import { db } from '@/lib/db';
import { getPreferenceContext } from './contextual-recall';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommunicationStyle = 'concise' | 'balanced' | 'detailed' | 'formal' | 'casual';
export type TechnicalLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type PreferredFormat = 'text' | 'structured' | 'mixed' | 'code_first' | 'detailed';
export type ResponseLength = 'brief' | 'medium' | 'comprehensive';

export interface UserStyle {
  communicationStyle: CommunicationStyle;
  technicalLevel: TechnicalLevel;
  preferredFormat: PreferredFormat;
  responseLength: ResponseLength;
  tonePreferences: Record<string, number>;
  topicInterests: string[];
  languagePreference: string;
  customInstructions: string | null;
  adaptationScore: number;
  totalInteractions: number;
}

export interface PersonalizationUpdate {
  communicationStyle?: CommunicationStyle;
  technicalLevel?: TechnicalLevel;
  preferredFormat?: PreferredFormat;
  responseLength?: ResponseLength;
  tonePreferences?: Record<string, number>;
  topicInterests?: string[];
  languagePreference?: string;
  customInstructions?: string;
}

export interface AdaptedResponse {
  style: string;
  level: string;
  format: string;
  length: string;
  tone: string;
  language: string;
  customAdditions: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Core: Get or create user personalization
// ---------------------------------------------------------------------------

export async function getUserStyle(userId: string): Promise<UserStyle> {
  let personalization = await db.userPersonalization.findUnique({
    where: { userId },
  });

  if (!personalization) {
    // Auto-detect from memory
    const prefContext = await getPreferenceContext(userId);

    personalization = await db.userPersonalization.create({
      data: {
        userId,
        communicationStyle: prefContext.communicationStyle,
        technicalLevel: prefContext.technicalLevel as TechnicalLevel,
        preferredFormat: prefContext.preferredFormats.includes('code') ? 'code_first' : 'mixed',
        responseLength: prefContext.communicationStyle === 'concise' ? 'brief' : 'medium',
        tonePreferences: JSON.stringify({ friendly: 0.5, professional: 0.5 }),
        topicInterests: JSON.stringify(prefContext.frequentTopics),
        languagePreference: 'en',
        customInstructions: '',
        interactionPatterns: JSON.stringify({}),
        feedbackHistory: JSON.stringify([]),
      },
    });
  }

  return {
    communicationStyle: personalization.communicationStyle as CommunicationStyle,
    technicalLevel: personalization.technicalLevel as TechnicalLevel,
    preferredFormat: personalization.preferredFormat as PreferredFormat,
    responseLength: personalization.responseLength as ResponseLength,
    tonePreferences: safeParse<Record<string, number>>(personalization.tonePreferences, {}),
    topicInterests: safeParse<string[]>(personalization.topicInterests, []),
    languagePreference: personalization.languagePreference,
    customInstructions: personalization.customInstructions,
    adaptationScore: personalization.adaptationScore,
    totalInteractions: personalization.totalInteractions,
  };
}

// ---------------------------------------------------------------------------
// Core: Update personalization preferences
// ---------------------------------------------------------------------------

export async function updatePersonalization(
  userId: string,
  updates: PersonalizationUpdate
): Promise<UserStyle> {
  const data: Record<string, unknown> = {};

  if (updates.communicationStyle) data.communicationStyle = updates.communicationStyle;
  if (updates.technicalLevel) data.technicalLevel = updates.technicalLevel;
  if (updates.preferredFormat) data.preferredFormat = updates.preferredFormat;
  if (updates.responseLength) data.responseLength = updates.responseLength;
  if (updates.tonePreferences) data.tonePreferences = JSON.stringify(updates.tonePreferences);
  if (updates.topicInterests) data.topicInterests = JSON.stringify(updates.topicInterests);
  if (updates.languagePreference) data.languagePreference = updates.languagePreference;
  if (updates.customInstructions !== undefined) data.customInstructions = updates.customInstructions;

  // Increment interaction count
  data.totalInteractions = { increment: 1 };

  // Increase adaptation score slightly with each update
  data.adaptationScore = { increment: 0.01 };

  const personalization = await db.userPersonalization.upsert({
    where: { userId },
    update: data,
    create: {
      userId,
      communicationStyle: updates.communicationStyle || 'balanced',
      technicalLevel: updates.technicalLevel || 'intermediate',
      preferredFormat: updates.preferredFormat || 'mixed',
      responseLength: updates.responseLength || 'medium',
      tonePreferences: JSON.stringify(updates.tonePreferences || {}),
      topicInterests: JSON.stringify(updates.topicInterests || []),
      languagePreference: updates.languagePreference || 'en',
      customInstructions: updates.customInstructions || '',
    },
  });

  return {
    communicationStyle: personalization.communicationStyle as CommunicationStyle,
    technicalLevel: personalization.technicalLevel as TechnicalLevel,
    preferredFormat: personalization.preferredFormat as PreferredFormat,
    responseLength: personalization.responseLength as ResponseLength,
    tonePreferences: safeParse<Record<string, number>>(personalization.tonePreferences, {}),
    topicInterests: safeParse<string[]>(personalization.topicInterests, []),
    languagePreference: personalization.languagePreference,
    customInstructions: personalization.customInstructions,
    adaptationScore: personalization.adaptationScore,
    totalInteractions: personalization.totalInteractions,
  };
}

// ---------------------------------------------------------------------------
// Core: Get personalized system prompt
// ---------------------------------------------------------------------------

export async function getPersonalizedSystemPrompt(userId: string): Promise<string> {
  const style = await getUserStyle(userId);

  const styleInstructions: string[] = [];

  // Communication style
  switch (style.communicationStyle) {
    case 'concise':
      styleInstructions.push('Be concise and to the point. Avoid unnecessary elaboration.');
      break;
    case 'detailed':
      styleInstructions.push('Provide detailed and thorough explanations. Include examples and context.');
      break;
    case 'formal':
      styleInstructions.push('Use formal, professional language. Maintain a respectful tone.');
      break;
    case 'casual':
      styleInstructions.push('Use a friendly, casual tone. Be approachable and conversational.');
      break;
    default:
      styleInstructions.push('Balance brevity with completeness in your responses.');
  }

  // Technical level
  switch (style.technicalLevel) {
    case 'beginner':
      styleInstructions.push('Explain concepts simply. Avoid jargon. Define technical terms when used.');
      break;
    case 'advanced':
      styleInstructions.push('Use advanced terminology freely. Focus on technical depth and implementation details.');
      break;
    case 'expert':
      styleInstructions.push('Assume expert-level understanding. Focus on architecture, edge cases, and optimization.');
      break;
    default:
      styleInstructions.push('Assume intermediate technical knowledge. Explain complex concepts but use common terminology.');
  }

  // Format preference
  switch (style.preferredFormat) {
    case 'structured':
      styleInstructions.push('Use lists, headers, and structured formatting. Break information into clear sections.');
      break;
    case 'code_first':
      styleInstructions.push('Lead with code examples when relevant. Prioritize actionable code over explanation.');
      break;
    case 'text':
      styleInstructions.push('Preplain prose explanations. Minimize code unless specifically requested.');
      break;
    default:
      styleInstructions.push('Mix prose explanations with code examples as appropriate.');
  }

  // Response length
  switch (style.responseLength) {
    case 'brief':
      styleInstructions.push('Keep responses brief — 2-3 sentences unless more detail is specifically requested.');
      break;
    case 'comprehensive':
      styleInstructions.push('Provide comprehensive responses covering all relevant aspects.');
      break;
    default:
      styleInstructions.push('Provide medium-length responses with enough detail to be helpful.');
  }

  // Topic interests
  if (style.topicInterests.length > 0) {
    styleInstructions.push(`The user has shown interest in: ${style.topicInterests.join(', ')}. Relate responses to these topics when possible.`);
  }

  // Language
  if (style.languagePreference !== 'en') {
    styleInstructions.push(`The user prefers ${style.languagePreference} language. Respond in that language when appropriate.`);
  }

  // Custom instructions
  if (style.customInstructions) {
    styleInstructions.push(`Additional user preferences: ${style.customInstructions}`);
  }

  return `## Personalization Rules
You are adapting your communication style to this specific user. Follow these guidelines:

${styleInstructions.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

Adaptation confidence: ${Math.round(style.adaptationScore * 100)}% (${style.totalInteractions} interactions tracked)`;
}

// ---------------------------------------------------------------------------
// Core: Adapt response — analyze and adjust response format
// ---------------------------------------------------------------------------

export async function adaptResponse(
  userId: string,
  response: string
): Promise<AdaptedResponse> {
  const style = await getUserStyle(userId);

  // Analyze the response
  const hasCode = response.includes('```') || response.includes('function') || response.includes('const ');
  const hasLists = response.includes('- ') || response.includes('* ') || /^\d+\./m.test(response);
  const isLong = response.length > 1000;

  let effectiveFormat = style.preferredFormat;
  if (hasCode && style.preferredFormat === 'code_first') effectiveFormat = 'code_first';
  else if (hasLists) effectiveFormat = 'structured';
  else if (isLong) effectiveFormat = 'detailed';

  // Determine effective tone
  const toneScores = style.tonePreferences;
  let dominantTone = 'balanced';
  let maxScore = 0;
  for (const [tone, score] of Object.entries(toneScores)) {
    if (score > maxScore) {
      maxScore = score;
      dominantTone = tone;
    }
  }

  // Track this interaction
  await db.userPersonalization.upsert({
    where: { userId },
    update: {
      totalInteractions: { increment: 1 },
      interactionPatterns: JSON.stringify({
        lastResponseLength: response.length,
        lastResponseHadCode: hasCode,
        lastResponseHadLists: hasLists,
        timestamp: new Date().toISOString(),
      }),
    },
    create: {
      userId,
      interactionPatterns: JSON.stringify({
        lastResponseLength: response.length,
        lastResponseHadCode: hasCode,
        lastResponseHadLists: hasLists,
      }),
    },
  }).catch(() => {});

  return {
    style: style.communicationStyle,
    level: style.technicalLevel,
    format: effectiveFormat,
    length: style.responseLength,
    tone: dominantTone,
    language: style.languagePreference,
    customAdditions: style.customInstructions,
  };
}
