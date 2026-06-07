/**
 * Web Monitoring System — Autonomous Web Change Detection
 *
 * Monitor websites for changes (price, content, availability),
 * RSS feed monitoring, competitor tracking, and keyword alerts.
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('web-monitor');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MonitorType = 'price' | 'content' | 'availability' | 'rss' | 'competitor' | 'keyword';

export interface CreateMonitorInput {
  userId: string;
  name: string;
  url: string;
  monitorType: MonitorType;
  keywords?: string[];
  cssSelector?: string;
  checkInterval?: string; // Cron expression
  alertOn?: 'any_change' | 'price_drop' | 'keyword_match' | 'availability';
  threshold?: number;
  agentId?: string;
}

export interface MonitorResult {
  monitorId: string;
  url: string;
  changed: boolean;
  changeType?: string;
  previousValue?: string;
  currentValue?: string;
  timestamp: string;
}

export interface ChangeReport {
  monitorName: string;
  url: string;
  changes: Array<{
    field: string;
    previous: string;
    current: string;
    detectedAt: string;
  }>;
  summary: string;
  severity: 'info' | 'warning' | 'critical';
}

// ---------------------------------------------------------------------------
// In-Memory Monitor State (stores last known values for diff detection)
// ---------------------------------------------------------------------------

interface MonitorState {
  lastContent: string;
  lastChecked: Date;
  lastHash: string;
  checkCount: number;
}

const monitorStateStore = new Map<string, MonitorState>();

// ---------------------------------------------------------------------------
// Core Methods
// ---------------------------------------------------------------------------

/**
 * Create a new web monitor (stored as a ScheduledTask with web-monitor payload)
 */
export async function createMonitor(input: CreateMonitorInput): Promise<{
  id: string;
  nextRun: Date;
}> {
  const cronSchedule = input.checkInterval || '0 */6 * * *'; // Default: every 6 hours

  const payload = {
    action: 'monitor_web' as const,
    scheduleType: 'cron',
    monitorType: input.monitorType,
    url: input.url,
    name: input.name,
    keywords: input.keywords || [],
    cssSelector: input.cssSelector,
    alertOn: input.alertOn || 'any_change',
    threshold: input.threshold,
    agentId: input.agentId,
  };

  const { scheduleTask } = await import('./agent-scheduler');

  const result = await scheduleTask({
    userId: input.userId,
    agentId: input.agentId,
    name: `[Monitor] ${input.name}`,
    description: `Web monitor: ${input.monitorType} for ${input.url}`,
    schedule: cronSchedule,
    action: 'monitor_web',
    payload,
  });

  log.info('Web monitor created', {
    monitorId: result.id,
    type: input.monitorType,
    url: input.url,
  });

  return result;
}

/**
 * Check a URL for changes
 */
export async function checkForChanges(
  userId: string,
  payload: Record<string, unknown>
): Promise<MonitorResult> {
  const url = payload.url as string;
  const monitorType = payload.monitorType as MonitorType;
  const monitorId = payload.monitorId as string || 'unknown';
  const keywords = (payload.keywords as string[]) || [];
  const cssSelector = payload.cssSelector as string | undefined;

  // Fetch current content
  const currentContent = await fetchWebContent(url, cssSelector);
  const currentHash = hashContent(currentContent);

  // Get previous state
  const stateKey = `${userId}:${monitorId}`;
  const previousState = monitorStateStore.get(stateKey);

  let changed = false;
  let changeType: string | undefined;
  let previousValue: string | undefined;
  let currentValue: string | undefined;

  if (previousState) {
    if (previousState.lastHash !== currentHash) {
      changed = true;
      changeType = detectChangeType(monitorType, previousState.lastContent, currentContent, keywords);

      previousValue = previousState.lastContent.substring(0, 500);
      currentValue = currentContent.substring(0, 500);

      // Record monitoring event
      await db.monitoringEvent.create({
        data: {
          userId,
          eventType: `web_change_${changeType}`,
          source: 'web_monitor',
          message: `Change detected on ${url}`,
          details: JSON.stringify({
            url,
            monitorType,
            changeType,
            previousHash: previousState.lastHash,
            currentHash,
          }),
          severity: changeType === 'price_drop' ? 'critical' : 'info',
        },
      });
    }
  } else {
    // First check — no previous state
    previousValue = '(first check)';
    currentValue = currentContent.substring(0, 500);
  }

  // Update state
  monitorStateStore.set(stateKey, {
    lastContent: currentContent,
    lastChecked: new Date(),
    lastHash: currentHash,
    checkCount: (previousState?.checkCount || 0) + 1,
  });

  log.info('Web check completed', {
    url,
    monitorType,
    changed,
    changeType,
  });

  return {
    monitorId,
    url,
    changed,
    changeType,
    previousValue,
    currentValue,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Detect specific changes in content
 */
export function detectChanges(
  previousContent: string,
  currentContent: string,
  monitorType: MonitorType,
  keywords: string[] = []
): ChangeReport {
  const changes: ChangeReport['changes'] = [];

  // General content change
  if (previousContent !== currentContent) {
    changes.push({
      field: 'content',
      previous: previousContent.substring(0, 200),
      current: currentContent.substring(0, 200),
      detectedAt: new Date().toISOString(),
    });
  }

  // Price-specific detection
  if (monitorType === 'price') {
    const prevPrices = extractPrices(previousContent);
    const currPrices = extractPrices(currentContent);

    for (let i = 0; i < currPrices.length; i++) {
      if (i < prevPrices.length && currPrices[i] !== prevPrices[i]) {
        changes.push({
          field: `price_${i}`,
          previous: prevPrices[i],
          current: currPrices[i],
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  // Keyword matching
  if (keywords.length > 0) {
    for (const keyword of keywords) {
      const wasPresent = previousContent.toLowerCase().includes(keyword.toLowerCase());
      const isPresent = currentContent.toLowerCase().includes(keyword.toLowerCase());
      if (isPresent && !wasPresent) {
        changes.push({
          field: 'keyword',
          previous: `keyword "${keyword}" not found`,
          current: `keyword "${keyword}" found`,
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  // Determine severity
  const hasPriceDrop = changes.some(
    (c) => c.field.startsWith('price') && parseFloat(c.current) < parseFloat(c.previous)
  );

  const severity: ChangeReport['severity'] = hasPriceDrop
    ? 'critical'
    : changes.length > 0
      ? 'warning'
      : 'info';

  return {
    monitorName: 'Web Monitor',
    url: '',
    changes,
    summary: changes.length > 0
      ? `${changes.length} change(s) detected`
      : 'No changes detected',
    severity,
  };
}

/**
 * Generate a monitoring report for a user
 */
export async function generateReport(
  userId: string,
  options?: {
    monitorType?: MonitorType;
    since?: Date;
  }
): Promise<{
  totalMonitors: number;
  changesDetected: number;
  recentChanges: Array<{
    url: string;
    changeType: string;
    timestamp: string;
    severity: string;
  }>;
}> {
  const since = options?.since || new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totalTasks, recentEvents] = await Promise.all([
    db.scheduledTask.count({
      where: {
        userId,
        status: 'active',
        payload: { contains: 'monitor_web' },
      },
    }),
    db.monitoringEvent.findMany({
      where: {
        userId,
        source: 'web_monitor',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  return {
    totalMonitors: totalTasks,
    changesDetected: recentEvents.length,
    recentChanges: recentEvents.map((e) => ({
      url: (JSON.parse(e.details || '{}') as Record<string, string>).url || '',
      changeType: e.eventType.replace('web_change_', ''),
      timestamp: e.createdAt.toISOString(),
      severity: e.severity,
    })),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectChangeType(
  monitorType: MonitorType,
  _previousContent: string,
  _currentContent: string,
  keywords: string[]
): string {
  switch (monitorType) {
    case 'price':
      return 'price_change';
    case 'availability':
      return 'availability_change';
    case 'keyword':
      return keywords.length > 0 ? 'keyword_match' : 'content_change';
    case 'rss':
      return 'new_item';
    case 'competitor':
      return 'competitor_change';
    case 'content':
    default:
      return 'content_change';
  }
}

function extractPrices(content: string): string[] {
  // Extract price patterns like $19.99, €25,00, £100
  const priceRegex = /[\$€£]\s*[\d,]+(?:\.\d{2})?/g;
  return content.match(priceRegex) || [];
}

function hashContent(content: string): string {
  // Simple hash for change detection
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

async function fetchWebContent(url: string, cssSelector?: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Genova-Genova-Monitor/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    if (!response.ok) {
      return `[HTTP ${response.status}] Failed to fetch ${url}`;
    }

    const html = await response.text();

    // If a CSS selector is specified, try to extract relevant content
    if (cssSelector) {
      // Simple extraction — in production, use a proper HTML parser
      const selectorPattern = cssSelector
        .replace(/\./g, 'class="')
        .replace(/#/g, 'id="');
      const matchIndex = html.indexOf(selectorPattern);
      if (matchIndex !== -1) {
        return html.substring(matchIndex, Math.min(matchIndex + 5000, html.length));
      }
    }

    // Strip HTML tags for content comparison
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return textContent.substring(0, 10000); // Limit content size
  } catch (error) {
    log.warn('Failed to fetch web content', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return `[ERROR] Failed to fetch: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Get all monitors for a user
 */
export async function getUserMonitors(userId: string): Promise<Array<{
  id: string;
  name: string;
  schedule: string;
  status: string;
  nextRun: Date | null;
  lastRun: Date | null;
  payload: string;
}>> {
  return db.scheduledTask.findMany({
    where: {
      userId,
      payload: { contains: 'monitor_web' },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Delete a monitor
 */
export async function deleteMonitor(monitorId: string, userId: string): Promise<boolean> {
  const { cancelTask } = await import('./agent-scheduler');
  return cancelTask(monitorId, userId);
}
