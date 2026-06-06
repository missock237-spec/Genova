/**
 * PocketBase Client — Connect to PocketBase for agent data persistence
 *
 * PocketBase is a lightweight, open-source backend-as-a-service that provides
 * a real-time database, authentication, and file storage. In Genova, it's used
 * for agent learning data, extended memory, and custom data collections.
 *
 * Environment variables:
 *   POCKETBASE_URL — Base URL of the PocketBase instance (default: http://localhost:8090)
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('pocketbase-client');

// Types
export interface PBRecord {
  id?: string;
  created?: string;
  updated?: string;
  [key: string]: unknown;
}

export interface PBListResult<T extends PBRecord> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

export interface PBAuthResponse {
  token: string;
  record: PBRecord;
}

export interface PBCollection {
  name: string;
  type: 'base' | 'auth' | 'view';
  schema: PBSchemaField[];
  indexes?: string[];
}

export interface PBSchemaField {
  name: string;
  type: string;
  required?: boolean;
  options?: Record<string, unknown>;
}

export interface AgentMemoryRecord extends PBRecord {
  userId: string;
  agentId: string;
  memoryType: 'conversation' | 'learning' | 'feedback' | 'preference' | 'context';
  content: string;
  metadata?: string;
  relevanceScore?: number;
  expiresAt?: string;
}

export interface AgentLearningRecord extends PBRecord {
  userId: string;
  agentId: string;
  category: string;
  pattern: string;
  response: string;
  confidence: number;
  usageCount: number;
  lastUsedAt: string;
}

/**
 * Escape a value for use in PocketBase filter strings.
 * Prevents filter string injection by doubling single quotes.
 */
function escapePbFilter(value: string): string {
  return value.replace(/'/g, "''");
}

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090';
let authToken: string | null = null;

/**
 * Make an authenticated request to PocketBase
 */
async function pbRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${POCKETBASE_URL}/api${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (authToken) {
    headers['Authorization'] = authToken;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    log.error('PocketBase API request failed', { path, status: response.status, error: errorBody });
    throw new Error(`PocketBase API error (${response.status}): ${errorBody}`);
  }

  // For DELETE requests that return 204
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

/**
 * Check if PocketBase is available
 */
export async function checkPocketBaseHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${POCKETBASE_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Authenticate as admin with PocketBase
 */
export async function authenticateAdmin(email: string, password: string): Promise<string> {
  log.info('Authenticating with PocketBase admin');
  const response = await fetch(`${POCKETBASE_URL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`PocketBase admin auth failed: ${response.status}`);
  }

  const data = await response.json();
  authToken = data.token;
  return data.token;
}

// ── Collection Management ─────────────────────────────────────

/**
 * List all collections
 */
export async function listCollections(): Promise<PBCollection[]> {
  const result = await pbRequest<{ data: PBCollection[] }>('/collections');
  return result.data || [];
}

/**
 * Create a new collection
 */
export async function createCollection(collection: Omit<PBCollection, 'name'> & { name: string }): Promise<PBCollection> {
  log.info('Creating PocketBase collection', { name: collection.name });
  return pbRequest<PBCollection>('/collections', {
    method: 'POST',
    body: JSON.stringify(collection),
  });
}

// ── Record CRUD ───────────────────────────────────────────────

/**
 * List records from a collection
 */
export async function listRecords<T extends PBRecord>(
  collection: string,
  options: {
    page?: number;
    perPage?: number;
    sort?: string;
    filter?: string;
    expand?: string;
  } = {},
): Promise<PBListResult<T>> {
  const params = new URLSearchParams();
  if (options.page) params.set('page', String(options.page));
  if (options.perPage) params.set('perPage', String(options.perPage));
  if (options.sort) params.set('sort', options.sort);
  if (options.filter) params.set('filter', options.filter);
  if (options.expand) params.set('expand', options.expand);

  const query = params.toString() ? `?${params.toString()}` : '';
  return pbRequest<PBListResult<T>>(`/collections/${collection}/records${query}`);
}

/**
 * Get a single record
 */
export async function getRecord<T extends PBRecord>(collection: string, id: string): Promise<T> {
  return pbRequest<T>(`/collections/${collection}/records/${id}`);
}

/**
 * Create a record
 */
export async function createRecord<T extends PBRecord>(collection: string, data: Omit<T, 'id' | 'created' | 'updated'>): Promise<T> {
  log.info('Creating PocketBase record', { collection });
  return pbRequest<T>(`/collections/${collection}/records`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Update a record
 */
export async function updateRecord<T extends PBRecord>(collection: string, id: string, data: Partial<T>): Promise<T> {
  log.info('Updating PocketBase record', { collection, id });
  return pbRequest<T>(`/collections/${collection}/records/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Delete a record
 */
export async function deleteRecord(collection: string, id: string): Promise<void> {
  log.info('Deleting PocketBase record', { collection, id });
  await pbRequest<void>(`/collections/${collection}/records/${id}`, {
    method: 'DELETE',
  });
}

// ── Genova-specific: Agent Memory ─────────────────────────────

/**
 * Store agent memory in PocketBase
 */
export async function storeAgentMemory(memory: Omit<AgentMemoryRecord, 'id' | 'created' | 'updated'>): Promise<AgentMemoryRecord> {
  return createRecord<AgentMemoryRecord>('agent_memories', memory);
}

/**
 * Retrieve agent memories
 */
export async function getAgentMemories(
  userId: string,
  agentId: string,
  options: {
    memoryType?: string;
    limit?: number;
    minRelevance?: number;
  } = {},
): Promise<AgentMemoryRecord[]> {
  let filter = `userId='${escapePbFilter(userId)}' && agentId='${escapePbFilter(agentId)}'`;
  if (options.memoryType) {
    filter += ` && memoryType='${escapePbFilter(options.memoryType)}'`;
  }
  if (options.minRelevance) {
    filter += ` && relevanceScore>=${options.minRelevance}`;
  }

  const result = await listRecords<AgentMemoryRecord>('agent_memories', {
    filter,
    sort: '-created',
    perPage: options.limit || 50,
  });

  return result.items;
}

/**
 * Search agent memories by content
 */
export async function searchAgentMemories(
  userId: string,
  agentId: string,
  query: string,
  limit?: number,
): Promise<AgentMemoryRecord[]> {
  const filter = `userId='${escapePbFilter(userId)}' && agentId='${escapePbFilter(agentId)}' && content~'${escapePbFilter(query)}'`;
  const result = await listRecords<AgentMemoryRecord>('agent_memories', {
    filter,
    sort: '-relevanceScore',
    perPage: limit || 20,
  });

  return result.items;
}

// ── Genova-specific: Agent Learning ───────────────────────────

/**
 * Store agent learning pattern
 */
export async function storeAgentLearning(learning: Omit<AgentLearningRecord, 'id' | 'created' | 'updated'>): Promise<AgentLearningRecord> {
  return createRecord<AgentLearningRecord>('agent_learnings', learning);
}

/**
 * Get agent learning patterns
 */
export async function getAgentLearnings(
  userId: string,
  agentId: string,
  category?: string,
): Promise<AgentLearningRecord[]> {
  let filter = `userId='${escapePbFilter(userId)}' && agentId='${escapePbFilter(agentId)}'`;
  if (category) {
    filter += ` && category='${escapePbFilter(category)}'`;
  }

  const result = await listRecords<AgentLearningRecord>('agent_learnings', {
    filter,
    sort: '-confidence,-usageCount',
    perPage: 100,
  });

  return result.items;
}

/**
 * Increment learning usage count
 */
export async function incrementLearningUsage(id: string): Promise<void> {
  const record = await getRecord<AgentLearningRecord>('agent_learnings', id);
  await updateRecord<AgentLearningRecord>('agent_learnings', id, {
    usageCount: (record.usageCount || 0) + 1,
    lastUsedAt: new Date().toISOString(),
  } as Partial<AgentLearningRecord>);
}

// ── Setup: Ensure Genova collections exist ────────────────────

/**
 * Initialize Genova collections in PocketBase.
 * Creates the required collections if they don't exist.
 */
export async function initializeGenovaCollections(): Promise<void> {
  const existingCollections = await listCollections();
  const existingNames = new Set(existingCollections.map(c => c.name));

  const requiredCollections: PBCollection[] = [
    {
      name: 'agent_memories',
      type: 'base',
      schema: [
        { name: 'userId', type: 'text', required: true },
        { name: 'agentId', type: 'text', required: true },
        { name: 'memoryType', type: 'select', required: true, options: { values: ['conversation', 'learning', 'feedback', 'preference', 'context'] } },
        { name: 'content', type: 'text', required: true },
        { name: 'metadata', type: 'json' },
        { name: 'relevanceScore', type: 'number' },
        { name: 'expiresAt', type: 'date' },
      ],
      indexes: [
        'CREATE INDEX idx_agent_memories_user_agent ON agent_memories (userId, agentId)',
        'CREATE INDEX idx_agent_memories_type ON agent_memories (memoryType)',
      ],
    },
    {
      name: 'agent_learnings',
      type: 'base',
      schema: [
        { name: 'userId', type: 'text', required: true },
        { name: 'agentId', type: 'text', required: true },
        { name: 'category', type: 'text', required: true },
        { name: 'pattern', type: 'text', required: true },
        { name: 'response', type: 'text', required: true },
        { name: 'confidence', type: 'number', required: true },
        { name: 'usageCount', type: 'number' },
        { name: 'lastUsedAt', type: 'date' },
      ],
      indexes: [
        'CREATE INDEX idx_agent_learnings_user_agent ON agent_learnings (userId, agentId)',
        'CREATE INDEX idx_agent_learnings_category ON agent_learnings (category)',
      ],
    },
  ];

  for (const collection of requiredCollections) {
    if (!existingNames.has(collection.name)) {
      log.info('Creating PocketBase collection', { name: collection.name });
      await createCollection(collection);
    }
  }
}

export const pocketBase = {
  health: checkPocketBaseHealth,
  getBaseUrl: () => POCKETBASE_URL,
  isAuthenticated: () => !!authToken,
  authenticateAdmin,
  listCollections,
  createCollection,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  storeAgentMemory,
  getAgentMemories,
  searchAgentMemories,
  storeAgentLearning,
  getAgentLearnings,
  incrementLearningUsage,
  initializeGenovaCollections,
};

export { POCKETBASE_URL };
