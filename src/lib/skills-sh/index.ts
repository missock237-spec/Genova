/**
 * Skills.sh Integration — Public API
 * 
 * This module integrates the skills.sh ecosystem into Gen3ia's agent system.
 * When a user creates an agent, the system automatically:
 * 1. Selects local skills based on the agent type
 * 2. Infers additional skills from the system prompt
 * 3. Queries skills.sh for relevant ecosystem skills (async, non-blocking)
 * 
 * The integration is designed to be zero-latency for agent creation:
 * - Local skill matching happens synchronously
 * - skills.sh API calls happen asynchronously (fire-and-forget)
 * - Graceful fallback if skills.sh is unavailable
 */

export { searchSkills, listSkills, getSkillDetail, getCuratedSkills, batchSearchSkills } from './client';
export type { SkillsShSkill, SkillsShSearchResult, SkillsShListResult, SkillsShDetailResult } from './client';

export { matchSkillsForAgent, matchSkillsLocal, triggerSkillsShDiscovery } from './skill-matcher';
export type { MatchedSkill, SkillMatchResult } from './skill-matcher';

export {
  AGENT_TYPES,
  getAgentTypeById,
  VALID_AGENT_TYPE_IDS,
  getAgentTypesByCategory,
} from './agent-types';
export type { AgentTypeDefinition } from './agent-types';
