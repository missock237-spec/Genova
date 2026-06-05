/**
 * Agent Scheduler Engine — Autonomous Scheduled Agent System
 *
 * Cron-based task scheduling for agents with support for:
 * - One-time execution
 * - Recurring (cron) schedules
 * - Interval-based execution
 * - Auto-retry with exponential backoff
 * - Execution history tracking
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('agent-scheduler');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScheduleType = 'one-time' | 'cron' | 'interval';
export type TaskStatus = 'active' | 'paused' | 'disabled' | 'error';
export type AgentAction = 'run_task' | 'monitor_web' | 'auto_report' | 'send_notification' | 'custom';

export interface ScheduleTaskInput {
  userId: string;
  agentId?: string;
  name: string;
  description?: string;
  schedule: string;
  timezone?: string;
  scheduleType?: ScheduleType;
  action: AgentAction;
  payload?: Record<string, unknown>;
}

export interface ScheduleUpdateInput {
  name?: string;
  description?: string;
  schedule?: string;
  timezone?: string;
  status?: TaskStatus;
  payload?: Record<string, unknown>;
}

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
  tokensUsed?: number;
}

// ---------------------------------------------------------------------------
// Cron Expression Parser (lightweight — no external dependency)
// ---------------------------------------------------------------------------

/**
 * Parse a cron expression and compute the next run time.
 * Supports: minute hour day-of-month month day-of-week
 * Example: "0 9 * * 1-5" → every weekday at 9:00 AM
 */
export function getNextRunTime(cronExpression: string, timezone: string = 'UTC'): Date {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: "${cronExpression}". Expected 5 fields.`);
  }

  const [minuteField, hourField, domField, monthField, dowField] = parts;

  // Parse each field into a set of valid values
  const minutes = parseCronField(minuteField, 0, 59);
  const hours = parseCronField(hourField, 0, 23);
  const doms = parseCronField(domField, 1, 31);
  const months = parseCronField(monthField, 1, 12);
  const dows = parseCronField(dowField, 0, 6);

  // Start searching from 1 minute in the future
  const now = new Date();
  const candidate = new Date(now.getTime() + 60000);
  candidate.setSeconds(0, 0);

  // Search forward for the next matching time (max 2 years)
  const maxIterations = 525600; // ~1 year in minutes
  for (let i = 0; i < maxIterations; i++) {
    const m = candidate.getMinutes();
    const h = candidate.getHours();
    const d = candidate.getDate();
    const mo = candidate.getMonth() + 1; // JS months are 0-indexed
    const dow = candidate.getDay();

    if (
      minutes.has(m) &&
      hours.has(h) &&
      doms.has(d) &&
      months.has(mo) &&
      dows.has(dow)
    ) {
      return new Date(candidate.getTime());
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  // Fallback: 24 hours from now
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

function parseCronField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  // Handle */n (step)
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step <= 0) return values;
    for (let i = min; i <= max; i += step) {
      values.add(i);
    }
    return values;
  }

  // Handle * (wildcard)
  if (field === '*') {
    for (let i = min; i <= max; i++) {
      values.add(i);
    }
    return values;
  }

  // Handle comma-separated values and ranges
  const segments = field.split(',');
  for (const segment of segments) {
    if (segment.includes('-')) {
      const [rangeStart, rangeEnd] = segment.split('-').map(Number);
      if (!isNaN(rangeStart) && !isNaN(rangeEnd)) {
        for (let i = rangeStart; i <= rangeEnd; i++) {
          if (i >= min && i <= max) values.add(i);
        }
      }
    } else if (segment.includes('/')) {
      const [base, step] = segment.split('/');
      const stepNum = parseInt(step, 10);
      if (isNaN(stepNum) || stepNum <= 0) continue;
      const start = base === '*' ? min : parseInt(base, 10);
      if (isNaN(start)) continue;
      for (let i = start; i <= max; i += stepNum) {
        if (i >= min) values.add(i);
      }
    } else {
      const val = parseInt(segment, 10);
      if (!isNaN(val) && val >= min && val <= max) {
        values.add(val);
      }
    }
  }

  return values;
}

// ---------------------------------------------------------------------------
// In-Memory Schedule Registry (tracks active timers)
// ---------------------------------------------------------------------------

interface ScheduledTimer {
  taskId: string;
  timer: NodeJS.Timeout;
  nextRun: Date;
}

const scheduleRegistry = new Map<string, ScheduledTimer>();

// ---------------------------------------------------------------------------
// Core Methods
// ---------------------------------------------------------------------------

/**
 * Schedule a new task
 */
export async function scheduleTask(input: ScheduleTaskInput): Promise<{
  id: string;
  nextRun: Date;
}> {
  const nextRun = getNextRunTime(input.schedule, input.timezone);

  const task = await db.scheduledTask.create({
    data: {
      userId: input.userId,
      agentId: input.agentId || null,
      name: input.name,
      description: input.description || '',
      schedule: input.schedule,
      timezone: input.timezone || 'UTC',
      status: 'active',
      nextRun,
      payload: JSON.stringify({
        action: input.action,
        scheduleType: input.scheduleType || 'cron',
        ...input.payload,
      }),
    },
  });

  // Register in-memory timer
  registerTimer(task.id, nextRun, input.userId);

  log.info('Task scheduled', {
    taskId: task.id,
    name: input.name,
    schedule: input.schedule,
    nextRun: nextRun.toISOString(),
  });

  return { id: task.id, nextRun };
}

/**
 * Cancel a scheduled task
 */
export async function cancelTask(taskId: string, userId: string): Promise<boolean> {
  const task = await db.scheduledTask.findUnique({
    where: { id: taskId },
    select: { userId: true },
  });

  if (!task || task.userId !== userId) {
    return false;
  }

  // Remove in-memory timer
  unregisterTimer(taskId);

  await db.scheduledTask.update({
    where: { id: taskId },
    data: { status: 'disabled' },
  });

  log.info('Task cancelled', { taskId });
  return true;
}

/**
 * Update a schedule
 */
export async function updateSchedule(
  taskId: string,
  userId: string,
  input: ScheduleUpdateInput
): Promise<{
  id: string;
  nextRun?: Date;
} | null> {
  const task = await db.scheduledTask.findUnique({
    where: { id: taskId },
    select: { userId: true },
  });

  if (!task || task.userId !== userId) {
    return null;
  }

  const updateData: Record<string, unknown> = {};

  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.schedule !== undefined) {
    updateData.schedule = input.schedule;
    updateData.nextRun = getNextRunTime(input.schedule, input.timezone || 'UTC');
  }
  if (input.timezone !== undefined) updateData.timezone = input.timezone;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.payload !== undefined) {
    const existing = await db.scheduledTask.findUnique({
      where: { id: taskId },
      select: { payload: true },
    });
    const existingPayload = JSON.parse(existing?.payload || '{}');
    updateData.payload = JSON.stringify({ ...existingPayload, ...input.payload });
  }

  const updated = await db.scheduledTask.update({
    where: { id: taskId },
    data: updateData,
  });

  // Re-register timer if schedule changed or reactivated
  if (input.schedule !== undefined || input.status === 'active') {
    unregisterTimer(taskId);
    if (updated.status === 'active' && updated.nextRun) {
      registerTimer(taskId, new Date(updated.nextRun), userId);
    }
  } else if (input.status === 'paused' || input.status === 'disabled') {
    unregisterTimer(taskId);
  }

  log.info('Schedule updated', { taskId, updates: Object.keys(updateData) });

  return {
    id: updated.id,
    nextRun: updated.nextRun ? new Date(updated.nextRun) : undefined,
  };
}

/**
 * Get upcoming tasks for a user
 */
export async function getUpcomingTasks(
  userId: string,
  options?: { limit?: number; status?: TaskStatus }
): Promise<Array<{
  id: string;
  name: string;
  schedule: string;
  status: string;
  nextRun: Date | null;
  lastRun: Date | null;
  runCount: number;
  failureCount: number;
  agentId: string | null;
  payload: string;
}>> {
  const where: Record<string, unknown> = { userId };
  if (options?.status) where.status = options.status;

  const tasks = await db.scheduledTask.findMany({
    where,
    orderBy: { nextRun: 'asc' },
    take: options?.limit || 50,
  });

  return tasks;
}

/**
 * Execute a scheduled task (called by timer or manually)
 */
export async function executeScheduledTask(taskId: string): Promise<ExecutionResult> {
  const startTime = Date.now();

  const task = await db.scheduledTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return { success: false, error: 'Task not found', durationMs: Date.now() - startTime };
  }

  const payload = JSON.parse(task.payload || '{}');
  const maxRetries = 3;
  let lastError: string | null = null;
  let attempt = 0;

  for (attempt = 0; attempt < maxRetries; attempt++) {
    try {
      let result: string;

      switch (payload.action as AgentAction) {
        case 'run_task': {
          result = await executeAgentTask(task.userId, task.agentId, payload);
          break;
        }
        case 'monitor_web': {
          const { checkForChanges } = await import('./web-monitor');
          const monitorResult = await checkForChanges(task.userId, payload);
          result = JSON.stringify(monitorResult);
          break;
        }
        case 'auto_report': {
          const { generateReport } = await import('./auto-reporter');
          const reportResult = await generateReport(task.userId, payload);
          result = JSON.stringify(reportResult);
          break;
        }
        case 'send_notification': {
          result = await executeNotification(task.userId, payload);
          break;
        }
        default: {
          result = JSON.stringify({ message: 'Custom action executed', payload });
        }
      }

      // Success — update task record
      const nextRun = getNextRunTime(task.schedule, task.timezone);

      await db.scheduledTask.update({
        where: { id: taskId },
        data: {
          lastRun: new Date(),
          nextRun,
          runCount: { increment: 1 },
          result: result,
          lastError: null,
        },
      });

      // Re-register timer for next run
      unregisterTimer(taskId);
      registerTimer(taskId, nextRun, task.userId);

      log.info('Task executed successfully', {
        taskId,
        action: payload.action,
        attempt: attempt + 1,
        durationMs: Date.now() - startTime,
      });

      return {
        success: true,
        output: result,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);

      // Exponential backoff
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  // All retries exhausted
  const nextRun = getNextRunTime(task.schedule, task.timezone);

  await db.scheduledTask.update({
    where: { id: taskId },
    data: {
      lastRun: new Date(),
      nextRun,
      failureCount: { increment: 1 },
      lastError,
      result: JSON.stringify({ error: lastError, attempts: attempt }),
    },
  });

  // Re-register timer for next run even on failure
  unregisterTimer(taskId);
  registerTimer(taskId, nextRun, task.userId);

  log.error('Task execution failed after retries', {
    taskId,
    error: lastError,
    attempts: attempt,
  });

  return {
    success: false,
    error: lastError || 'Unknown error',
    durationMs: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Action Executors
// ---------------------------------------------------------------------------

async function executeAgentTask(
  userId: string,
  agentId: string | null,
  payload: Record<string, unknown>
): Promise<string> {
  if (!agentId) {
    return JSON.stringify({ message: 'No agent specified, task payload processed', payload });
  }

  // Verify agent exists and belongs to user
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, status: true, userId: true },
  });

  if (!agent || agent.userId !== userId) {
    throw new Error(`Agent not found or access denied: ${agentId}`);
  }

  // Record agent usage
  await db.agentUsage.create({
    data: {
      agentId,
      userId,
      action: 'scheduled_task',
      tokensUsed: 0,
      duration: 0,
      status: 'success',
      metadata: JSON.stringify({ scheduledTask: true, payload }),
    },
  });

  return JSON.stringify({
    agentId,
    agentName: agent.name,
    taskExecuted: true,
    timestamp: new Date().toISOString(),
  });
}

async function executeNotification(
  userId: string,
  payload: Record<string, unknown>
): Promise<string> {
  // Create a monitoring event as notification
  await db.monitoringEvent.create({
    data: {
      userId,
      eventType: 'scheduled_notification',
      source: 'agent_scheduler',
      message: (payload.message as string) || 'Scheduled notification triggered',
      details: JSON.stringify(payload),
      severity: 'info',
    },
  });

  return JSON.stringify({
    notificationSent: true,
    type: payload.notificationType || 'dashboard',
    timestamp: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Timer Management
// ---------------------------------------------------------------------------

function registerTimer(taskId: string, nextRun: Date, userId: string): void {
  const now = Date.now();
  const delay = Math.max(nextRun.getTime() - now, 1000); // At least 1 second

  const timer = setTimeout(async () => {
    try {
      await executeScheduledTask(taskId);
    } catch (error) {
      log.error('Timer execution error', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, delay);

  // Prevent Node.js from keeping the process alive just for this timer
  if (timer.unref) timer.unref();

  scheduleRegistry.set(taskId, { taskId, timer, nextRun });
}

function unregisterTimer(taskId: string): void {
  const entry = scheduleRegistry.get(taskId);
  if (entry) {
    clearTimeout(entry.timer);
    scheduleRegistry.delete(taskId);
  }
}

/**
 * Initialize all active tasks on server startup
 */
export async function initializeScheduler(): Promise<void> {
  try {
    const activeTasks = await db.scheduledTask.findMany({
      where: { status: 'active' },
      select: { id: true, nextRun: true, userId: true },
    });

    for (const task of activeTasks) {
      if (task.nextRun) {
        const nextRun = new Date(task.nextRun);
        // Only register if next run is in the future
        if (nextRun.getTime() > Date.now()) {
          registerTimer(task.id, nextRun, task.userId);
        } else {
          // Overdue task — execute immediately and reschedule
          executeScheduledTask(task.id).catch((err) => {
            log.error('Failed to execute overdue task', {
              taskId: task.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      }
    }

    log.info('Scheduler initialized', { activeTaskCount: activeTasks.length });
  } catch (error) {
    log.error('Failed to initialize scheduler', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Get scheduler status and registry info
 */
export function getSchedulerStatus(): {
  activeTimers: number;
  tasks: Array<{ taskId: string; nextRun: Date }>;
} {
  return {
    activeTimers: scheduleRegistry.size,
    tasks: Array.from(scheduleRegistry.values()).map((t) => ({
      taskId: t.taskId,
      nextRun: t.nextRun,
    })),
  };
}
