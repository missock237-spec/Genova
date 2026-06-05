'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Users, Bot, Plus, Settings, Shield, Crown, UserMinus,
  Share2, Activity, Eye, Zap, MessageSquare, Trash2
} from 'lucide-react';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  memberCount?: number;
  members?: Member[];
  createdAt: string;
}

interface Member {
  id: string;
  userId: string;
  role: string;
  status: string;
  joinedAt: string;
  user?: { name: string; email: string; avatar: string | null };
}

interface SharedAgent {
  id: string;
  agentId: string;
  sharedBy: string;
  permissions: string[];
  isActive: boolean;
  agent?: { name: string; type: string; description: string; status: string };
}

interface ActivityItem {
  id: string;
  action: string;
  details: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
  user?: { name: string; avatar: string | null };
}

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown className="h-4 w-4 text-amber-500" />,
  admin: <Shield className="h-4 w-4 text-primary" />,
  member: <Users className="h-4 w-4" />,
  viewer: <Eye className="h-4 w-4 text-muted-foreground" />,
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  admin: 'bg-primary/10 text-primary border-primary/20',
  member: 'bg-secondary text-secondary-foreground',
  viewer: 'bg-muted text-muted-foreground',
};

export function CollaborationView() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharedAgents, setSharedAgents] = useState<SharedAgent[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [shareAgentId, setShareAgentId] = useState('');
  const [userAgents, setUserAgents] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [newWorkspace, setNewWorkspace] = useState({ name: '', description: '' });

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Workspace[]>('/api/workspaces');
      setWorkspaces(data || []);
    } catch {
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const fetchUserAgents = async () => {
    try {
      const data = await apiFetch<Array<{ id: string; name: string; type: string }>>('/api/agents');
      setUserAgents(data || []);
    } catch {
      setUserAgents([]);
    }
  };

  const selectWorkspace = async (workspace: Workspace) => {
    setSelectedWorkspace(workspace);
    try {
      // Fetch full workspace details
      const fullWorkspace = await apiFetch<Workspace>(`/api/workspaces/${workspace.id}`);
      setSelectedWorkspace(fullWorkspace);

      // Fetch shared agents
      const agentsData = await apiFetch<SharedAgent[]>(`/api/workspaces/${workspace.id}/shared-agents`);
      setSharedAgents(agentsData || []);

      // Fetch activity
      const activityData = await apiFetch<{ activities: ActivityItem[] }>(`/api/workspaces/${workspace.id}/activity?limit=20`);
      setActivities(activityData.activities || []);
    } catch {
      // Use what we have
    }
  };

  const handleCreateWorkspace = async () => {
    try {
      const workspace = await apiFetch<Workspace>('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify(newWorkspace),
      });
      setShowCreateDialog(false);
      setNewWorkspace({ name: '', description: '' });
      setWorkspaces((prev) => [workspace, ...prev]);
      selectWorkspace(workspace);
    } catch {
      // Silently fail
    }
  };

  const handleInviteMember = async () => {
    if (!selectedWorkspace || !inviteEmail) return;
    try {
      // Find user by email — simplified: use email as userId for demo
      await apiFetch(`/api/workspaces/${selectedWorkspace.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: inviteEmail, role: inviteRole }),
      });
      setShowInviteDialog(false);
      setInviteEmail('');
      selectWorkspace(selectedWorkspace);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to invite member';
      alert(message);
    }
  };

  const handleShareAgent = async () => {
    if (!selectedWorkspace || !shareAgentId) return;
    try {
      await apiFetch(`/api/workspaces/${selectedWorkspace.id}/shared-agents`, {
        method: 'POST',
        body: JSON.stringify({ agentId: shareAgentId, permissions: ['execute', 'view'] }),
      });
      setShowShareDialog(false);
      setShareAgentId('');
      selectWorkspace(selectedWorkspace);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to share agent';
      alert(message);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedWorkspace) return;
    try {
      await apiFetch(`/api/workspaces/${selectedWorkspace.id}/members?userId=${userId}`, {
        method: 'DELETE',
      });
      selectWorkspace(selectedWorkspace);
    } catch {
      // Silently fail
    }
  };

  const getActivityIcon = (action: string) => {
    if (action.includes('created')) return <Plus className="h-4 w-4 text-emerald-500" />;
    if (action.includes('joined')) return <Users className="h-4 w-4 text-primary" />;
    if (action.includes('shared')) return <Share2 className="h-4 w-4 text-amber-500" />;
    if (action.includes('role')) return <Shield className="h-4 w-4 text-violet-500" />;
    if (action.includes('removed')) return <UserMinus className="h-4 w-4 text-destructive" />;
    return <Activity className="h-4 w-4 text-muted-foreground" />;
  };

  const formatAction = (action: string): string => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team Collaboration</h1>
          <p className="text-muted-foreground">Manage workspaces, share agents, and collaborate with your team</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Workspace
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Workspace</DialogTitle>
                <DialogDescription>Set up a new workspace for your team</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid gap-2">
                  <Label>Name</Label>
                  <Input value={newWorkspace.name} onChange={(e) => setNewWorkspace({ ...newWorkspace, name: e.target.value })} placeholder="My Team Workspace" />
                </div>
                <div className="grid gap-2">
                  <Label>Description</Label>
                  <Textarea value={newWorkspace.description} onChange={(e) => setNewWorkspace({ ...newWorkspace, description: e.target.value })} placeholder="What is this workspace for..." rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                <Button onClick={handleCreateWorkspace} disabled={!newWorkspace.name}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Workspace List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Workspaces</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-96">
                {loading ? (
                  <div className="p-4 space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="animate-pulse h-12 bg-muted rounded" />
                    ))}
                  </div>
                ) : workspaces.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">No workspaces yet</div>
                ) : (
                  <div className="space-y-1 p-2">
                    {workspaces.map((ws) => (
                      <Button
                        key={ws.id}
                        variant={selectedWorkspace?.id === ws.id ? 'secondary' : 'ghost'}
                        className="w-full justify-start gap-3 h-auto py-2"
                        onClick={() => selectWorkspace(ws)}
                      >
                        <div className="p-1.5 rounded bg-primary/10 text-primary">
                          <Users className="h-4 w-4" />
                        </div>
                        <div className="text-left min-w-0">
                          <p className="text-sm font-medium truncate">{ws.name}</p>
                          <p className="text-[10px] text-muted-foreground">{ws.memberCount || 0} members</p>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Workspace Detail */}
        <div className="lg:col-span-3">
          {selectedWorkspace ? (
            <Tabs defaultValue="members" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{selectedWorkspace.name}</h2>
                  <p className="text-sm text-muted-foreground">{selectedWorkspace.description}</p>
                </div>
                <TabsList>
                  <TabsTrigger value="members" className="gap-1"><Users className="h-3.5 w-3.5" />Members</TabsTrigger>
                  <TabsTrigger value="agents" className="gap-1"><Bot className="h-3.5 w-3.5" />Agents</TabsTrigger>
                  <TabsTrigger value="activity" className="gap-1"><Activity className="h-3.5 w-3.5" />Activity</TabsTrigger>
                </TabsList>
              </div>

              {/* Members Tab */}
              <TabsContent value="members" className="space-y-4">
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowInviteDialog(true)}>
                    <Plus className="h-4 w-4" />Invite Member
                  </Button>
                </div>
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {(selectedWorkspace.members || []).map((member) => (
                        <div key={member.id} className="flex items-center justify-between p-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                {member.user?.name?.charAt(0)?.toUpperCase() || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{member.user?.name || 'Unknown'}</p>
                              <p className="text-xs text-muted-foreground">{member.user?.email || ''}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={ROLE_COLORS[member.role] || ''}>
                              <span className="mr-1">{ROLE_ICONS[member.role]}</span>
                              {member.role}
                            </Badge>
                            {member.role !== 'owner' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemoveMember(member.userId)}
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      {(!selectedWorkspace.members || selectedWorkspace.members.length === 0) && (
                        <div className="p-6 text-center text-sm text-muted-foreground">No members found</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Shared Agents Tab */}
              <TabsContent value="agents" className="space-y-4">
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => { fetchUserAgents(); setShowShareDialog(true); }}>
                    <Share2 className="h-4 w-4" />Share Agent
                  </Button>
                </div>
                {sharedAgents.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium">No shared agents</h3>
                      <p className="text-muted-foreground text-sm">Share agents with your workspace team</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sharedAgents.map((sa) => (
                      <Card key={sa.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                <Bot className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="font-medium">{sa.agent?.name || 'Unknown Agent'}</p>
                                <p className="text-xs text-muted-foreground">{sa.agent?.type || ''} &middot; {sa.agent?.status || ''}</p>
                              </div>
                            </div>
                          </div>
                          {sa.agent?.description && (
                            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{sa.agent.description}</p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-3">
                            {sa.permissions.map((perm) => (
                              <Badge key={perm} variant="outline" className="text-[10px]">{perm}</Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Activity Tab */}
              <TabsContent value="activity" className="space-y-4">
                <Card>
                  <CardContent className="p-0">
                    <ScrollArea className="max-h-96">
                      {activities.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                          <h3 className="text-lg font-medium">No activity yet</h3>
                          <p className="text-muted-foreground text-sm">Activity will appear here as team members interact</p>
                        </div>
                      ) : (
                        <div className="divide-y">
                          {activities.map((act) => (
                            <div key={act.id} className="flex items-start gap-3 p-4">
                              <div className="mt-0.5">{getActivityIcon(act.action)}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{act.user?.name || 'User'}</span>
                                  <span className="text-sm text-muted-foreground">{formatAction(act.action)}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {new Date(act.createdAt).toLocaleString()}
                                </p>
                              </div>
                              {!act.isRead && <div className="h-2 w-2 rounded-full bg-primary mt-2" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Users className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-medium">Select a Workspace</h3>
                <p className="text-muted-foreground text-sm max-w-md text-center">
                  Choose a workspace from the sidebar or create a new one to start collaborating with your team.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Invite Member Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>Add a team member to this workspace</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label>User ID or Email</Label>
              <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>Cancel</Button>
            <Button onClick={handleInviteMember} disabled={!inviteEmail}>Invite</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Agent Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Agent</DialogTitle>
            <DialogDescription>Share one of your agents with this workspace</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label>Select Agent</Label>
              <Select value={shareAgentId} onValueChange={setShareAgentId}>
                <SelectTrigger><SelectValue placeholder="Choose an agent..." /></SelectTrigger>
                <SelectContent>
                  {userAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>{agent.name} ({agent.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareDialog(false)}>Cancel</Button>
            <Button onClick={handleShareAgent} disabled={!shareAgentId}>Share Agent</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
