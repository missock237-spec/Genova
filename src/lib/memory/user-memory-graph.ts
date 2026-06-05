/**
 * User Memory Graph — Personal knowledge graph for each user
 *
 * Builds a structured graph of user preferences, projects, habits,
 * style, contacts, and topics with typed relationships between them.
 *
 * Features:
 * - Add/query/delete graph nodes and edges
 * - Contextual retrieval via weighted graph traversal
 * - Auto-learn from user interactions
 * - Time-decayed relevance scoring
 */

import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryNodeType = 'preference' | 'project' | 'habit' | 'style' | 'contact' | 'topic' | 'general';
export type EdgeRelation = 'prefers_for' | 'related_to' | 'part_of' | 'leads_to' | 'associated_with' | 'influences' | 'contradicts';

export interface AddNodeOptions {
  type?: MemoryNodeType;
  label: string;
  content: string;
  metadata?: Record<string, unknown>;
  weight?: number;
  expiresAt?: Date;
}

export interface AddEdgeOptions {
  sourceNodeId: string;
  targetNodeId: string;
  relation: EdgeRelation | string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface GraphNode {
  id: string;
  userId: string;
  type: string;
  label: string;
  content: string;
  metadata: Record<string, unknown>;
  weight: number;
  accessCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export interface GraphEdge {
  id: string;
  userId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relation: string;
  weight: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface GraphContext {
  nodes: GraphNode[];
  edges: GraphEdge[];
  relevantNodes: GraphNode[];
}

// ---------------------------------------------------------------------------
// Helper: safe JSON parse
// ---------------------------------------------------------------------------

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function serializeNode(node: {
  id: string;
  userId: string;
  type: string;
  label: string;
  content: string;
  metadata: string;
  weight: number;
  accessCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}): GraphNode {
  return {
    ...node,
    metadata: safeParse<Record<string, unknown>>(node.metadata, {}),
  };
}

function serializeEdge(edge: {
  id: string;
  userId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relation: string;
  weight: number;
  metadata: string;
  createdAt: Date;
  updatedAt: Date;
}): GraphEdge {
  return {
    ...edge,
    metadata: safeParse<Record<string, unknown>>(edge.metadata, {}),
  };
}

// ---------------------------------------------------------------------------
// Core: Add Node
// ---------------------------------------------------------------------------

export async function addNode(
  userId: string,
  options: AddNodeOptions
): Promise<GraphNode> {
  const { type = 'general', label, content, metadata = {}, weight = 1.0, expiresAt } = options;

  // Check for duplicate label+type combo
  const existing = await db.memoryNode.findFirst({
    where: { userId, label, type, isActive: true },
  });

  if (existing) {
    // Update existing node — boost weight and update content
    const updated = await db.memoryNode.update({
      where: { id: existing.id },
      data: {
        content,
        metadata: JSON.stringify({ ...safeParse<Record<string, unknown>>(existing.metadata, {}), ...metadata }),
        weight: Math.min(existing.weight + 0.2, 5.0),
        accessCount: existing.accessCount + 1,
        updatedAt: new Date(),
      },
    });
    return serializeNode(updated);
  }

  const node = await db.memoryNode.create({
    data: {
      userId,
      type,
      label,
      content,
      metadata: JSON.stringify(metadata),
      weight,
      expiresAt: expiresAt || null,
    },
  });

  return serializeNode(node);
}

// ---------------------------------------------------------------------------
// Core: Add Edge
// ---------------------------------------------------------------------------

export async function addEdge(
  userId: string,
  options: AddEdgeOptions
): Promise<GraphEdge> {
  const { sourceNodeId, targetNodeId, relation, weight = 1.0, metadata = {} } = options;

  // Verify both nodes exist and belong to user
  const [sourceNode, targetNode] = await Promise.all([
    db.memoryNode.findFirst({ where: { id: sourceNodeId, userId, isActive: true } }),
    db.memoryNode.findFirst({ where: { id: targetNodeId, userId, isActive: true } }),
  ]);

  if (!sourceNode) throw new Error('Source node not found or not accessible');
  if (!targetNode) throw new Error('Target node not found or not accessible');

  // Check for duplicate edge
  const existing = await db.memoryEdge.findFirst({
    where: { sourceNodeId, targetNodeId, relation },
  });

  if (existing) {
    const updated = await db.memoryEdge.update({
      where: { id: existing.id },
      data: {
        weight: Math.min(existing.weight + 0.3, 5.0),
        metadata: JSON.stringify({ ...safeParse<Record<string, unknown>>(existing.metadata, {}), ...metadata }),
        updatedAt: new Date(),
      },
    });
    return serializeEdge(updated);
  }

  const edge = await db.memoryEdge.create({
    data: {
      userId,
      sourceNodeId,
      targetNodeId,
      relation,
      weight,
      metadata: JSON.stringify(metadata),
    },
  });

  return serializeEdge(edge);
}

// ---------------------------------------------------------------------------
// Core: Query Graph
// ---------------------------------------------------------------------------

export async function queryGraph(
  userId: string,
  options: {
    type?: MemoryNodeType;
    labelContains?: string;
    limit?: number;
    includeEdges?: boolean;
  } = {}
): Promise<GraphContext> {
  const { type, labelContains, limit = 50, includeEdges = true } = options;

  const where: Record<string, unknown> = { userId, isActive: true };
  if (type) where.type = type;
  if (labelContains) where.label = { contains: labelContains };

  const nodes = await db.memoryNode.findMany({
    where,
    orderBy: [{ weight: 'desc' }, { updatedAt: 'desc' }],
    take: limit,
  });

  const serializedNodes = nodes.map(serializeNode);

  let edges: GraphEdge[] = [];
  if (includeEdges && serializedNodes.length > 0) {
    const nodeIds = serializedNodes.map((n) => n.id);
    const edgeResults = await db.memoryEdge.findMany({
      where: {
        userId,
        OR: [
          { sourceNodeId: { in: nodeIds } },
          { targetNodeId: { in: nodeIds } },
        ],
      },
      orderBy: { weight: 'desc' },
      take: limit * 3,
    });
    edges = edgeResults.map(serializeEdge);
  }

  return { nodes: serializedNodes, edges, relevantNodes: serializedNodes };
}

// ---------------------------------------------------------------------------
// Core: Get Relevant Context — traverse graph for contextually relevant memories
// ---------------------------------------------------------------------------

export async function getRelevantContext(
  userId: string,
  query: string,
  options: { maxNodes?: number; maxHops?: number } = {}
): Promise<GraphContext> {
  const { maxNodes = 10, maxHops = 2 } = options;

  // Find nodes whose label or content matches the query
  const queryLower = query.toLowerCase();
  const allNodes = await db.memoryNode.findMany({
    where: { userId, isActive: true },
    orderBy: [{ weight: 'desc' }, { accessCount: 'desc' }],
  });

  // Score nodes by relevance to query
  const scored = allNodes.map((node) => {
    const labelLower = node.label.toLowerCase();
    const contentLower = node.content.toLowerCase();
    let score = 0;

    // Exact label match
    if (labelLower === queryLower) score += 3;
    // Label contains query
    else if (labelLower.includes(queryLower)) score += 2;
    // Content contains query
    if (contentLower.includes(queryLower)) score += 1.5;

    // Partial word matching
    const queryWords = queryLower.split(/\s+/);
    for (const word of queryWords) {
      if (word.length < 2) continue;
      if (labelLower.includes(word)) score += 0.5;
      if (contentLower.includes(word)) score += 0.3;
    }

    // Apply time decay and weight
    const daysSinceUpdate = (Date.now() - node.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    const decayFactor = Math.exp(-0.03 * daysSinceUpdate);
    score = score * decayFactor * node.weight;

    // Access count boost
    score *= (1 + Math.log2(node.accessCount + 1) * 0.1);

    return { node, score };
  });

  // Take top scoring seed nodes
  const seedNodes = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxNodes)
    .map((s) => s.node);

  // If no matches by content, return most relevant nodes by weight
  if (seedNodes.length === 0) {
    const topNodes = allNodes
      .sort((a, b) => b.weight - a.weight)
      .slice(0, maxNodes);
    const serializedNodes = topNodes.map(serializeNode);
    const nodeIds = serializedNodes.map((n) => n.id);

    const edges = await db.memoryEdge.findMany({
      where: {
        userId,
        OR: [{ sourceNodeId: { in: nodeIds } }, { targetNodeId: { in: nodeIds } }],
      },
      take: maxNodes * 2,
    });

    return {
      nodes: serializedNodes,
      edges: edges.map(serializeEdge),
      relevantNodes: serializedNodes,
    };
  }

  // Graph traversal: expand from seed nodes
  const visited = new Set<string>(seedNodes.map((n) => n.id));
  const allRelevantNodes = [...seedNodes];

  let currentHopNodes = seedNodes;
  for (let hop = 0; hop < maxHops && allRelevantNodes.length < maxNodes * 2; hop++) {
    const nodeIds = currentHopNodes.map((n) => n.id);
    const connectedEdges = await db.memoryEdge.findMany({
      where: {
        userId,
        OR: [
          { sourceNodeId: { in: nodeIds } },
          { targetNodeId: { in: nodeIds } },
        ],
      },
      orderBy: { weight: 'desc' },
      take: 50,
    });

    const newNodeIds = new Set<string>();
    for (const edge of connectedEdges) {
      if (!visited.has(edge.sourceNodeId)) newNodeIds.add(edge.sourceNodeId);
      if (!visited.has(edge.targetNodeId)) newNodeIds.add(edge.targetNodeId);
    }

    if (newNodeIds.size === 0) break;

    const newNodes = await db.memoryNode.findMany({
      where: {
        id: { in: Array.from(newNodeIds) },
        userId,
        isActive: true,
      },
      take: maxNodes,
    });

    for (const node of newNodes) {
      visited.add(node.id);
      allRelevantNodes.push(node);
    }

    currentHopNodes = newNodes;
  }

  // Get all edges between relevant nodes
  const relevantNodeIds = allRelevantNodes.map((n) => n.id);
  const allEdges = await db.memoryEdge.findMany({
    where: {
      userId,
      OR: [
        { sourceNodeId: { in: relevantNodeIds } },
        { targetNodeId: { in: relevantNodeIds } },
      ],
    },
    take: maxNodes * 3,
  });

  // Increment access counts (fire-and-forget)
  for (const nodeId of visited) {
    db.memoryNode.update({
      where: { id: nodeId },
      data: { accessCount: { increment: 1 }, updatedAt: new Date() },
    }).catch(() => {});
  }

  const serializedNodes = allRelevantNodes.map(serializeNode);
  return {
    nodes: serializedNodes,
    edges: allEdges.map(serializeEdge),
    relevantNodes: serializedNodes.slice(0, maxNodes),
  };
}

// ---------------------------------------------------------------------------
// Core: Learn From Interaction — auto-extract graph elements from conversation
// ---------------------------------------------------------------------------

export async function learnFromInteraction(
  userId: string,
  userMessage: string,
  context?: { agentId?: string; conversationId?: string }
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const createdNodes: GraphNode[] = [];
  const createdEdges: GraphEdge[] = [];

  // Extract preferences
  const preferencePatterns = [
    /i (?:prefer|like|love|enjoy)\s+(.+?)(?:\.|,|$)/gi,
    /i (?:don't|dont|do not)\s+(?:like|want|prefer)\s+(.+?)(?:\.|,|$)/gi,
    /(?:my favorite|my preferred)\s+(?:is|are)\s+(.+?)(?:\.|,|$)/gi,
  ];

  for (const pattern of preferencePatterns) {
    let match;
    while ((match = pattern.exec(userMessage)) !== null) {
      const content = match[1].trim();
      if (content.length < 3 || content.length > 200) continue;

      const node = await addNode(userId, {
        type: 'preference',
        label: content.substring(0, 60),
        content: `User prefers: ${content}`,
        metadata: { source: 'interaction', ...context },
        weight: 1.5,
      });
      createdNodes.push(node);
    }
  }

  // Extract topics/technologies
  const topicPatterns = [
    /\b(python|javascript|typescript|react|next\.js|node\.js|rust|go|java|docker|kubernetes|aws|gcp|azure)\b/gi,
  ];

  const foundTopics = new Set<string>();
  for (const pattern of topicPatterns) {
    let match;
    while ((match = pattern.exec(userMessage)) !== null) {
      foundTopics.add(match[1].toLowerCase());
    }
  }

  for (const topic of foundTopics) {
    const node = await addNode(userId, {
      type: 'topic',
      label: topic,
      content: `User discusses: ${topic}`,
      metadata: { source: 'interaction', ...context },
    });
    createdNodes.push(node);
  }

  // Create edges between preferences and topics
  const preferenceNodes = createdNodes.filter((n) => n.type === 'preference');
  const topicNodes = createdNodes.filter((n) => n.type === 'topic');

  for (const pref of preferenceNodes) {
    for (const topic of topicNodes) {
      try {
        const edge = await addEdge(userId, {
          sourceNodeId: pref.id,
          targetNodeId: topic.id,
          relation: 'related_to',
          weight: 0.8,
          metadata: { source: 'auto_extracted' },
        });
        createdEdges.push(edge);
      } catch {
        // Edge may already exist, skip
      }
    }
  }

  return { nodes: createdNodes, edges: createdEdges };
}

// ---------------------------------------------------------------------------
// Core: Delete Node (and its edges)
// ---------------------------------------------------------------------------

export async function deleteNode(userId: string, nodeId: string): Promise<boolean> {
  const node = await db.memoryNode.findFirst({ where: { id: nodeId, userId } });
  if (!node) return false;

  // Delete associated edges first
  await db.memoryEdge.deleteMany({
    where: {
      OR: [{ sourceNodeId: nodeId }, { targetNodeId: nodeId }],
    },
  });

  await db.memoryNode.delete({ where: { id: nodeId } });
  return true;
}

// ---------------------------------------------------------------------------
// Core: Delete Edge
// ---------------------------------------------------------------------------

export async function deleteEdge(userId: string, edgeId: string): Promise<boolean> {
  const edge = await db.memoryEdge.findFirst({ where: { id: edgeId, userId } });
  if (!edge) return false;

  await db.memoryEdge.delete({ where: { id: edgeId } });
  return true;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function getGraphStats(userId: string): Promise<{
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  edgesByRelation: Record<string, number>;
  topNodes: GraphNode[];
}> {
  const [nodes, edges] = await Promise.all([
    db.memoryNode.findMany({ where: { userId, isActive: true }, orderBy: { weight: 'desc' } }),
    db.memoryEdge.findMany({ where: { userId } }),
  ]);

  const nodesByType: Record<string, number> = {};
  for (const node of nodes) {
    nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
  }

  const edgesByRelation: Record<string, number> = {};
  for (const edge of edges) {
    edgesByRelation[edge.relation] = (edgesByRelation[edge.relation] || 0) + 1;
  }

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    nodesByType,
    edgesByRelation,
    topNodes: nodes.slice(0, 10).map(serializeNode),
  };
}
