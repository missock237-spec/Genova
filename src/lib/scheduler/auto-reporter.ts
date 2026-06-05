/**
 * Auto-Reporting System — Periodic Report Generation & Delivery
 *
 * Generate periodic reports (daily, weekly, monthly) and deliver them
 * via email, WhatsApp, or dashboard notification.
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('auto-reporter');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportFrequency = 'daily' | 'weekly' | 'monthly';
export type DeliveryMethod = 'email' | 'whatsapp' | 'dashboard';
export type ReportType = 'usage' | 'agent_performance' | 'cost' | 'security' | 'custom';

export interface ScheduleReportInput {
  userId: string;
  name: string;
  reportType: ReportType;
  frequency: ReportFrequency;
  deliveryMethods: DeliveryMethod[];
  email?: string;
  whatsappNumber?: string;
  agentId?: string;
  customPrompt?: string;
}

export interface ReportData {
  title: string;
  period: string;
  generatedAt: string;
  sections: Array<{
    title: string;
    content: string;
    metrics?: Array<{
      label: string;
      value: string | number;
      change?: string;
    }>;
  }>;
  summary: string;
}

export interface DeliveryResult {
  method: DeliveryMethod;
  success: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Frequency to Cron Mapping
// ---------------------------------------------------------------------------

const FREQUENCY_CRON: Record<ReportFrequency, string> = {
  daily: '0 9 * * *',         // Every day at 9 AM
  weekly: '0 9 * * 1',        // Every Monday at 9 AM
  monthly: '0 9 1 * *',       // 1st of every month at 9 AM
};

// ---------------------------------------------------------------------------
// Core Methods
// ---------------------------------------------------------------------------

/**
 * Schedule a recurring report
 */
export async function scheduleReport(input: ScheduleReportInput): Promise<{
  id: string;
  nextRun: Date;
}> {
  const cronSchedule = FREQUENCY_CRON[input.frequency];

  const payload = {
    action: 'auto_report',
    scheduleType: 'cron',
    reportType: input.reportType,
    frequency: input.frequency,
    deliveryMethods: input.deliveryMethods,
    email: input.email,
    whatsappNumber: input.whatsappNumber,
    customPrompt: input.customPrompt,
  };

  const { scheduleTask } = await import('./agent-scheduler');

  const result = await scheduleTask({
    userId: input.userId,
    agentId: input.agentId,
    name: `[Report] ${input.name}`,
    description: `${input.frequency} ${input.reportType} report`,
    schedule: cronSchedule,
    action: 'auto_report',
    payload,
  });

  log.info('Report scheduled', {
    reportId: result.id,
    type: input.reportType,
    frequency: input.frequency,
  });

  return result;
}

/**
 * Generate a report for a user
 */
export async function generateReport(
  userId: string,
  payload: Record<string, unknown>
): Promise<ReportData> {
  const reportType = (payload.reportType as ReportType) || 'usage';
  const frequency = (payload.frequency as ReportFrequency) || 'daily';

  const period = getReportPeriod(frequency);
  const title = `${formatReportType(reportType)} Report — ${period.label}`;

  let reportData: ReportData;

  switch (reportType) {
    case 'usage':
      reportData = await generateUsageReport(userId, period, title);
      break;
    case 'agent_performance':
      reportData = await generateAgentPerformanceReport(userId, period, title);
      break;
    case 'cost':
      reportData = await generateCostReport(userId, period, title);
      break;
    case 'security':
      reportData = await generateSecurityReport(userId, period, title);
      break;
    case 'custom':
      reportData = await generateCustomReport(userId, period, title, payload.customPrompt as string);
      break;
    default:
      reportData = await generateUsageReport(userId, period, title);
  }

  // Deliver report if delivery methods specified
  const deliveryMethods = payload.deliveryMethods as DeliveryMethod[] | undefined;
  if (deliveryMethods && deliveryMethods.length > 0) {
    await deliverReport(userId, reportData, {
      deliveryMethods,
      email: payload.email as string | undefined,
      whatsappNumber: payload.whatsappNumber as string | undefined,
    });
  }

  log.info('Report generated', {
    userId,
    reportType,
    frequency,
    periodStart: period.start.toISOString(),
  });

  return reportData;
}

/**
 * Deliver a report through specified channels
 */
export async function deliverReport(
  userId: string,
  report: ReportData,
  options: {
    deliveryMethods: DeliveryMethod[];
    email?: string;
    whatsappNumber?: string;
  }
): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];

  for (const method of options.deliveryMethods) {
    try {
      switch (method) {
        case 'email': {
          const result = await deliverViaEmail(userId, report, options.email);
          results.push(result);
          break;
        }
        case 'whatsapp': {
          const result = await deliverViaWhatsApp(userId, report, options.whatsappNumber);
          results.push(result);
          break;
        }
        case 'dashboard': {
          const result = await deliverViaDashboard(userId, report);
          results.push(result);
          break;
        }
      }
    } catch (error) {
      results.push({
        method,
        success: false,
        message: error instanceof Error ? error.message : 'Delivery failed',
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Report Generators
// ---------------------------------------------------------------------------

async function generateUsageReport(
  userId: string,
  period: { start: Date; end: Date; label: string },
  title: string
): Promise<ReportData> {
  const [agentCount, taskCount, usageRecords] = await Promise.all([
    db.agent.count({ where: { userId } }),
    db.task.count({
      where: { userId, createdAt: { gte: period.start, lte: period.end } },
    }),
    db.agentUsage.findMany({
      where: { userId, createdAt: { gte: period.start, lte: period.end } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  const totalTokens = usageRecords.reduce((sum, r) => sum + r.tokensUsed, 0);
  const totalDuration = usageRecords.reduce((sum, r) => sum + r.duration, 0);
  const successRate = usageRecords.length > 0
    ? ((usageRecords.filter((r) => r.status === 'success').length / usageRecords.length) * 100).toFixed(1)
    : '0';

  return {
    title,
    period: period.label,
    generatedAt: new Date().toISOString(),
    sections: [
      {
        title: 'Overview',
        content: `You have ${agentCount} agent(s) and completed ${taskCount} task(s) this period.`,
        metrics: [
          { label: 'Active Agents', value: agentCount },
          { label: 'Tasks Completed', value: taskCount },
          { label: 'Total Tokens', value: totalTokens.toLocaleString() },
          { label: 'Success Rate', value: `${successRate}%` },
        ],
      },
      {
        title: 'Performance',
        content: `Total processing time: ${(totalDuration / 1000).toFixed(1)}s`,
        metrics: [
          { label: 'Avg Duration', value: usageRecords.length > 0 ? `${(totalDuration / usageRecords.length / 1000).toFixed(2)}s` : '0s' },
          { label: 'API Calls', value: usageRecords.length },
        ],
      },
    ],
    summary: `${taskCount} tasks completed with ${successRate}% success rate across ${agentCount} agents.`,
  };
}

async function generateAgentPerformanceReport(
  userId: string,
  period: { start: Date; end: Date; label: string },
  title: string
): Promise<ReportData> {
  const agents = await db.agent.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      agentUsages: {
        where: { createdAt: { gte: period.start, lte: period.end } },
        select: { tokensUsed: true, duration: true, status: true },
      },
    },
  });

  const agentMetrics = agents.map((agent) => {
    const usages = agent.agentUsages;
    const totalTokens = usages.reduce((s, u) => s + u.tokensUsed, 0);
    const totalDuration = usages.reduce((s, u) => s + u.duration, 0);
    const successes = usages.filter((u) => u.status === 'success').length;
    const successRate = usages.length > 0 ? ((successes / usages.length) * 100).toFixed(1) : '0';

    return {
      name: agent.name,
      type: agent.type,
      status: agent.status,
      tasks: usages.length,
      tokens: totalTokens,
      avgDuration: usages.length > 0 ? `${(totalDuration / usages.length / 1000).toFixed(2)}s` : '0s',
      successRate: `${successRate}%`,
    };
  });

  return {
    title,
    period: period.label,
    generatedAt: new Date().toISOString(),
    sections: [
      {
        title: 'Agent Performance',
        content: `Performance breakdown for ${agents.length} agent(s).`,
        metrics: agentMetrics.map((m) => ({
          label: m.name,
          value: `${m.tasks} tasks | ${m.successRate} success`,
          change: m.status,
        })),
      },
    ],
    summary: `${agents.length} agents processed ${agentMetrics.reduce((s, m) => s + m.tasks, 0)} total tasks.`,
  };
}

async function generateCostReport(
  userId: string,
  period: { start: Date; end: Date; label: string },
  title: string
): Promise<ReportData> {
  const costs = await db.aICost.findMany({
    where: { userId, createdAt: { gte: period.start, lte: period.end } },
    orderBy: { createdAt: 'desc' },
  });

  const totalCost = costs.reduce((sum, c) => sum + c.costUsd, 0);
  const totalTokens = costs.reduce((sum, c) => sum + c.totalTokens, 0);

  // Group by provider
  const byProvider = new Map<string, { cost: number; tokens: number; calls: number }>();
  for (const cost of costs) {
    const existing = byProvider.get(cost.provider) || { cost: 0, tokens: 0, calls: 0 };
    byProvider.set(cost.provider, {
      cost: existing.cost + cost.costUsd,
      tokens: existing.tokens + cost.totalTokens,
      calls: existing.calls + 1,
    });
  }

  return {
    title,
    period: period.label,
    generatedAt: new Date().toISOString(),
    sections: [
      {
        title: 'Cost Summary',
        content: `Total AI costs for the period.`,
        metrics: [
          { label: 'Total Cost', value: `$${totalCost.toFixed(4)}` },
          { label: 'Total Tokens', value: totalTokens.toLocaleString() },
          { label: 'API Calls', value: costs.length },
        ],
      },
      {
        title: 'By Provider',
        content: 'Cost breakdown by provider.',
        metrics: Array.from(byProvider.entries()).map(([provider, data]) => ({
          label: provider,
          value: `$${data.cost.toFixed(4)} (${data.calls} calls)`,
        })),
      },
    ],
    summary: `Total cost: $${totalCost.toFixed(4)} across ${costs.length} API calls.`,
  };
}

async function generateSecurityReport(
  userId: string,
  period: { start: Date; end: Date; label: string },
  title: string
): Promise<ReportData> {
  const [auditLogs, monitoringEvents, guardrailCount] = await Promise.all([
    db.auditLog.findMany({
      where: { userId, createdAt: { gte: period.start, lte: period.end } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db.monitoringEvent.findMany({
      where: { userId, createdAt: { gte: period.start, lte: period.end } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db.guardrail.count({ where: { userId, isActive: true } }),
  ]);

  const criticalEvents = monitoringEvents.filter((e) => e.severity === 'critical').length;
  const warningEvents = monitoringEvents.filter((e) => e.severity === 'warning').length;

  return {
    title,
    period: period.label,
    generatedAt: new Date().toISOString(),
    sections: [
      {
        title: 'Security Overview',
        content: `Security events for the period.`,
        metrics: [
          { label: 'Critical Events', value: criticalEvents, change: criticalEvents > 0 ? '⚠️' : '✅' },
          { label: 'Warnings', value: warningEvents },
          { label: 'Audit Log Entries', value: auditLogs.length },
          { label: 'Active Guardrails', value: guardrailCount },
        ],
      },
    ],
    summary: criticalEvents > 0
      ? `⚠️ ${criticalEvents} critical security event(s) detected.`
      : 'No critical security events detected.',
  };
}

async function generateCustomReport(
  userId: string,
  period: { start: Date; end: Date; label: string },
  title: string,
  customPrompt?: string
): Promise<ReportData> {
  // For custom reports, gather basic user data and structure it
  const [agents, tasks, costs] = await Promise.all([
    db.agent.findMany({ where: { userId }, select: { id: true, name: true, type: true, status: true } }),
    db.task.findMany({
      where: { userId, createdAt: { gte: period.start, lte: period.end } },
      select: { id: true, title: true, status: true },
      take: 20,
    }),
    db.aICost.findMany({
      where: { userId, createdAt: { gte: period.start, lte: period.end } },
      select: { costUsd: true, totalTokens: true },
    }),
  ]);

  return {
    title,
    period: period.label,
    generatedAt: new Date().toISOString(),
    sections: [
      {
        title: 'Custom Report',
        content: customPrompt || 'Custom report generated with available data.',
        metrics: [
          { label: 'Agents', value: agents.length },
          { label: 'Tasks', value: tasks.length },
          { label: 'Cost', value: `$${costs.reduce((s, c) => s + c.costUsd, 0).toFixed(4)}` },
        ],
      },
    ],
    summary: `Custom report for ${period.label}.`,
  };
}

// ---------------------------------------------------------------------------
// Delivery Methods
// ---------------------------------------------------------------------------

async function deliverViaEmail(
  userId: string,
  report: ReportData,
  email?: string
): Promise<DeliveryResult> {
  if (!email) {
    return { method: 'email', success: false, message: 'No email address provided' };
  }

  try {
    // Use the email module if available
    const { sendEmail } = await import('@/lib/email');
    await sendEmail(
      email,
      report.title,
      formatReportAsHTML(report),
    );

    return { method: 'email', success: true, message: `Report sent to ${email}` };
  } catch (error) {
    log.warn('Email delivery failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { method: 'email', success: false, message: 'Email delivery failed' };
  }
}

async function deliverViaWhatsApp(
  userId: string,
  report: ReportData,
  whatsappNumber?: string
): Promise<DeliveryResult> {
  if (!whatsappNumber) {
    return { method: 'whatsapp', success: false, message: 'No WhatsApp number provided' };
  }

  try {
    const text = formatReportAsText(report);
    await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: whatsappNumber, message: text }),
    });

    return { method: 'whatsapp', success: true, message: `Report sent via WhatsApp` };
  } catch (error) {
    log.warn('WhatsApp delivery failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { method: 'whatsapp', success: false, message: 'WhatsApp delivery failed' };
  }
}

async function deliverViaDashboard(
  userId: string,
  report: ReportData
): Promise<DeliveryResult> {
  try {
    await db.monitoringEvent.create({
      data: {
        userId,
        eventType: 'report_delivery',
        source: 'auto_reporter',
        message: report.title,
        details: JSON.stringify(report),
        severity: 'info',
      },
    });

    return { method: 'dashboard', success: true, message: 'Report delivered to dashboard' };
  } catch (error) {
    return {
      method: 'dashboard',
      success: false,
      message: error instanceof Error ? error.message : 'Dashboard delivery failed',
    };
  }
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

function formatReportAsHTML(report: ReportData): string {
  const sectionsHtml = report.sections
    .map(
      (section) => `
    <div style="margin-bottom: 24px;">
      <h3 style="color: #1a1a1a; margin-bottom: 8px;">${section.title}</h3>
      <p style="color: #666; margin-bottom: 12px;">${section.content}</p>
      ${section.metrics ? `
        <table style="border-collapse: collapse; width: 100%;">
          ${section.metrics.map((m) => `
            <tr>
              <td style="padding: 6px 12px; border: 1px solid #eee; font-weight: 500;">${m.label}</td>
              <td style="padding: 6px 12px; border: 1px solid #eee;">${m.value}</td>
              ${m.change ? `<td style="padding: 6px 12px; border: 1px solid #eee; color: #888;">${m.change}</td>` : ''}
            </tr>
          `).join('')}
        </table>
      ` : ''}
    </div>
  `
    )
    .join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">${report.title}</h2>
      <p style="color: #888; font-size: 14px;">Period: ${report.period} | Generated: ${new Date(report.generatedAt).toLocaleString()}</p>
      ${sectionsHtml}
      <div style="margin-top: 24px; padding: 16px; background: #f5f5f5; border-radius: 8px;">
        <strong>Summary:</strong> ${report.summary}
      </div>
    </div>
  `;
}

function formatReportAsText(report: ReportData): string {
  let text = `${report.title}\nPeriod: ${report.period}\n\n`;

  for (const section of report.sections) {
    text += `--- ${section.title} ---\n${section.content}\n`;
    if (section.metrics) {
      for (const metric of section.metrics) {
        text += `  ${metric.label}: ${metric.value}${metric.change ? ` (${metric.change})` : ''}\n`;
      }
    }
    text += '\n';
  }

  text += `Summary: ${report.summary}`;
  return text;
}

function getReportPeriod(frequency: ReportFrequency): {
  start: Date;
  end: Date;
  label: string;
} {
  const now = new Date();
  const end = new Date(now);

  switch (frequency) {
    case 'daily': {
      const start = new Date(now);
      start.setDate(start.getDate() - 1);
      return { start, end, label: `Last 24 hours (${start.toLocaleDateString()})` };
    }
    case 'weekly': {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { start, end, label: `Last 7 days (${start.toLocaleDateString()} - ${end.toLocaleDateString()})` };
    }
    case 'monthly': {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      return { start, end, label: `Last month (${start.toLocaleDateString()} - ${end.toLocaleDateString()})` };
    }
  }
}

function formatReportType(type: ReportType): string {
  const names: Record<ReportType, string> = {
    usage: 'Usage',
    agent_performance: 'Agent Performance',
    cost: 'Cost',
    security: 'Security',
    custom: 'Custom',
  };
  return names[type] || 'Unknown';
}

/**
 * Get all scheduled reports for a user
 */
export async function getUserReports(userId: string): Promise<Array<{
  id: string;
  name: string;
  schedule: string;
  status: string;
  nextRun: Date | null;
  lastRun: Date | null;
  runCount: number;
  payload: string;
}>> {
  return db.scheduledTask.findMany({
    where: {
      userId,
      payload: { contains: 'auto_report' },
    },
    orderBy: { createdAt: 'desc' },
  });
}
