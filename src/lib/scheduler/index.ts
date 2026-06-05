/**
 * Scheduler System — Index
 *
 * Re-exports all scheduler modules for convenient imports.
 */

// Agent Scheduler Engine
export {
  scheduleTask,
  cancelTask,
  updateSchedule,
  getUpcomingTasks,
  executeScheduledTask,
  initializeScheduler,
  getSchedulerStatus,
  getNextRunTime,
  type ScheduleTaskInput,
  type ScheduleUpdateInput,
  type ExecutionResult,
  type TaskStatus,
  type AgentAction,
  type ScheduleType,
} from './agent-scheduler';

// Web Monitoring System
export {
  createMonitor,
  checkForChanges,
  detectChanges,
  generateReport as generateMonitorReport,
  getUserMonitors,
  deleteMonitor,
  type CreateMonitorInput,
  type MonitorResult,
  type ChangeReport,
  type MonitorType,
} from './web-monitor';

// Auto-Reporting System
export {
  scheduleReport,
  generateReport,
  deliverReport,
  getUserReports,
  type ScheduleReportInput,
  type ReportData,
  type DeliveryResult,
  type ReportFrequency,
  type DeliveryMethod,
  type ReportType,
} from './auto-reporter';
