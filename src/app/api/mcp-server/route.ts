/**
 * MCP Server Route — Genova MCP Protocol Endpoint
 * Accepts JSON-RPC 2.0 requests. Compatible with Cursor IDE, Claude Desktop, Windsurf.
 * Endpoints: initialize, tools/list, tools/call, resources/list, resources/read, prompts/list, prompts/get
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { applySecurity } from '@/lib/security';
import { db } from '@/lib/db';
import type { FirestoreWhereOp } from '@/lib/firebase/firestore';

export const dynamic = "force-dynamic";
const log = createLogger('mcp-server');

const MCP_SERVER_INFO = { name: 'Gen3ia AI OS', version: '1.0.0' };
const MCP_CAPABILITIES = { tools: { listChanged: true }, resources: { listChanged: true }, prompts: { listChanged: true } };
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-03-26', '2024-11-05'];

/** Filtre Firestore d'égalité (compatible facade `db`). */
const by = (field: string, value: unknown): FirestoreWhereOp => ({ field, op: '==', value });

async function handleMCPRequest(method: string, params: Record<string, unknown> | undefined, userId: string) {
  switch (method) {
    case 'initialize': {
      const p = params as { protocolVersion?: string; clientInfo?: Record<string, string> } | undefined;
      const v = p?.protocolVersion || '2024-11-05';
      const negotiated = SUPPORTED_PROTOCOL_VERSIONS.includes(v) ? v : SUPPORTED_PROTOCOL_VERSIONS[0];
      log.info('MCP init', { client: p?.clientInfo?.name || 'unknown', version: negotiated });
      return { result: { protocolVersion: negotiated, capabilities: MCP_CAPABILITIES, serverInfo: MCP_SERVER_INFO } };
    }

    case 'tools/list': {
      const connectors = await db.mCPConnector.findMany({
        where: [
          by('userId', userId),
          by('isActive', true),
          { field: 'status', op: '!=', value: 'error' },
        ],
        select: ['name', 'tools'],
      });
      const tools: any[] = [
        { name: 'genova_list_agents', description: 'Liste tous les agents Gen3ia', inputSchema: { type: 'object', properties: { status: { type: 'string' } } } },
        { name: 'genova_execute_agent', description: 'Exécute un agent', inputSchema: { type: 'object', properties: { agent_id: { type: 'string' }, message: { type: 'string' } }, required: ['agent_id', 'message'] } },
        { name: 'genova_get_credits', description: 'Solde de crédits', inputSchema: { type: 'object', properties: {} } },
        { name: 'genova_search_memory', description: 'Recherche mémoire', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
        { name: 'genova_create_agent', description: 'Crée un agent', inputSchema: { type: 'object', properties: { name: { type: 'string' }, instructions: { type: 'string' } }, required: ['name', 'instructions'] } },
      ];
      for (const c of connectors) {
        if (c.tools) try {
          const ct = typeof c.tools === 'string' ? JSON.parse(c.tools) : c.tools;
          if (Array.isArray(ct)) for (const t of ct) tools.push({ name: `${c.name}_${t.name}`, description: `[${c.name}] ${t.description || t.name}`, inputSchema: t.inputSchema || { type: 'object', properties: {} } });
        } catch {}
      }
      return { result: { tools } };
    }

    case 'tools/call': {
      const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
      const name = p?.name;
      const args = p?.arguments || {};
      if (!name) return { error: { code: -32602, message: 'Tool name required' } };
      switch (name) {
        case 'genova_list_agents': {
          const agents = await db.agent.findMany({
            where: [by('userId', userId)],
            select: ['id', 'name', 'description', 'status', 'createdAt'],
            limit: 50,
          });
          return { result: { content: [{ type: 'text', text: JSON.stringify(agents) }] } };
        }
        case 'genova_get_credits': {
          const credits = await db.credit.findFirst({
            where: [by('userId', userId)],
            select: ['balance', 'used'],
          });
          return { result: { content: [{ type: 'text', text: JSON.stringify(credits || { balance: 0, used: 0 }) }] } };
        }
        case 'genova_search_memory': {
          const q = String(args.query || '').trim().toLowerCase();
          const limit = Math.min(Number(args.limit) || 10, 50);
          const memories = (await db.agentMemory.findMany({
            where: [by('userId', userId)],
            select: ['id', 'content', 'createdAt'],
            limit: 100,
          })) as Array<Record<string, unknown>>;
          const filtered = memories
            .filter((m) => q === '' || String(m.content || '').toLowerCase().includes(q))
            .sort((a, b) => Number(new Date(b.createdAt as Date).getTime()) - Number(new Date(a.createdAt as Date).getTime()))
            .slice(0, limit);
          return { result: { content: [{ type: 'text', text: JSON.stringify(filtered) }] } };
        }
        case 'genova_execute_agent': {
          const agentId = args.agent_id as string;
          const message = args.message as string;
          if (!agentId || !message) return { error: { code: -32602, message: 'agent_id and message required' } };
          const agent = await db.agent.findUnique({ where: { id: agentId }, select: ['id', 'userId', 'name', 'status'] });
          if (!agent || agent.userId !== userId) return { error: { code: -32602, message: 'Agent not found' } };
          if (agent.status !== 'active') return { error: { code: -32602, message: 'Agent is not active' } };
          // Exécution réelle via le chat interne (fire-and-forget avec réponse rapide)
          try {
            const { createAIRouter } = await import('@/lib/ai-router');
            const agentConfig = JSON.parse((await db.agent.findUnique({
              where: { id: agentId }, select: ['config'],
            }) as Record<string, unknown> | null)?.config as string || '{}');
            const personality = (agentConfig as { personality?: string }).personality || 'helpful';
            const router = createAIRouter(userId);
            const systemPrompt = `You are ${agent.name}. Personality: ${personality}. Respond concisely.`;
            const result = await router.chat([
              { role: 'system' as const, content: systemPrompt },
              { role: 'user' as const, content: message },
            ], { model: 'default' });
            // Log l'exécution
            db.agentActionLog.create({
              data: { agentId, action: 'mcp_execute', details: JSON.stringify({ source: 'mcp-server', message: message.substring(0, 200) }), userId, status: 'completed', result: 'Executed via MCP', resolvedAt: new Date() },
            }).catch(() => {});
            return { result: { content: [{ type: 'text', text: JSON.stringify({ status: 'completed', agent: agent.name, response: result.content, model: result.model, provider: result.provider }) }] } };
          } catch (execErr) {
            log.error('MCP agent execution failed', { agentId, error: execErr instanceof Error ? execErr.message : String(execErr) });
            return { error: { code: -32000, message: `Agent execution failed: ${execErr instanceof Error ? execErr.message : 'Unknown error'}` } };
          }
        }
        default: return { error: { code: -32601, message: `Tool not found: ${name}` } };
      }
    }

    case 'resources/list':
      return { result: { resources: [
        { uri: 'genova://agents', name: 'Agents', mimeType: 'application/json' },
        { uri: 'genova://conversations', name: 'Conversations', mimeType: 'application/json' },
        { uri: 'genova://usage', name: 'Usage', mimeType: 'application/json' },
        { uri: 'genova://credits', name: 'Crédits', mimeType: 'application/json' },
      ] } };

    case 'resources/read': {
      const uri = (params as { uri?: string })?.uri;
      if (!uri) return { error: { code: -32602, message: 'URI required' } };
      const m = uri.match(/^genova:\/\/agent\/(.+)$/);
      if (uri === 'genova://agents') {
        const agents = await db.agent.findMany({
          where: [by('userId', userId)],
          select: ['id', 'name', 'description', 'status'],
        });
        return { result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(agents) }] } };
      }
      if (uri === 'genova://usage') {
        const usage = await db.creditTransaction.aggregate({
          where: [
            by('userId', userId),
            { field: 'type', op: '==', value: 'usage' },
            { field: 'createdAt', op: '>=', value: new Date(Date.now() - 30 * 86400000) },
          ],
          _sum: { amount: true },
          _count: { id: true },
        });
        const spent = Math.abs(usage._sum?.amount ?? 0);
        return { result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ spent, transactions: usage._count?.id ?? 0, period: '30d' }) }] } };
      }
      if (uri === 'genova://credits') {
        const c = await db.credit.findFirst({
          where: [by('userId', userId)],
          select: ['balance', 'used'],
        });
        return { result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(c || { balance: 0, used: 0 }) }] } };
      }
      if (m) {
        const agent = await db.agent.findUnique({ where: { id: m[1] }, select: ['id', 'name', 'description', 'model', 'status', 'userId'] });
        if (!agent || agent.userId !== userId) return { error: { code: -32602, message: 'Agent not found' } };
        return { result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(agent) }] } };
      }
      return { error: { code: -32602, message: `Resource not found: ${uri}` } };
    }

    case 'prompts/list':
      return { result: { prompts: [
        { name: 'analyze_agent_performance', description: 'Analyse performance', arguments: [{ name: 'agent_id', required: true }] },
        { name: 'debug_agent_conversation', description: 'Débogue conversation', arguments: [{ name: 'conversation_id', required: true }] },
      ] } };

    case 'prompts/get': {
      const p = params as { name?: string; arguments?: Record<string, string> } | undefined;
      if (!p?.name) return { error: { code: -32602, message: 'Prompt name required' } };
      if (p.name === 'analyze_agent_performance')
        return { result: { messages: [{ role: 'system', content: { type: 'text', text: 'Analyse de performance.' } }, { role: 'user', content: { type: 'text', text: `Agent ${p.arguments?.agent_id || '?'}` } }] } };
      if (p.name === 'debug_agent_conversation')
        return { result: { messages: [{ role: 'system', content: { type: 'text', text: 'Débogage conversation.' } }, { role: 'user', content: { type: 'text', text: `ID: ${p.arguments?.conversation_id || '?'}` } }] } };
      return { error: { code: -32602, message: `Prompt not found: ${p.name}` } };
    }

    default:
      return { error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });
  try {
    const body = await request.json();
    if (body.jsonrpc !== '2.0') return NextResponse.json({ jsonrpc: '2.0', id: body.id || null, error: { code: -32600, message: 'Invalid JSON-RPC 2.0' } }, { status: 400 });
    if (body.method.startsWith('notifications/')) return new NextResponse(null, { status: 202 });
    const { result, error } = await handleMCPRequest(body.method, body.params, auth.userId);
    return NextResponse.json({ jsonrpc: '2.0', id: body.id, ...(error ? { error } : { result }) });
  } catch (_e) {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ server: MCP_SERVER_INFO, protocol: 'model-context-protocol', endpoints: ['POST /api/mcp-server'], note: 'Send JSON-RPC 2.0 POST requests to this endpoint' });
}