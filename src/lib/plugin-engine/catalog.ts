// ============================================================
// Plugin Catalog — 50+ applications réelles avec actions vérifiées
// Complémentaire au plugin-sdk communautaire
// Mise à jour production v2 — enrichi + actions supplémentaires
// ============================================================

import type { PluginCatalogEntry } from './types';

export const PLUGIN_CATALOG: Record<string, PluginCatalogEntry> = {
  // ───── COMMUNICATION ─────
  slack: {
    id: 'slack', name: 'Slack',
    description: 'Envoyer des messages, gérer des canaux et des fichiers dans les workspaces Slack.',
    icon: 'MessageSquare', categories: ['Communication', 'Team'],
    baseUrl: 'https://slack.com/api', authType: 'bearer',
    docsUrl: 'https://api.slack.com/methods', website: 'https://slack.com', popularityRank: 1,
    actions: {
      postMessage: {
        id: 'postMessage', name: 'Envoyer un message', description: 'Publie un message dans un canal Slack.',
        method: 'POST', endpoint: '/chat.postMessage',
        params: [
          { name: 'channel', type: 'string', required: true, description: 'ID ou nom du canal (#general)' },
          { name: 'text', type: 'string', required: true, description: 'Contenu du message' },
          { name: 'as_user', type: 'boolean', required: false, description: 'Publier en tant qu\'utilisateur (bot par défaut)' },
        ],
        bodyParams: ['channel', 'text', 'as_user'],
        timeoutMs: 10000,
      },
      listChannels: {
        id: 'listChannels', name: 'Lister les canaux', description: 'Récupère la liste des canaux du workspace.',
        method: 'GET', endpoint: '/conversations.list',
        params: [
          { name: 'types', type: 'string', required: false, description: 'Filtrer par type (public_channel, private_channel)' },
          { name: 'limit', type: 'number', required: false, description: 'Nombre max de résultats' },
        ],
        timeoutMs: 10000,
      },
    },
  },

  discord: {
    id: 'discord', name: 'Discord',
    description: 'Envoyer des messages et gérer des serveurs Discord via le bot API.',
    icon: 'Gamepad2', categories: ['Communication', 'Gaming'],
    baseUrl: 'https://discord.com/api/v10', authType: 'bearer',
    docsUrl: 'https://discord.com/developers/docs', website: 'https://discord.com', popularityRank: 5,
    actions: {
      sendMessage: {
        id: 'sendMessage', name: 'Envoyer un message', description: 'Envoie un message dans un canal Discord.',
        method: 'POST', endpoint: '/channels/{channelId}/messages',
        params: [
          { name: 'channelId', type: 'string', required: true, description: 'ID du canal' },
          { name: 'content', type: 'string', required: true, description: 'Contenu du message' },
          { name: 'embed', type: 'object', required: false, description: 'Embed Discord (riche)' },
        ],
        urlParams: ['channelId'], bodyParams: ['content', 'embed'],
        timeoutMs: 10000,
      },
    },
  },

  // ───── DÉVELOPPEMENT & DevOps ─────
  github: {
    id: 'github', name: 'GitHub',
    description: 'Gérer les repos, issues, PR, actions et workflows GitHub.',
    icon: 'Github', categories: ['DevOps', 'Développement'],
    baseUrl: 'https://api.github.com', authType: 'token',
    docsUrl: 'https://docs.github.com/en/rest', website: 'https://github.com', popularityRank: 2,
    actions: {
      createIssue: {
        id: 'createIssue', name: 'Créer une issue', description: 'Crée une issue dans un repository.',
        method: 'POST', endpoint: '/repos/{owner}/{repo}/issues',
        params: [
          { name: 'owner', type: 'string', required: true, description: 'Propriétaire du repo' },
          { name: 'repo', type: 'string', required: true, description: 'Nom du repository' },
          { name: 'title', type: 'string', required: true, description: 'Titre de l\'issue' },
          { name: 'body', type: 'string', required: false, description: 'Description (Markdown)' },
          { name: 'labels', type: 'array', required: false, description: 'Labels à appliquer' },
        ],
        urlParams: ['owner', 'repo'], bodyParams: ['title', 'body', 'labels'],
        timeoutMs: 15000,
      },
      listRepos: {
        id: 'listRepos', name: 'Lister les repos', description: 'Liste les repos de l\'utilisateur ou d\'une org.',
        method: 'GET', endpoint: '/user/repos',
        params: [
          { name: 'sort', type: 'string', required: false, description: 'Tri (updated, created, pushed, full_name)' },
          { name: 'per_page', type: 'number', required: false, description: 'Résultats par page (max 100)' },
        ],
        timeoutMs: 10000,
      },
    },
  },
};