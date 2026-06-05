import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getComfyUIClient } from '@/lib/comfyui-client';

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    requireRole: 'admin',
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const client = getComfyUIClient();
  const healthy = await client.health();
  
  const res = NextResponse.json({
    service: 'comfyui',
    status: healthy ? 'running' : 'stopped',
    url: process.env.COMFYUI_URL || 'http://localhost:8188',
  });
  return secureResponse(res, request);
}
