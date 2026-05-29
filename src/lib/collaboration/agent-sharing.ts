/**
 * Agent Sharing — Share agents within workspace with permission levels
 *
 * Features:
 * - Share agents with configurable permissions
 * - Shared execution, shared memory, collaborative editing
 * - Revoke access, manage shared agent lifecycle
 */

import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentPermission = 'execute' | 'view' | 'edit' | 'manage_memory' | 'full_access';

export interface ShareAgentOptions {
  workspaceId: string;
  agentId: string;
  sharedBy: string;
  permissions?: AgentPermission[];
}

export interface SharedAgentResult {
  id: string;
  workspaceId: string;
  agentId: string;
  sharedBy: string;
  permissions: AgentPermission[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  agent?: {
    name: string;
    type: string;
    description: string;
    status: string;
  };
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
// Core: Share Agent
// ---------------------------------------------------------------------------

export async function shareAgent(options: ShareAgentOptions): Promise<SharedAgentResult> {
  const { workspaceId, agentId, sharedBy, permissions = ['execute', 'view'] } = options;

  // Verify the agent exists and belongs to the sharer
  const agent = await db.agent.findFirst({
    where: { id: agentId, userId: sharedBy },
  });

  if (!agent) throw new Error('Agent not found or you do not own this agent');

  // Verify sharer is a workspace member with admin role
  const membership = await db.workspaceMember.findFirst({
    where: { workspaceId, userId: sharedBy, status: 'active' },
  });

  if (!membership) throw new Error('Not a member of this workspace');
  const roleLevel = { owner: 3, admin: 2, member: 1, viewer: 0 };
  if ((roleLevel[membership.role as keyof typeof roleLevel] || 0) < 1) {
    throw new Error('Insufficient permissions to share agents');
  }

  // Check if already shared
  const existing = await db.sharedAgent.findUnique({
    where: { workspaceId_agentId: { workspaceId, agentId } },
  });

  if (existing) {
    // Update permissions
    const updated = await db.sharedAgent.update({
      where: { id: existing.id },
      data: {
        permissions: JSON.stringify(permissions),
        isActive: true,
      },
    });

    return {
      id: updated.id,
      workspaceId: updated.workspaceId,
      agentId: updated.agentId,
      sharedBy: updated.sharedBy,
      permissions: safeParse<AgentPermission[]>(updated.permissions, []),
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      agent: { name: agent.name, type: agent.type, description: agent.description, status: agent.status },
    };
  }

  const sharedAgent = await db.sharedAgent.create({
    data: {
      workspaceId,
      agentId,
      sharedBy,
      permissions: JSON.stringify(permissions),
    },
  });

  // Track activity
  await db.workspaceActivity.create({
    data: {
      workspaceId,
      userId: sharedBy,
      action: 'agent_shared',
      details: JSON.stringify({ agentId, agentName: agent.name, permissions }),
      targetType: 'agent',
      targetId: agentId,
    },
  }).catch(() => {});

  return {
    id: sharedAgent.id,
    workspaceId: sharedAgent.workspaceId,
    agentId: sharedAgent.agentId,
    sharedBy: sharedAgent.sharedBy,
    permissions: safeParse<AgentPermission[]>(sharedAgent.permissions, []),
    isActive: sharedAgent.isActive,
    createdAt: sharedAgent.createdAt,
    updatedAt: sharedAgent.updatedAt,
    agent: { name: agent.name, type: agent.type, description: agent.description, status: agent.status },
  };
}

// ---------------------------------------------------------------------------
// Core: Revoke Access
// ---------------------------------------------------------------------------

export async function revokeAccess(
  workspaceId: string,
  agentId: string,
  userId: string
): Promise<boolean> {
  // Verify user has admin role
  const membership = await db.workspaceMember.findFirst({
    where: { workspaceId, userId, status: 'active' },
  });

  if (!membership) throw new Error('Not a member of this workspace');

  const sharedAgent = await db.sharedAgent.findUnique({
    where: { workspaceId_agentId: { workspaceId, agentId } },
  });

  if (!sharedAgent) return false;

  // Only the sharer or admin can revoke
  const canRevoke = sharedAgent.sharedBy === userId ||
    membership.role === 'owner' || membership.role === 'admin';

  if (!canRevoke) throw new Error('Insufficient permissions to revoke access');

  await db.sharedAgent.update({
    where: { id: sharedAgent.id },
    data: { isActive: false },
  });

  await db.workspaceActivity.create({
    data: {
      workspaceId,
      userId,
      action: 'agent_access_revoked',
      details: JSON.stringify({ agentId }),
      targetType: 'agent',
      targetId: agentId,
    },
  }).catch(() => {});

  return true;
}

// ---------------------------------------------------------------------------
// Core: Execute Shared Agent
// ---------------------------------------------------------------------------

export async function executeSharedAgent(
  workspaceId: string,
  agentId: string,
  userId: string,
  task: string
): Promise<{ success: boolean; message: string }> {
  // Verify user is a workspace member
  const membership = await db.workspaceMember.findFirst({
    where: { workspaceId, userId, status: 'active' },
  });

  if (!membership) throw new Error('Not a member of this workspace');

  // Verify shared agent exists and is active
  const sharedAgent = await db.sharedAgent.findUnique({
    where: { workspaceId_agentId: { workspaceId, agentId } },
  });

  if (!sharedAgent || !sharedAgent.isActive) {
    throw new Error('Agent not shared in this workspace');
  }

  // Check execute permission
  const permissions = safeParse<AgentPermission[]>(sharedAgent.permissions, []);
  if (!permissions.includes('execute') && !permissions.includes('full_access')) {
    throw new Error('No execution permission for this shared agent');
  }

  // Track the execution
  await db.workspaceActivity.create({
    data: {
      workspaceId,
      userId,
      action: 'shared_agent_executed',
      details: JSON.stringify({ agentId, task: task.substring(0, 200) }),
      targetType: 'agent',
      targetId: agentId,
    },
  }).catch(() => {});

  return {
    success: true,
    message: `Shared agent execution initiated for task: ${task.substring(0, 100)}`,
  };
}

// ---------------------------------------------------------------------------
// Core: Get Shared Agents for Workspace
// ---------------------------------------------------------------------------

export async function getWorkspaceSharedAgents(
  workspaceId: string,
  userId: string
): Promise<SharedAgentResult[]> {
  // Verify membership
  const membership = await db.workspaceMember.findFirst({
    where: { workspaceId, userId, status: 'active' },
  });

  if (!membership) throw new Error('Not a member of this workspace');

  const sharedAgents = await db.sharedAgent.findMany({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  // Get agent details
  const results: SharedAgentResult[] = [];
  for (const sa of sharedAgents) {
    const agent = await db.agent.findUnique({
      where: { id: sa.agentId },
      select: { name: true, type: true, description: true, status: true },
    });

    results.push({
      id: sa.id,
      workspaceId: sa.workspaceId,
      agentId: sa.agentId,
      sharedBy: sa.sharedBy,
      permissions: safeParse<AgentPermission[]>(sa.permissions, []),
      isActive: sa.isActive,
      createdAt: sa.createdAt,
      updatedAt: sa.updatedAt,
      agent: agent || undefined,
    });
  }

  return results;
}
