/**
 * Avatar Engine — Create and manage AI avatars with customizable appearance
 *
 * Features:
 * - Avatar creation with customizable styles (realistic, cartoon, anime, abstract)
 * - Facial expressions and emotions
 * - Lip-sync with TTS audio
 * - Avatar image generation
 * - Frame rendering for animations
 */

import { db } from '@/lib/db';
import { createTTSEngine } from '@/lib/voice';
import { randomUUID } from 'crypto';

// ============================================================
// Types
// ============================================================

export type AvatarStyle = 'realistic' | 'cartoon' | 'anime' | 'abstract';

export type AvatarExpression =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'thinking'
  | 'speaking'
  | 'listening'
  | 'wink'
  | 'laugh';

export interface AvatarAppearance {
  gender?: 'male' | 'female' | 'non-binary';
  age?: 'young' | 'middle' | 'elderly';
  ethnicity?: string;
  hairColor?: string;
  hairStyle?: string;
  eyeColor?: string;
  skinTone?: string;
  accessories?: string[];
  clothing?: string;
  background?: string;
}

export interface AvatarConfig {
  id: string;
  userId: string;
  name: string;
  model: string;
  style: AvatarStyle;
  voiceId?: string | null;
  expressions: AvatarExpression[];
  animations: AnimationConfig[];
  customData: Record<string, unknown>;
  thumbnailUrl?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnimationConfig {
  id: string;
  name: string;
  type: 'expression' | 'gesture' | 'idle' | 'speaking';
  duration: number; // ms
  keyframes: Keyframe[];
  loop: boolean;
}

export interface Keyframe {
  time: number; // 0-1 normalized
  expression?: AvatarExpression;
  intensity?: number; // 0-1
  headRotation?: { x: number; y: number; z: number };
  eyeBlink?: number; // 0-1
  mouthOpen?: number; // 0-1
}

export interface LipSyncFrame {
  time: number; // ms offset
  phoneme: string;
  mouthShape: MouthShape;
  intensity: number;
}

export interface MouthShape {
  open: number; // 0-1
  width: number; // 0-1
  lipRound: number; // 0-1
  tongueVisible: boolean;
  teethVisible: boolean;
}

export interface AvatarRenderFrame {
  timestamp: number;
  expression: AvatarExpression;
  mouthShape: MouthShape;
  headRotation: { x: number; y: number; z: number };
  eyeBlink: number;
  audioOffset?: number;
}

// ============================================================
// Expression mappings
// ============================================================

const EXPRESSION_MOUTH_SHAPES: Record<AvatarExpression, MouthShape> = {
  neutral: { open: 0.05, width: 0.5, lipRound: 0, tongueVisible: false, teethVisible: false },
  happy: { open: 0.3, width: 0.7, lipRound: 0, tongueVisible: false, teethVisible: true },
  sad: { open: 0.1, width: 0.4, lipRound: 0.1, tongueVisible: false, teethVisible: false },
  angry: { open: 0.15, width: 0.35, lipRound: 0, tongueVisible: false, teethVisible: true },
  surprised: { open: 0.6, width: 0.4, lipRound: 0.5, tongueVisible: false, teethVisible: false },
  thinking: { open: 0.05, width: 0.45, lipRound: 0, tongueVisible: false, teethVisible: false },
  speaking: { open: 0.35, width: 0.5, lipRound: 0.2, tongueVisible: true, teethVisible: true },
  listening: { open: 0.05, width: 0.5, lipRound: 0, tongueVisible: false, teethVisible: false },
  wink: { open: 0.05, width: 0.55, lipRound: 0, tongueVisible: false, teethVisible: false },
  laugh: { open: 0.5, width: 0.7, lipRound: 0, tongueVisible: true, teethVisible: true },
};

// Phoneme to mouth shape mapping
const PHONEME_MOUTH_SHAPES: Record<string, MouthShape> = {
  silence: { open: 0.02, width: 0.5, lipRound: 0, tongueVisible: false, teethVisible: false },
  PP: { open: 0.0, width: 0.45, lipRound: 0, tongueVisible: false, teethVisible: false },
  FF: { open: 0.05, width: 0.5, lipRound: 0, tongueVisible: false, teethVisible: true },
  TH: { open: 0.08, width: 0.5, lipRound: 0, tongueVisible: true, teethVisible: true },
  DD: { open: 0.1, width: 0.5, lipRound: 0, tongueVisible: true, teethVisible: true },
  kk: { open: 0.15, width: 0.5, lipRound: 0, tongueVisible: false, teethVisible: true },
  CH: { open: 0.12, width: 0.45, lipRound: 0.1, tongueVisible: false, teethVisible: true },
  SS: { open: 0.08, width: 0.5, lipRound: 0, tongueVisible: false, teethVisible: true },
  nn: { open: 0.08, width: 0.5, lipRound: 0, tongueVisible: true, teethVisible: false },
  RR: { open: 0.12, width: 0.45, lipRound: 0.1, tongueVisible: false, teethVisible: false },
  aa: { open: 0.55, width: 0.55, lipRound: 0, tongueVisible: false, teethVisible: true },
  E: { open: 0.25, width: 0.6, lipRound: 0, tongueVisible: true, teethVisible: true },
  I: { open: 0.2, width: 0.6, lipRound: 0, tongueVisible: true, teethVisible: true },
  O: { open: 0.4, width: 0.35, lipRound: 0.7, tongueVisible: false, teethVisible: false },
  OO: { open: 0.3, width: 0.25, lipRound: 0.9, tongueVisible: false, teethVisible: false },
};

// ============================================================
// Avatar Engine Class
// ============================================================

export class AvatarEngine {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  // ----------------------------------------------------------
  // Create Avatar
  // ----------------------------------------------------------
  async createAvatar(params: {
    name: string;
    style?: AvatarStyle;
    model?: string;
    voiceId?: string;
    appearance?: AvatarAppearance;
    customData?: Record<string, unknown>;
  }): Promise<AvatarConfig> {
    const avatar = await db.avatarConfig.create({
      data: {
        userId: this.userId,
        name: params.name,
        model: params.model || 'default',
        style: params.style || 'realistic',
        voiceId: params.voiceId || null,
        expressions: JSON.stringify(
          Object.keys(EXPRESSION_MOUTH_SHAPES) as AvatarExpression[]
        ),
        animations: JSON.stringify(this.getDefaultAnimations()),
        customData: JSON.stringify({
          appearance: params.appearance || {},
          ...params.customData,
        }),
        isActive: true,
      },
    });

    return this.mapDbToConfig(avatar);
  }

  // ----------------------------------------------------------
  // Get Avatar
  // ----------------------------------------------------------
  async getAvatar(id: string): Promise<AvatarConfig | null> {
    const avatar = await db.avatarConfig.findFirst({
      where: { id, userId: this.userId },
    });
    if (!avatar) return null;
    return this.mapDbToConfig(avatar);
  }

  // ----------------------------------------------------------
  // List Avatars
  // ----------------------------------------------------------
  async listAvatars(includeInactive = false): Promise<AvatarConfig[]> {
    const avatars = await db.avatarConfig.findMany({
      where: {
        userId: this.userId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { createdAt: 'desc' },
    });
    return avatars.map((a) => this.mapDbToConfig(a));
  }

  // ----------------------------------------------------------
  // Update Avatar
  // ----------------------------------------------------------
  async updateAvatar(
    id: string,
    updates: Partial<Pick<AvatarConfig, 'name' | 'style' | 'voiceId' | 'customData' | 'isActive'>>
  ): Promise<AvatarConfig> {
    const avatar = await db.avatarConfig.update({
      where: { id },
      data: {
        ...(updates.name && { name: updates.name }),
        ...(updates.style && { style: updates.style }),
        ...(updates.voiceId !== undefined && { voiceId: updates.voiceId }),
        ...(updates.customData && { customData: JSON.stringify(updates.customData) }),
        ...(updates.isActive !== undefined && { isActive: updates.isActive }),
      },
    });
    return this.mapDbToConfig(avatar);
  }

  // ----------------------------------------------------------
  // Delete Avatar
  // ----------------------------------------------------------
  async deleteAvatar(id: string): Promise<void> {
    await db.avatarConfig.delete({ where: { id } });
  }

  // ----------------------------------------------------------
  // Generate Avatar Image
  // ----------------------------------------------------------
  async generateAvatarImage(
    id: string,
    expression: AvatarExpression = 'neutral',
    options?: {
      width?: number;
      height?: number;
      format?: 'png' | 'jpeg' | 'webp';
    }
  ): Promise<{ imageBase64: string; thumbnailUrl: string }> {
    const avatar = await this.getAvatar(id);
    if (!avatar) throw new Error('Avatar not found');

    const appearance = (avatar.customData as Record<string, unknown>)?.appearance as AvatarAppearance | undefined;
    const width = options?.width || 512;
    const height = options?.height || 512;

    // Generate a deterministic SVG-based avatar image
    const svgImage = this.renderSvgAvatar(avatar, expression, appearance, width, height);

    // Convert to base64 (in production, this would render via canvas/sharp)
    const base64 = Buffer.from(svgImage).toString('base64');

    // Update thumbnail
    const thumbnailUrl = `data:image/svg+xml;base64,${base64}`;
    await db.avatarConfig.update({
      where: { id },
      data: { thumbnailUrl },
    });

    return { imageBase64: base64, thumbnailUrl };
  }

  // ----------------------------------------------------------
  // Animate Expression
  // ----------------------------------------------------------
  async animateExpression(
    id: string,
    expression: AvatarExpression,
    options?: {
      duration?: number;
      intensity?: number;
      transitionMs?: number;
    }
  ): Promise<{
    frames: AvatarRenderFrame[];
    expression: AvatarExpression;
    duration: number;
  }> {
    const avatar = await this.getAvatar(id);
    if (!avatar) throw new Error('Avatar not found');

    const duration = options?.duration || 1000;
    const intensity = options?.intensity || 1.0;
    const transitionMs = options?.transitionMs || 200;
    const fps = 30;
    const totalFrames = Math.ceil(duration / (1000 / fps));
    const transitionFrames = Math.ceil(transitionMs / (1000 / fps));

    const targetMouth = EXPRESSION_MOUTH_SHAPES[expression] || EXPRESSION_MOUTH_SHAPES.neutral;
    const neutralMouth = EXPRESSION_MOUTH_SHAPES.neutral;

    const frames: AvatarRenderFrame[] = [];
    for (let i = 0; i < totalFrames; i++) {
      const progress = i / totalFrames;
      const isTransition = i < transitionFrames;
      const t = isTransition ? i / transitionFrames : 1;

      const mouthShape: MouthShape = {
        open: this.lerp(neutralMouth.open, targetMouth.open * intensity, t),
        width: this.lerp(neutralMouth.width, targetMouth.width * intensity, t),
        lipRound: this.lerp(neutralMouth.lipRound, targetMouth.lipRound * intensity, t),
        tongueVisible: targetMouth.tongueVisible,
        teethVisible: targetMouth.teethVisible,
      };

      frames.push({
        timestamp: Math.round(i * (1000 / fps)),
        expression,
        mouthShape,
        headRotation: { x: 0, y: 0, z: 0 },
        eyeBlink: expression === 'wink' ? 0 : 1,
      });
    }

    return { frames, expression, duration };
  }

  // ----------------------------------------------------------
  // Generate Lip Sync
  // ----------------------------------------------------------
  async generateLipSync(
    id: string,
    text: string,
    options?: {
      language?: string;
      speed?: number;
    }
  ): Promise<{
    lipSyncFrames: LipSyncFrame[];
    audioUrl?: string;
    duration: number;
    phonemeCount: number;
  }> {
    const avatar = await this.getAvatar(id);
    if (!avatar) throw new Error('Avatar not found');

    const language = options?.language || 'en';
    const speed = options?.speed || 1.0;

    // Generate phoneme sequence from text
    const phonemes = this.textToPhonemes(text);
    const avgPhonemeDuration = 80 / speed; // ms per phoneme
    const totalDuration = phonemes.length * avgPhonemeDuration;

    const lipSyncFrames: LipSyncFrame[] = phonemes.map((phoneme, index) => {
      const mouthShape = PHONEME_MOUTH_SHAPES[phoneme] || PHONEME_MOUTH_SHAPES.silence;
      return {
        time: Math.round(index * avgPhonemeDuration),
        phoneme,
        mouthShape,
        intensity: 1.0,
      };
    });

    // Generate TTS audio if voice is configured
    let audioUrl: string | undefined;
    if (avatar.voiceId) {
      try {
        const tts = createTTSEngine(this.userId);
        const audioBuffer = await tts.synthesize(text, {
          voice: avatar.voiceId,
          language,
          speed,
        });
        // In production, save to storage and return URL
        audioUrl = `data:audio/mp3;base64,${audioBuffer.audioBuffer.toString('base64')}`;
      } catch {
        // TTS not available, continue without audio
      }
    }

    return {
      lipSyncFrames,
      audioUrl,
      duration: totalDuration,
      phonemeCount: phonemes.length,
    };
  }

  // ----------------------------------------------------------
  // Render Avatar Frame
  // ----------------------------------------------------------
  renderAvatarFrame(
    avatar: AvatarConfig,
    frame: AvatarRenderFrame
  ): string {
    const appearance = (avatar.customData as Record<string, unknown>)?.appearance as AvatarAppearance | undefined;
    return this.renderSvgAvatar(avatar, frame.expression, appearance, 512, 512, frame);
  }

  // ----------------------------------------------------------
  // Private Helpers
  // ----------------------------------------------------------

  private textToPhonemes(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const phonemes: string[] = [];

    for (const word of words) {
      // Simple phoneme approximation
      const chars = word.split('');
      for (const char of chars) {
        if ('aeiou'.includes(char)) {
          if (char === 'a') phonemes.push('aa');
          else if (char === 'e') phonemes.push('E');
          else if (char === 'i') phonemes.push('I');
          else if (char === 'o') phonemes.push('O');
          else if (char === 'u') phonemes.push('OO');
        } else if ('bp'.includes(char)) phonemes.push('PP');
        else if ('fv'.includes(char)) phonemes.push('FF');
        else if ('td'.includes(char)) phonemes.push('DD');
        else if ('kg'.includes(char)) phonemes.push('kk');
        else if ('sz'.includes(char)) phonemes.push('SS');
        else if ('nr'.includes(char)) phonemes.push('nn');
        else if ('lm'.includes(char)) phonemes.push('nn');
        else phonemes.push('silence');
      }
      phonemes.push('silence');
    }

    return phonemes;
  }

  private getDefaultAnimations(): AnimationConfig[] {
    return [
      {
        id: randomUUID(),
        name: 'idle_breathing',
        type: 'idle',
        duration: 3000,
        keyframes: [
          { time: 0, expression: 'neutral', intensity: 1, eyeBlink: 1 },
          { time: 0.5, expression: 'neutral', intensity: 1, eyeBlink: 0 },
          { time: 1, expression: 'neutral', intensity: 1, eyeBlink: 1 },
        ],
        loop: true,
      },
      {
        id: randomUUID(),
        name: 'speaking_nod',
        type: 'speaking',
        duration: 2000,
        keyframes: [
          { time: 0, expression: 'speaking', intensity: 0.8, headRotation: { x: 0, y: 0, z: 0 } },
          { time: 0.25, expression: 'speaking', intensity: 1, headRotation: { x: 5, y: 0, z: 0 } },
          { time: 0.75, expression: 'speaking', intensity: 0.9, headRotation: { x: -3, y: 0, z: 0 } },
          { time: 1, expression: 'neutral', intensity: 0.8, headRotation: { x: 0, y: 0, z: 0 } },
        ],
        loop: false,
      },
    ];
  }

  private renderSvgAvatar(
    avatar: AvatarConfig,
    expression: AvatarExpression,
    appearance?: AvatarAppearance,
    width = 512,
    height = 512,
    frame?: AvatarRenderFrame
  ): string {
    const mouth = frame?.mouthShape || EXPRESSION_MOUTH_SHAPES[expression] || EXPRESSION_MOUTH_SHAPES.neutral;
    const skinTone = appearance?.skinTone || '#F5D0A9';
    const hairColor = appearance?.hairColor || '#4A3728';
    const eyeColor = appearance?.eyeColor || '#3B7A57';
    const bgColor = appearance?.background || '#1a1a2e';

    const mouthOpenHeight = Math.round(mouth.open * 30);
    const mouthWidth = Math.round(mouth.width * 60);
    const eyeOpenness = frame?.eyeBlink ?? 1;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 512 512">
      <defs>
        <radialGradient id="bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${bgColor}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="${bgColor}" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <rect width="512" height="512" fill="url(#bg)"/>
      <!-- Head -->
      <ellipse cx="256" cy="220" rx="120" ry="150" fill="${skinTone}"/>
      <!-- Hair -->
      <ellipse cx="256" cy="140" rx="130" ry="80" fill="${hairColor}"/>
      <!-- Eyes -->
      <ellipse cx="210" cy="210" rx="20" ry="${20 * eyeOpenness}" fill="white"/>
      <circle cx="210" cy="210" r="10" fill="${eyeColor}"/>
      <ellipse cx="302" cy="210" rx="20" ry="${20 * eyeOpenness}" fill="white"/>
      <circle cx="302" cy="210" r="10" fill="${eyeColor}"/>
      <!-- Eyebrows -->
      <line x1="190" y1="180" x2="230" y2="${175 + (expression === 'angry' ? 5 : expression === 'surprised' ? -5 : 0)}" stroke="${hairColor}" stroke-width="4" stroke-linecap="round"/>
      <line x1="282" y1="${175 + (expression === 'angry' ? 5 : expression === 'surprised' ? -5 : 0)}" x2="322" y2="180" stroke="${hairColor}" stroke-width="4" stroke-linecap="round"/>
      <!-- Nose -->
      <path d="M256 220 L248 260 L264 260" fill="none" stroke="${skinTone}" stroke-width="3" opacity="0.6"/>
      <!-- Mouth -->
      <ellipse cx="256" cy="290" rx="${mouthWidth}" ry="${mouthOpenHeight}" fill="${mouth.teethVisible ? '#fff' : '#c0392b'}" stroke="#a93226" stroke-width="1.5"/>
      ${mouth.teethVisible ? `<rect x="${256 - mouthWidth + 10}" y="285" width="${(mouthWidth - 10) * 2}" height="8" rx="2" fill="white"/>` : ''}
      ${mouth.tongueVisible ? `<ellipse cx="256" cy="${290 + mouthOpenHeight - 8}" rx="${mouthWidth * 0.5}" ry="${mouthOpenHeight * 0.4}" fill="#e74c3c"/>` : ''}
      <!-- Style indicator -->
      <text x="256" y="480" text-anchor="middle" fill="#888" font-size="14" font-family="sans-serif">${avatar.style} • ${expression}</text>
    </svg>`;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.min(1, Math.max(0, t));
  }

  private mapDbToConfig(avatar: {
    id: string;
    userId: string;
    name: string;
    model: string;
    style: string;
    voiceId: string | null;
    expressions: string;
    animations: string;
    customData: string;
    thumbnailUrl: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): AvatarConfig {
    return {
      id: avatar.id,
      userId: avatar.userId,
      name: avatar.name,
      model: avatar.model,
      style: avatar.style as AvatarStyle,
      voiceId: avatar.voiceId,
      expressions: JSON.parse(avatar.expressions || '[]'),
      animations: JSON.parse(avatar.animations || '[]'),
      customData: JSON.parse(avatar.customData || '{}'),
      thumbnailUrl: avatar.thumbnailUrl,
      isActive: avatar.isActive,
      createdAt: avatar.createdAt,
      updatedAt: avatar.updatedAt,
    };
  }
}

// ============================================================
// Factory
// ============================================================

export function createAvatarEngine(userId: string): AvatarEngine {
  return new AvatarEngine(userId);
}
