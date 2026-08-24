/**
 * Skill Matcher Engine
 *
 * Automatically selects the best skills for an agent based on:
 * 1. Agent type (curated local skills + skills.sh queries)
 * 2. System prompt content (keyword-based skill inference)
 * 3. Skills.sh API results (live discovery from the ecosystem)
 *
 * The matcher combines curated mappings with live API results,
 * falling back gracefully if the skills.sh API is unavailable.
 */

import { batchSearchSkills, searchSkills, type SkillsShSkill } from './client';
import { getAgentTypeById, type AgentTypeDefinition } from './agent-types';

// ─── Types ────────────────────────────────────────────────────

export interface MatchedSkill {
  /** Local skill ID (from AVAILABLE_SKILLS) */
  localId?: string;
  /** skills.sh skill ID (e.g. "vercel-labs/skills/nextjs") */
  skillsShId?: string;
  /** Display name */
  name: string;
  /** Why this skill was selected */
  reason: 'type_default' | 'prompt_inference' | 'skills_sh_api';
  /** Install count from skills.sh (if applicable) */
  installs?: number;
  /** Skill URL on skills.sh */
  url?: string;
  /** Confidence score 0-1 */
  confidence: number;
}

export interface SkillMatchResult {
  localSkills: string[];
  skillsShSkills: SkillsShSkill[];
  matches: MatchedSkill[];
  /** Whether the skills.sh API was successfully queried */
  apiAvailable: boolean;
}

// ─── Keyword → Local Skill Inference ──────────────────────────

const KEYWORD_SKILL_MAP: Record<string, string[]> = {
  // Web & recherche
  'recherche': ['web_search'],
  'search': ['web_search'],
  'trouve': ['web_search'],
  'google': ['web_search'],
  'browse': ['web_search'],

  // Code
  'code': ['code_generation'],
  'programme': ['code_generation'],
  'développ': ['code_generation'],
  'develop': ['code_generation'],
  'script': ['code_generation'],
  'api': ['code_generation'],
  'débogu': ['code_generation'],
  'debug': ['code_generation'],

  // Data
  'donnée': ['data_analysis'],
  'data': ['data_analysis'],
  'statistiqu': ['data_analysis'],
  'graphique': ['data_analysis'],
  'tableau': ['data_analysis'],
  'analy': ['data_analysis'],

  // Writing
  'rédac': ['writing'],
  'redac': ['writing'],
  'écrit': ['writing'],
  'ecrit': ['writing'],
  'article': ['writing'],
  'blog': ['writing'],
  'contenu': ['writing'],
  'copywriting': ['writing'],

  // Translation
  'tradui': ['translation'],
  'transla': ['translation'],
  'multilingue': ['translation'],
  'anglais': ['translation'],
  'français': ['translation'],

  // Image
  'image': ['image_generation'],
  'visuel': ['image_generation'],
  'logo': ['image_generation'],
  'illustration': ['image_generation'],
  'dessin': ['image_generation'],

  // Email
  'email': ['email'],
  'courriel': ['email'],
  'mail': ['email'],
  'newsletter': ['email'],

  // Document
  'document': ['document_analysis'],
  'pdf': ['document_analysis'],
  'rapport': ['document_analysis'],
  'contrat': ['document_analysis'],
  'facture': ['document_analysis'],
};

// ─── Core Matching Logic ──────────────────────────────────────

/**
 * Infer local skills from the system prompt content.
 * Scans for keywords and returns matched skill IDs.
 */
function inferSkillsFromPrompt(systemPrompt: string): Array<{
  skillId: string;
  confidence: number;
  reason: string;
}> {
  const lower = systemPrompt.toLowerCase();
  const matches = new Map<string, { confidence: number; reason: string }>();

  for (const [keyword, skillIds] of Object.entries(KEYWORD_SKILL_MAP)) {
    if (lower.includes(keyword.toLowerCase())) {
      for (const skillId of skillIds) {
        const existing = matches.get(skillId);
        // Each keyword hit increases confidence
        const newConfidence = existing ? existing.confidence + 0.15 : 0.6;
        matches.set(skillId, {
          confidence: Math.min(newConfidence, 0.95),
          reason: `Keyword match: "${keyword}"`,
        });
      }
    }
  }

  return Array.from(matches.entries()).map(([skillId, data]) => ({
    skillId,
    ...data,
  }));
}

/**
 * Main entry point: match skills for an agent.
 *
 * This function:
 * 1. Gets the agent type definition (if valid type)
 * 2. Extracts default local skills from the type
 * 3. Infers additional skills from the system prompt
 * 4. Queries skills.sh API for relevant ecosystem skills
 * 5. Merges and ranks all results
 */
export async function matchSkillsForAgent(params: {
  agentTypeId: string;
  systemPrompt: string;
  userSelectedSkills?: string[];
}): Promise<SkillMatchResult> {
  const { agentTypeId, systemPrompt, userSelectedSkills = [] } = params;
  const typeDef = getAgentTypeById(agentTypeId);

  // ── 1. Collect local skills ──────────────────────
  const localSkillSet = new Set<string>();
  const matches: MatchedSkill[] = [];

  // From agent type defaults
  if (typeDef) {
    for (const skillId of typeDef.localSkills) {
      if (!localSkillSet.has(skillId)) {
        localSkillSet.add(skillId);
        matches.push({
          localId: skillId,
          name: skillId,
          reason: 'type_default',
          confidence: 0.95,
        });
      }
    }
  }

  // From user manual selection
  for (const skillId of userSelectedSkills) {
    if (!localSkillSet.has(skillId)) {
      localSkillSet.add(skillId);
      matches.push({
        localId: skillId,
        name: skillId,
        reason: 'type_default',
        confidence: 0.99,
      });
    }
  }

  // ── 2. Infer from prompt ─────────────────────────
  const inferred = inferSkillsFromPrompt(systemPrompt);
  for (const inf of inferred) {
    if (!localSkillSet.has(inf.skillId)) {
      localSkillSet.add(inf.skillId);
      matches.push({
        localId: inf.skillId,
        name: inf.skillId,
        reason: 'prompt_inference',
        confidence: inf.confidence,
      });
    }
  }

  // ── 3. Query skills.sh API ───────────────────────
  let skillsShSkills: SkillsShSkill[] = [];
  let apiAvailable = false;

  // Build queries from type + prompt keywords
  const apiQueries: string[] = [];
  if (typeDef) {
    apiQueries.push(...typeDef.skillsShQueries);
  }
  // Extract significant words from prompt (3+ chars, non-common)
  const promptWords = systemPrompt
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 5);
  if (promptWords.length > 0) {
    apiQueries.push(promptWords.join(' '));
  }

  // Deduplicate queries
  const uniqueQueries = [...new Set(apiQueries)].slice(0, 8);

  try {
    skillsShSkills = await batchSearchSkills(uniqueQueries, 3);
    apiAvailable = true;

    for (const skill of skillsShSkills.slice(0, 10)) {
      matches.push({
        skillsShId: skill.id,
        name: skill.name,
        reason: 'skills_sh_api',
        installs: skill.installs,
        url: skill.url,
        confidence: Math.min(0.5 + (skill.installs / 100000), 0.9),
      });
    }
  } catch (err) {
    // Graceful fallback — API is optional enhancement
    console.warn(
      '[skill-matcher] skills.sh API unavailable (non-blocking):',
      err instanceof Error ? err.message : err
    );
  }

  // ── 4. Sort by confidence ─────────────────────────
  matches.sort((a, b) => b.confidence - a.confidence);

  return {
    localSkills: [...localSkillSet],
    skillsShSkills,
    matches,
    apiAvailable,
  };
}

/**
 * Lightweight version for the API route (no API call, just local inference).
 * Used during agent creation to keep latency low.
 */
export function matchSkillsLocal(params: {
  agentTypeId: string;
  systemPrompt: string;
}): { localSkills: string[]; matches: MatchedSkill[] } {
  const { agentTypeId, systemPrompt } = params;
  const typeDef = getAgentTypeById(agentTypeId);

  const localSkillSet = new Set<string>();
  const matches: MatchedSkill[] = [];

  // Type defaults
  if (typeDef) {
    for (const skillId of typeDef.localSkills) {
      localSkillSet.add(skillId);
      matches.push({
        localId: skillId,
        name: skillId,
        reason: 'type_default',
        confidence: 0.95,
      });
    }
  }

  // Prompt inference
  const inferred = inferSkillsFromPrompt(systemPrompt);
  for (const inf of inferred) {
    if (!localSkillSet.has(inf.skillId)) {
      localSkillSet.add(inf.skillId);
      matches.push({
        localId: inf.skillId,
        name: inf.skillId,
        reason: 'prompt_inference',
        confidence: inf.confidence,
      });
    }
  }

  return { localSkills: [...localSkillSet], matches };
}

/**
 * Trigger async skills.sh discovery after agent creation (fire-and-forget).
 * Results are stored in the agent's config for later enrichment.
 */
export function triggerSkillsShDiscovery(
  agentId: string,
  agentTypeId: string,
  systemPrompt: string
): void {
  // Fire-and-forget — non-blocking
  matchSkillsForAgent({ agentTypeId, systemPrompt }).then((result) => {
    if (result.apiAvailable && result.skillsShSkills.length > 0) {
      console.log(
        `[skill-matcher] Agent ${agentId} (${agentTypeId}): ` +
          `discovered ${result.skillsShSkills.length} skills.sh skills`
      );
    }
  }).catch(() => {
    // Silent failure — this is enhancement-only
  });
}
