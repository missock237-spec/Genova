'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Clock,
  Plus,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Globe,
  FileText,
  Bell,
  Zap,
  Calendar,
  Timer,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Bot,
  Settings2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  schedule: string;
  timezone: string;
  status: string;
  lastRun: string | null;
  nextRun: string | null;
  runCount: number;
  failureCount: number;
  payload: string;
  agentId: string | null;
  createdAt: string;
}

interface AgentAutomation {
  id: string;
  name: string;
  description: string;
  trigger: string;
  conditions: string;
  actions: string;
  isActive: boolean;
  runCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
}

type AgentAction = 'run_task' | 'monitor_web' | 'auto_report' | 'send_notification' | 'custom';

// ---------------------------------------------------------------------------
// Cron Builder Presets
// ---------------------------------------------------------------------------

const CRON_PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at 9 AM', value: '0 9 * * *' },
  { label: 'Weekdays at 9 AM', value: '0 9 * * 1-5' },
  { label: 'Weekly (Monday)', value: '0 9 * * 1' },
  { label: 'Monthly (1st)', value: '0 9 1 * *' },
];

const ACTION_ICONS: Record<AgentAction, typeof Clock> = {
  run_task: Bot,
  monitor_web: Globe,
  auto_report: FileText,
  send_notification: Bell,
  custom: Zap,
};

const ACTION_LABELS: Record<AgentAction, string> = {
  run_task: 'Run Agent Task',
  monitor_web: 'Web Monitor',
  auto_report: 'Auto Report',
  send_notification: 'Send Notification',
  custom: 'Custom Action',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SchedulerView() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [automations, setAutomations] = useState<AgentAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [autoCreateOpen, setAutoCreateOpen] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formSchedule, setFormSchedule] = useState('0 9 * * *');
  const [formAction, setFormAction] = useState<AgentAction>('run_task');
  const [formDescription, setFormDescription] = useState('');
  const [formAgentId, setFormAgentId] = useState('');
  const [formMonitorUrl, setFormMonitorUrl] = useState('');
  const [formMonitorType, setFormMonitorType] = useState('content');
  const [formReportType, setFormReportType] = useState('usage');
  const [formReportFrequency, setFormReportFrequency] = useState('daily');

  // Automation form state
  const [autoName, setAutoName] = useState('');
  const [autoTrigger, setAutoTrigger] = useState('event');
  const [autoConditions, setAutoConditions] = useState('');
  const [autoActions, setAutoActions] = useState('');

  const fetchTasks = useCallback(async () => {
    try {
      const data = await apiFetch<{ tasks: ScheduledTask[] }>('/api/scheduler/tasks');
      setTasks(data.tasks || []);
    } catch {
      // Silent fail
    }
  }, []);

  const fetchAutomations = useCallback(async () => {
    try {
      const data = await apiFetch<{ automations: AgentAutomation[] }>('/api/scheduler/automations');
      setAutomations(data.automations || []);
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchTasks(), fetchAutomations()]);
      setLoading(false);
    };
    load();
  }, [fetchTasks, fetchAutomations]);

  const handleCreateTask = async () => {
    try {
      const payload: Record<string, unknown> = {};

      if (formAction === 'monitor_web') {
        payload.url = formMonitorUrl;
        payload.monitorType = formMonitorType;
      } else if (formAction === 'auto_report') {
        payload.reportType = formReportType;
        payload.frequency = formReportFrequency;
        payload.deliveryMethods = ['dashboard'];
      }

      await apiFetch('/api/scheduler/tasks', {
        method: 'POST',
        body: JSON.stringify({
          name: formName,
          description: formDescription,
          schedule: formSchedule,
          action: formAction,
          agentId: formAgentId || undefined,
          payload,
        }),
      });

      toast({ title: 'Task created', description: `"${formName}" has been scheduled.` });
      setCreateOpen(false);
      resetForm();
      fetchTasks();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to create task', variant: 'destructive' });
    }
  };

  const handleCreateAutomation = async () => {
    try {
      let actionsArr: unknown[] = [];
      try {
        actionsArr = JSON.parse(autoActions);
      } catch {
        actionsArr = [{ type: 'notify', message: autoActions }];
      }

      let conditionsArr: unknown[] = [];
      try {
        conditionsArr = JSON.parse(autoConditions);
      } catch {
        conditionsArr = [{ field: 'status', operator: 'equals', value: autoConditions }];
      }

      await apiFetch('/api/scheduler/automations', {
        method: 'POST',
        body: JSON.stringify({
          name: autoName,
          trigger: autoTrigger,
          conditions: conditionsArr,
          actions: actionsArr,
        }),
      });

      toast({ title: 'Automation created', description: `"${autoName}" is now active.` });
      setAutoCreateOpen(false);
      resetAutoForm();
      fetchAutomations();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to create automation', variant: 'destructive' });
    }
  };

  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'active' ? 'paused' : 'active';
      await apiFetch(`/api/scheduler/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      toast({ title: `Task ${newStatus}`, description: `Task has been ${newStatus}.` });
      fetchTasks();
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to update task', variant: 'destructive' });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await apiFetch(`/api/scheduler/tasks/${taskId}`, { method: 'DELETE' });
      toast({ title: 'Task deleted', description: 'Scheduled task has been removed.' });
      fetchTasks();
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to delete task', variant: 'destructive' });
    }
  };

  const handleExecuteTask = async (taskId: string) => {
    setExecuting(taskId);
    try {
      await apiFetch(`/api/scheduler/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ execute: true }),
      });
      toast({ title: 'Task executed', description: 'Task has been triggered manually.' });
      fetchTasks();
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to execute task', variant: 'destructive' });
    } finally {
      setExecuting(null);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormSchedule('0 9 * * *');
    setFormAction('run_task');
    setFormDescription('');
    setFormAgentId('');
    setFormMonitorUrl('');
    setFormMonitorType('content');
    setFormReportType('usage');
    setFormReportFrequency('daily');
  };

  const resetAutoForm = () => {
    setAutoName('');
    setAutoTrigger('event');
    setAutoConditions('');
    setAutoActions('');
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
      paused: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
      disabled: 'bg-red-500/10 text-red-600 border-red-500/20',
      error: 'bg-red-500/10 text-red-600 border-red-500/20',
    };
    return styles[status] || 'bg-gray-500/10 text-gray-600 border-gray-500/20';
  };

  const parsePayload = (payloadStr: string): Record<string, unknown> => {
    try {
      return JSON.parse(payloadStr);
    } catch {
      return {};
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scheduled Agents</h1>
          <p className="text-muted-foreground mt-1">
            Automate tasks with cron-based scheduling, web monitoring, and auto-reports.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={autoCreateOpen} onOpenChange={setAutoCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="h-4 w-4 mr-2" />
                New Automation
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create Automation Rule</DialogTitle>
                <DialogDescription>Define trigger conditions and actions for automated workflows.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={autoName} onChange={(e) => setAutoName(e.target.value)} placeholder="e.g., Error Alert Rule" />
                </div>
                <div className="space-y-2">
                  <Label>Trigger Type</Label>
                  <Select value={autoTrigger} onValueChange={setAutoTrigger}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="event">Event</SelectItem>
                      <SelectItem value="schedule">Schedule</SelectItem>
                      <SelectItem value="webhook">Webhook</SelectItem>
                      <SelectItem value="condition">Condition</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Conditions (JSON or description)</Label>
                  <Textarea value={autoConditions} onChange={(e) => setAutoConditions(e.target.value)} placeholder='e.g., [{"field":"status","operator":"equals","value":"error"}]' rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>Actions (JSON or description)</Label>
                  <Textarea value={autoActions} onChange={(e) => setAutoActions(e.target.value)} placeholder='e.g., [{"type":"notify","message":"Agent error detected"}]' rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAutoCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateAutomation} disabled={!autoName}>Create Automation</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Task
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle>Schedule New Task</DialogTitle>
                <DialogDescription>Create a scheduled task for your agents.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Task Name</Label>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Daily Sales Report" />
                </div>
                <div className="space-y-2">
                  <Label>Action Type</Label>
                  <Select value={formAction} onValueChange={(v) => setFormAction(v as AgentAction)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACTION_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Schedule (Cron Expression)</Label>
                  <div className="flex gap-2">
                    <Input value={formSchedule} onChange={(e) => setFormSchedule(e.target.value)} placeholder="0 9 * * *" className="font-mono" />
                    <Select value={formSchedule} onValueChange={setFormSchedule}>
                      <SelectTrigger className="w-[180px]"><SelectValue placeholder="Presets" /></SelectTrigger>
                      <SelectContent>
                        {CRON_PRESETS.map((preset) => (
                          <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">Format: minute hour day-of-month month day-of-week</p>
                </div>

                {formAction === 'monitor_web' && (
                  <>
                    <div className="space-y-2">
                      <Label>URL to Monitor</Label>
                      <Input value={formMonitorUrl} onChange={(e) => setFormMonitorUrl(e.target.value)} placeholder="https://example.com" />
                    </div>
                    <div className="space-y-2">
                      <Label>Monitor Type</Label>
                      <Select value={formMonitorType} onValueChange={setFormMonitorType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="content">Content Change</SelectItem>
                          <SelectItem value="price">Price Change</SelectItem>
                          <SelectItem value="availability">Availability</SelectItem>
                          <SelectItem value="keyword">Keyword Alert</SelectItem>
                          <SelectItem value="rss">RSS Feed</SelectItem>
                          <SelectItem value="competitor">Competitor Tracking</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {formAction === 'auto_report' && (
                  <>
                    <div className="space-y-2">
                      <Label>Report Type</Label>
                      <Select value={formReportType} onValueChange={setFormReportType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="usage">Usage Report</SelectItem>
                          <SelectItem value="agent_performance">Agent Performance</SelectItem>
                          <SelectItem value="cost">Cost Report</SelectItem>
                          <SelectItem value="security">Security Report</SelectItem>
                          <SelectItem value="custom">Custom Report</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Frequency</Label>
                      <Select value={formReportFrequency} onValueChange={setFormReportFrequency}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label>Description (Optional)</Label>
                  <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Describe what this task does..." rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
                <Button onClick={handleCreateTask} disabled={!formName}>Create Task</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-emerald-500" />
              <span className="text-2xl font-bold">{tasks.filter(t => t.status === 'active').length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Web Monitors</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{tasks.filter(t => parsePayload(t.payload).action === 'monitor_web').length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Auto Reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-500" />
              <span className="text-2xl font-bold">{tasks.filter(t => parsePayload(t.payload).action === 'auto_report').length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Automations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              <span className="text-2xl font-bold">{automations.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="tasks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tasks">
            <Clock className="h-4 w-4 mr-2" />
            Scheduled Tasks
          </TabsTrigger>
          <TabsTrigger value="automations">
            <Zap className="h-4 w-4 mr-2" />
            Automation Rules
          </TabsTrigger>
        </TabsList>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="space-y-4">
          {tasks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">No scheduled tasks</h3>
                <p className="text-muted-foreground text-sm text-center max-w-md">
                  Create your first scheduled task to automate agent actions, monitor websites, or generate reports.
                </p>
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Task
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <div className="space-y-3">
                {tasks.map((task) => {
                  const payload = parsePayload(task.payload);
                  const actionType = (payload.action as AgentAction) || 'custom';
                  const ActionIcon = ACTION_ICONS[actionType];

                  return (
                    <Card key={task.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className={`p-2 rounded-lg ${
                              task.status === 'active' ? 'bg-emerald-500/10' :
                              task.status === 'paused' ? 'bg-amber-500/10' :
                              'bg-red-500/10'
                            }`}>
                              <ActionIcon className={`h-4 w-4 ${
                                task.status === 'active' ? 'text-emerald-500' :
                                task.status === 'paused' ? 'text-amber-500' :
                                'text-red-500'
                              }`} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium truncate">{task.name}</h4>
                                <Badge variant="outline" className={getStatusBadge(task.status)}>
                                  {task.status}
                                </Badge>
                              </div>
                              {task.description && (
                                <p className="text-sm text-muted-foreground line-clamp-1">{task.description}</p>
                              )}
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <code className="bg-muted px-1 py-0.5 rounded text-[11px]">{task.schedule}</code>
                                </span>
                                <span className="flex items-center gap-1">
                                  <Play className="h-3 w-3" />
                                  {task.runCount} runs
                                </span>
                                {task.failureCount > 0 && (
                                  <span className="flex items-center gap-1 text-red-500">
                                    <AlertCircle className="h-3 w-3" />
                                    {task.failureCount} failures
                                  </span>
                                )}
                                {task.nextRun && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Next: {new Date(task.nextRun).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleExecuteTask(task.id)}
                              disabled={executing === task.id}
                            >
                              {executing === task.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleToggleTask(task.id, task.status)}
                            >
                              {task.status === 'active' ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteTask(task.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* Automations Tab */}
        <TabsContent value="automations" className="space-y-4">
          {automations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Settings2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">No automation rules</h3>
                <p className="text-muted-foreground text-sm text-center max-w-md">
                  Create automation rules that trigger agent actions based on events, schedules, or conditions.
                </p>
                <Button className="mt-4" onClick={() => setAutoCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Automation
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <div className="space-y-3">
                {automations.map((auto) => (
                  <Card key={auto.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium">{auto.name}</h4>
                            <Badge variant="outline" className={auto.isActive ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-gray-500/10 text-gray-600 border-gray-500/20'}>
                              {auto.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                              {auto.trigger}
                            </Badge>
                          </div>
                          {auto.description && (
                            <p className="text-sm text-muted-foreground">{auto.description}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Play className="h-3 w-3" />
                              {auto.runCount} triggers
                            </span>
                            {auto.lastTriggeredAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Last: {new Date(auto.lastTriggeredAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <Switch checked={auto.isActive} disabled />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
