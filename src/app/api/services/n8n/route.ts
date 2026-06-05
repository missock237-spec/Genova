import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getN8nClient } from '@/lib/n8n-client';

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    requireRole: 'admin',
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const client = getN8nClient();
  const healthy = await client.health();
  
  let workflowCount = 0;
  let activeWorkflows = 0;
  
  if (healthy) {
    try {
      const workflows = await client.listWorkflows();
      workflowCount = workflows.length;
      activeWorkflows = workflows.filter(w => w.active).length;
    } catch {
      // Ignore listing errors
    }
  }

  const res = NextResponse.json({
    service: 'n8n',
    status: healthy ? 'running' : 'stopped',
    url: process.env.N8N_URL || 'http://localhost:5678',
    workflowCount,
    activeWorkflows,
    editorUrl: healthy ? `${process.env.N8N_URL || 'http://localhost:5678'}/workflow` : null,
  });
  return secureResponse(res, request);
}
