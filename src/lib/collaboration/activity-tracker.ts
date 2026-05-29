/**
 * Activity Tracker — Track workspace activity, changes, comments
 *
 * Features:
 * - Activity feed with rich event types
 * - Notification tracking (read/unread)
 * - Filter by workspace, user, action type
 */

import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrackActivityOptions {
  workspaceId: string;
  userId: string;
  action: string;
  details?: Record<string, unknown>;
  targetType?: string;
  targetId?: string;
}

export interface ActivityResult {
  id: string;
  workspaceId: string;
  userId: string;
  action: string;
  details: Record<string, unknown>;
  targetType: string | null;
  targetId: string | null;
  isRead: boolean;
  createdAt: Date;
  user?: { name: string; avatar: string | null };
}

export interface NotificationResult {
  id: string;
  workspaceId: string;
  action: string;
  details: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
  workspace?: { name: string; icon: string | null };
  user?: { name: string; avatar: string | null };
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
// Core: Track Activity
// ---------------------------------------------------------------------------

export async function trackActivity(options: TrackActivityOptions): Promise<ActivityResult> {
  const { workspaceId, userId, action, details = {}, targetType, targetId } = options;

  const activity = await db.workspaceActivity.create({
    data: {
      workspaceId,
      userId,
      action,
      details: JSON.stringify(details),
      targetType: targetType || null,
      targetId: targetId || null,
      isRead: false,
    },
    include: { user: { select: { name: true, avatar: true } } },
  });

  return {
    id: activity.id,
    workspaceId: activity.workspaceId,
    userId: activity.userId,
    action: activity.action,
    details: safeParse<Record<string, unknown>>(activity.details, {}),
    targetType: activity.targetType,
    targetId: activity.targetId,
    isRead: activity.isRead,
    createdAt: activity.createdAt,
    user: activity.user ? { name: activity.user.name, avatar: activity.user.avatar } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Core: Get Workspace Activity
// ---------------------------------------------------------------------------

export async function getWorkspaceActivity(
  workspaceId: string,
  userId: string,
  options: {
    page?: number;
    limit?: number;
    actionFilter?: string;
    targetType?: string;
  } = {}
): Promise<{ activities: ActivityResult[]; total: number; page: number; totalPages: number }> {
  const { page = 1, limit = 30, actionFilter, targetType } = options;

  // Verify membership
  const membership = await db.workspaceMember.findFirst({
    where: { workspaceId, userId, status: 'active' },
  });

  if (!membership) throw new Error('Not a member of this workspace');

  const where: Record<string, unknown> = { workspaceId };
  if (actionFilter) where.action = actionFilter;
  if (targetType) where.targetType = targetType;

  const [activities, total] = await Promise.all([
    db.workspaceActivity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { name: true, avatar: true } } },
    }),
    db.workspaceActivity.count({ where }),
  ]);

  return {
    activities: activities.map((a) => ({
      id: a.id,
      workspaceId: a.workspaceId,
      userId: a.userId,
      action: a.action,
      details: safeParse<Record<string, unknown>>(a.details, {}),
      targetType: a.targetType,
      targetId: a.targetId,
      isRead: a.isRead,
      createdAt: a.createdAt,
      user: a.user ? { name: a.user.name, avatar: a.user.avatar } : undefined,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// ---------------------------------------------------------------------------
// Core: Get Notifications (unread activities across all workspaces)
// ---------------------------------------------------------------------------

export async function getNotifications(
  userId: string,
  options: { unreadOnly?: boolean; page?: number; limit?: number } = {}
): Promise<{ notifications: NotificationResult[]; total: number; unreadCount: number }> {
  const { unreadOnly = false, page = 1, limit = 20 } = options;

  // Get user's workspace IDs
  const memberships = await db.workspaceMember.findMany({
    where: { userId, status: 'active' },
    select: { workspaceId: true },
  });

  const workspaceIds = memberships.map((m) => m.workspaceId);

  if (workspaceIds.length === 0) {
    return { notifications: [], total: 0, unreadCount: 0 };
  }

  const where: Record<string, unknown> = {
    workspaceId: { in: workspaceIds },
    userId: { not: userId }, // Don't show own activities as notifications
  };

  if (unreadOnly) where.isRead = false;

  const [activities, total, unreadCount] = await Promise.all([
    db.workspaceActivity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { name: true, avatar: true } },
        workspace: { select: { name: true, icon: true } },
      },
    }),
    db.workspaceActivity.count({ where }),
    db.workspaceActivity.count({
      where: {
        workspaceId: { in: workspaceIds },
        userId: { not: userId },
        isRead: false,
      },
    }),
  ]);

  return {
    notifications: activities.map((a) => ({
      id: a.id,
      workspaceId: a.workspaceId,
      action: a.action,
      details: safeParse<Record<string, unknown>>(a.details, {}),
      isRead: a.isRead,
      createdAt: a.createdAt,
      workspace: a.workspace ? { name: a.workspace.name, icon: a.workspace.icon } : undefined,
      user: a.user ? { name: a.user.name, avatar: a.user.avatar } : undefined,
    })),
    total,
    unreadCount,
  };
}

// ---------------------------------------------------------------------------
// Core: Mark Activities as Read
// ---------------------------------------------------------------------------

export async function markAsRead(
  userId: string,
  options: { activityIds?: string[]; workspaceId?: string; markAll?: boolean } = {}
): Promise<number> {
  const { activityIds, workspaceId, markAll = false } = options;

  if (markAll && workspaceId) {
    const result = await db.workspaceActivity.updateMany({
      where: { workspaceId, isRead: false },
      data: { isRead: true },
    });
    return result.count;
  }

  if (activityIds && activityIds.length > 0) {
    const result = await db.workspaceActivity.updateMany({
      where: { id: { in: activityIds } },
      data: { isRead: true },
    });
    return result.count;
  }

  // Mark all unread notifications as read
  const memberships = await db.workspaceMember.findMany({
    where: { userId, status: 'active' },
    select: { workspaceId: true },
  });

  const workspaceIds = memberships.map((m) => m.workspaceId);

  const result = await db.workspaceActivity.updateMany({
    where: {
      workspaceId: { in: workspaceIds },
      isRead: false,
    },
    data: { isRead: true },
  });

  return result.count;
}
