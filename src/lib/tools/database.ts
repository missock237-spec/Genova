// Database Query Tool — Safe, read-only queries against the Prisma database

import type { ToolDefinition } from './registry';
import { db } from '@/lib/db';

export const databaseTool: ToolDefinition = {
  name: 'database_query',
  description: 'Interroger la base de données de l\'application pour des informations sur les agents, tâches, workflows, conversations et statistiques. Lecture seule.',
  parameters: {
    queryType: {
      type: 'string',
      description: 'Type de données à interroger: agents, tasks, workflows, conversations, stats, knowledge, executions',
      required: true,
    },
    filters: {
      type: 'object',
      description: 'Filtres à appliquer (ex: { "status": "active", "type": "sales" })',
      required: false,
    },
  },
  category: 'data',
  execute: async (params, context) => {
    const queryType = params.queryType as string;
    const filters = (params.filters as Record<string, string>) || {};
    const userId = context.userId;

    // Enforce userId filter for security
    const safeFilters = { ...filters, userId };

    try {
      switch (queryType) {
        case 'agents': {
          const agents = await db.agent.findMany({
            where: safeFilters,
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
              description: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
          });
          return { type: 'agents', count: agents.length, data: agents };
        }

        case 'tasks': {
          const tasks = await db.task.findMany({
            where: safeFilters,
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              description: true,
              result: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
          });
          return { type: 'tasks', count: tasks.length, data: tasks };
        }

        case 'workflows': {
          const workflows = await db.workflow.findMany({
            where: safeFilters,
            select: {
              id: true,
              name: true,
              status: true,
              description: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
          });
          return { type: 'workflows', count: workflows.length, data: workflows };
        }

        case 'conversations': {
          const conversations = await db.conversation.findMany({
            where: safeFilters,
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
              createdAt: true,
              messages: { select: { id: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
          });
          return {
            type: 'conversations',
            count: conversations.length,
            data: conversations.map(c => ({
              id: c.id,
              title: c.title,
              type: c.type,
              status: c.status,
              messageCount: c.messages.length,
              createdAt: c.createdAt,
            })),
          };
        }

        case 'stats': {
          const [
            agentCount,
            taskCount,
            workflowCount,
            conversationCount,
            activeAgents,
            pendingTasks,
          ] = await Promise.all([
            db.agent.count({ where: { userId } }),
            db.task.count({ where: { userId } }),
            db.workflow.count({ where: { userId } }),
            db.conversation.count({ where: { userId } }),
            db.agent.count({ where: { userId, status: 'active' } }),
            db.task.count({ where: { userId, status: 'pending' } }),
          ]);

          return {
            type: 'stats',
            data: {
              agents: { total: agentCount, active: activeAgents },
              tasks: { total: taskCount, pending: pendingTasks },
              workflows: { total: workflowCount },
              conversations: { total: conversationCount },
            },
          };
        }

        case 'knowledge': {
          const knowledge = await db.knowledge.findMany({
            where: { userId, ...(filters.category ? { category: filters.category as string } : {}) },
            select: {
              id: true,
              content: true,
              category: true,
              source: true,
              relevance: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          });
          return { type: 'knowledge', count: knowledge.length, data: knowledge };
        }

        case 'executions': {
          const executions = await db.agentExecution.findMany({
            where: { userId },
            select: {
              id: true,
              task: true,
              status: true,
              totalDuration: true,
              totalTokens: true,
              estimatedCost: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          });
          return { type: 'executions', count: executions.length, data: executions };
        }

        default:
          throw new Error(`Type de requête non supporté: ${queryType}. Types disponibles: agents, tasks, workflows, conversations, stats, knowledge, executions`);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Erreur lors de la requête à la base de données');
    }
  },
};
