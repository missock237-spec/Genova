/**
 * Workspace Manager — Create/manage workspaces, invite members, set roles
 *
 * Roles: owner, admin, member, viewer
 * Methods: createWorkspace, inviteMember, updateRole, removeMember
 */

import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface CreateWorkspaceOptions {
  name: string;
  description?: string;
  icon?: string;
  settings?: Record<string, unknown>;
}

export interface InviteMemberOptions {
  workspaceId: string;
  userId: string;
  role?: WorkspaceRole;
  invitedBy: string;
}

export interface WorkspaceResult {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  settings: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  memberCount?: number;
  members?: WorkspaceMemberResult[];
}

export interface WorkspaceMemberResult {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  invitedBy: string | null;
  status: string;
  joinedAt: Date;
  user?: { name: string; email: string; avatar: string | null };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60) + '-' + Math.random().toString(36).substring(2, 8);
}

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Core: Create Workspace
// ---------------------------------------------------------------------------

export async function createWorkspace(
  userId: string,
  options: CreateWorkspaceOptions
): Promise<WorkspaceResult> {
  const slug = generateSlug(options.name);

  const workspace = await db.workspace.create({
    data: {
      name: options.name,
      slug,
      description: options.description || '',
      icon: options.icon || null,
      settings: JSON.stringify(options.settings || {}),
    },
  });

  // Add creator as owner
  await db.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId,
      role: 'owner',
      invitedBy: null,
      status: 'active',
    },
  });

  // Track activity
  await trackWorkspaceActivity(workspace.id, userId, 'workspace_created', {
    workspaceName: options.name,
  });

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description,
    icon: workspace.icon,
    settings: safeParse<Record<string, unknown>>(workspace.settings, {}),
    isActive: workspace.isActive,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    memberCount: 1,
  };
}

// ---------------------------------------------------------------------------
// Core: Get Workspace
// ---------------------------------------------------------------------------

export async function getWorkspace(
  workspaceId: string,
  userId: string
): Promise<WorkspaceResult | null> {
  // Verify user is a member
  const membership = await db.workspaceMember.findFirst({
    where: { workspaceId, userId, status: 'active' },
  });

  if (!membership) return null;

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: {
        where: { status: 'active' },
        include: { user: { select: { name: true, email: true, avatar: true } } },
        orderBy: { joinedAt: 'asc' },
      },
      _count: { select: { members: true, sharedAgents: true } },
    },
  });

  if (!workspace) return null;

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description,
    icon: workspace.icon,
    settings: safeParse<Record<string, unknown>>(workspace.settings, {}),
    isActive: workspace.isActive,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    memberCount: workspace._count.members,
    members: workspace.members.map((m) => ({
      id: m.id,
      workspaceId: m.workspaceId,
      userId: m.userId,
      role: m.role,
      invitedBy: m.invitedBy,
      status: m.status,
      joinedAt: m.joinedAt,
      user: m.user ? { name: m.user.name, email: m.user.email, avatar: m.user.avatar } : undefined,
    })),
  };
}

// ---------------------------------------------------------------------------
// Core: List User's Workspaces
// ---------------------------------------------------------------------------

export async function listUserWorkspaces(userId: string): Promise<WorkspaceResult[]> {
  const memberships = await db.workspaceMember.findMany({
    where: { userId, status: 'active' },
    select: { workspaceId: true },
  });

  const workspaceIds = memberships.map((m) => m.workspaceId);

  const workspaces = await db.workspace.findMany({
    where: { id: { in: workspaceIds }, isActive: true },
    include: { _count: { select: { members: true, sharedAgents: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    description: w.description,
    icon: w.icon,
    settings: safeParse<Record<string, unknown>>(w.settings, {}),
    isActive: w.isActive,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    memberCount: w._count.members,
  }));
}

// ---------------------------------------------------------------------------
// Core: Update Workspace
// ---------------------------------------------------------------------------

export async function updateWorkspace(
  workspaceId: string,
  userId: string,
  updates: { name?: string; description?: string; icon?: string; settings?: Record<string, unknown> }
): Promise<WorkspaceResult> {
  // Verify admin/owner role
  await requireWorkspaceRole(workspaceId, userId, 'admin');

  const data: Record<string, unknown> = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.icon !== undefined) data.icon = updates.icon;
  if (updates.settings !== undefined) data.settings = JSON.stringify(updates.settings);

  const workspace = await db.workspace.update({
    where: { id: workspaceId },
    data,
  });

  await trackWorkspaceActivity(workspaceId, userId, 'workspace_updated', updates);

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description,
    icon: workspace.icon,
    settings: safeParse<Record<string, unknown>>(workspace.settings, {}),
    isActive: workspace.isActive,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Core: Delete Workspace
// ---------------------------------------------------------------------------

export async function deleteWorkspace(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  // Only owner can delete
  await requireWorkspaceRole(workspaceId, userId, 'owner');

  await db.workspace.update({
    where: { id: workspaceId },
    data: { isActive: false },
  });

  return true;
}

// ---------------------------------------------------------------------------
// Core: Invite Member
// ---------------------------------------------------------------------------

export async function inviteMember(options: InviteMemberOptions): Promise<WorkspaceMemberResult> {
  const { workspaceId, userId, role = 'member', invitedBy } = options;

  // Verify inviter has admin role
  await requireWorkspaceRole(workspaceId, invitedBy, 'admin');

  // Check if already a member
  const existing = await db.workspaceMember.findFirst({
    where: { workspaceId, userId },
  });

  if (existing) {
    // Reactivate if suspended, or update role
    const updated = await db.workspaceMember.update({
      where: { id: existing.id },
      data: { role, status: 'active', invitedBy },
      include: { user: { select: { name: true, email: true, avatar: true } } },
    });

    await trackWorkspaceActivity(workspaceId, invitedBy, 'member_role_updated', {
      targetUserId: userId,
      newRole: role,
    });

    return {
      id: updated.id,
      workspaceId: updated.workspaceId,
      userId: updated.userId,
      role: updated.role,
      invitedBy: updated.invitedBy,
      status: updated.status,
      joinedAt: updated.joinedAt,
      user: updated.user ? { name: updated.user.name, email: updated.user.email, avatar: updated.user.avatar } : undefined,
    };
  }

  const member = await db.workspaceMember.create({
    data: {
      workspaceId,
      userId,
      role,
      invitedBy,
      status: 'active',
    },
    include: { user: { select: { name: true, email: true, avatar: true } } },
  });

  await trackWorkspaceActivity(workspaceId, invitedBy, 'member_joined', {
    targetUserId: userId,
    role,
  });

  return {
    id: member.id,
    workspaceId: member.workspaceId,
    userId: member.userId,
    role: member.role,
    invitedBy: member.invitedBy,
    status: member.status,
    joinedAt: member.joinedAt,
    user: member.user ? { name: member.user.name, email: member.user.email, avatar: member.user.avatar } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Core: Update Role
// ---------------------------------------------------------------------------

export async function updateRole(
  workspaceId: string,
  targetUserId: string,
  newRole: WorkspaceRole,
  actingUserId: string
): Promise<WorkspaceMemberResult> {
  await requireWorkspaceRole(workspaceId, actingUserId, 'admin');

  // Can't demote an owner
  const target = await db.workspaceMember.findFirst({
    where: { workspaceId, userId: targetUserId, status: 'active' },
  });

  if (!target) throw new Error('Member not found');
  if (target.role === 'owner' && newRole !== 'owner') {
    throw new Error('Cannot demote workspace owner');
  }

  const updated = await db.workspaceMember.update({
    where: { id: target.id },
    data: { role: newRole },
    include: { user: { select: { name: true, email: true, avatar: true } } },
  });

  await trackWorkspaceActivity(workspaceId, actingUserId, 'member_role_updated', {
    targetUserId,
    newRole,
  });

  return {
    id: updated.id,
    workspaceId: updated.workspaceId,
    userId: updated.userId,
    role: updated.role,
    invitedBy: updated.invitedBy,
    status: updated.status,
    joinedAt: updated.joinedAt,
    user: updated.user ? { name: updated.user.name, email: updated.user.email, avatar: updated.user.avatar } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Core: Remove Member
// ---------------------------------------------------------------------------

export async function removeMember(
  workspaceId: string,
  targetUserId: string,
  actingUserId: string
): Promise<boolean> {
  await requireWorkspaceRole(workspaceId, actingUserId, 'admin');

  const target = await db.workspaceMember.findFirst({
    where: { workspaceId, userId: targetUserId, status: 'active' },
  });

  if (!target) return false;
  if (target.role === 'owner') throw new Error('Cannot remove workspace owner');

  await db.workspaceMember.update({
    where: { id: target.id },
    data: { status: 'suspended' },
  });

  await trackWorkspaceActivity(workspaceId, actingUserId, 'member_removed', {
    targetUserId,
  });

  return true;
}

// ---------------------------------------------------------------------------
// Internal: Role check helper
// ---------------------------------------------------------------------------

async function requireWorkspaceRole(
  workspaceId: string,
  userId: string,
  minRole: 'owner' | 'admin'
): Promise<void> {
  const membership = await db.workspaceMember.findFirst({
    where: { workspaceId, userId, status: 'active' },
  });

  if (!membership) throw new Error('Not a member of this workspace');

  const roleHierarchy: Record<string, number> = { owner: 3, admin: 2, member: 1, viewer: 0 };
  const userLevel = roleHierarchy[membership.role] || 0;
  const requiredLevel = roleHierarchy[minRole] || 0;

  if (userLevel < requiredLevel) {
    throw new Error(`Requires ${minRole} role or higher`);
  }
}

// ---------------------------------------------------------------------------
// Internal: Track workspace activity
// ---------------------------------------------------------------------------

async function trackWorkspaceActivity(
  workspaceId: string,
  userId: string,
  action: string,
  details: Record<string, unknown>
): Promise<void> {
  await db.workspaceActivity.create({
    data: {
      workspaceId,
      userId,
      action,
      details: JSON.stringify(details),
    },
  }).catch(() => {
    // Non-critical: don't fail main operations if activity tracking fails
  });
}

// Re-export for use in other modules
export { trackWorkspaceActivity };
