// ============================================================
// Plugin Catalog — 50+ applications réelles avec actions vérifiées
// Complémentaire au plugin-sdk communautaire
// Mise à jour production v2 — enrichi + actions supplémentaires
// ============================================================

import type { PluginCatalogEntry } from './types';

export const PLUGIN_CATALOG: Record<string, PluginCatalogEntry> = {
  // ───────────────────────────────────────────────
  // COMMUNICATION
  // ───────────────────────────────────────────────
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

  // ───────────────────────────────────────────────
  // DÉVELOPPEMENT & DevOps
  // ───────────────────────────────────────────────
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
      createWebhook: {
        id: 'createWebhook', name: 'Créer un webhook', description: 'Ajoute un webhook à un repo.',
        method: 'POST', endpoint: '/repos/{owner}/{repo}/hooks',
        params: [
          { name: 'owner', type: 'string', required: true, description: 'Propriétaire' },
          { name: 'repo', type: 'string', required: true, description: 'Nom du repo' },
          { name: 'config_url', type: 'string', required: true, description: 'URL du webhook' },
          { name: 'events', type: 'array', required: false, description: 'Événements (push, issues, ...)' },
        ],
        urlParams: ['owner', 'repo'],
        bodyParams: ['config_url', 'events'],
        timeoutMs: 10000,
      },
    },
  },

  gitlab: {
    id: 'gitlab', name: 'GitLab',
    description: 'Gérer les projets, pipelines et issues GitLab.',
    icon: 'GitBranch', categories: ['DevOps', 'CI/CD'],
    baseUrl: 'https://gitlab.com/api/v4', authType: 'bearer',
    docsUrl: 'https://docs.gitlab.com/ee/api/', website: 'https://gitlab.com', popularityRank: 15,
    actions: {
      createIssue: {
        id: 'createIssue', name: 'Créer une issue', description: 'Crée une issue dans un projet GitLab.',
        method: 'POST', endpoint: '/projects/{projectId}/issues',
        params: [
          { name: 'projectId', type: 'string', required: true, description: 'ID du projet' },
          { name: 'title', type: 'string', required: true, description: 'Titre' },
          { name: 'description', type: 'string', required: false, description: 'Description' },
        ],
        urlParams: ['projectId'], bodyParams: ['title', 'description'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // PRODUCTIVITÉ
  // ───────────────────────────────────────────────
  notion: {
    id: 'notion', name: 'Notion',
    description: 'Créer, mettre à jour et interroger des pages et bases de données Notion.',
    icon: 'BookOpen', categories: ['Productivité', 'Base de données'],
    baseUrl: 'https://api.notion.com/v1', authType: 'bearer',
    docsUrl: 'https://developers.notion.com/reference/intro', website: 'https://notion.so', popularityRank: 3,
    actions: {
      createPage: {
        id: 'createPage', name: 'Créer une page', description: 'Crée une page dans un workspace Notion.',
        method: 'POST', endpoint: '/pages',
        params: [
          { name: 'parent', type: 'object', required: true, description: 'Parent (database_id ou page_id)' },
          { name: 'properties', type: 'object', required: true, description: 'Propriétés de la page' },
          { name: 'children', type: 'array', required: false, description: 'Blocs de contenu' },
        ],
        bodyParams: ['parent', 'properties', 'children'],
        timeoutMs: 15000,
      },
      queryDatabase: {
        id: 'queryDatabase', name: 'Interroger une base', description: 'Requête une base de données Notion avec filtres.',
        method: 'POST', endpoint: '/databases/{databaseId}/query',
        params: [
          { name: 'databaseId', type: 'string', required: true, description: 'ID de la base' },
          { name: 'filter', type: 'object', required: false, description: 'Filtre Notion' },
          { name: 'sorts', type: 'array', required: false, description: 'Tri' },
        ],
        urlParams: ['databaseId'], bodyParams: ['filter', 'sorts'],
        timeoutMs: 15000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // PAIEMENT & FINANCE
  // ───────────────────────────────────────────────
  stripe: {
    id: 'stripe', name: 'Stripe',
    description: 'Traiter les paiements, gérer les clients, abonnements et factures.',
    icon: 'CreditCard', categories: ['Paiement', 'Finance'],
    baseUrl: 'https://api.stripe.com/v1', authType: 'basic',
    docsUrl: 'https://stripe.com/docs/api', website: 'https://stripe.com', popularityRank: 4,
    actions: {
      createCustomer: {
        id: 'createCustomer', name: 'Créer un client', description: 'Crée un client Stripe.',
        method: 'POST', endpoint: '/customers',
        params: [
          { name: 'email', type: 'string', required: true, description: 'Email du client' },
          { name: 'name', type: 'string', required: false, description: 'Nom affiché' },
          { name: 'metadata', type: 'object', required: false, description: 'Métadonnées clé-valeur' },
        ],
        bodyParams: ['email', 'name', 'metadata'],
        timeoutMs: 10000,
      },
      createPaymentIntent: {
        id: 'createPaymentIntent', name: 'Créer un PaymentIntent', description: 'Initie un paiement.',
        method: 'POST', endpoint: '/payment_intents',
        params: [
          { name: 'amount', type: 'number', required: true, description: 'Montant en centimes' },
          { name: 'currency', type: 'string', required: true, description: 'Devise (eur, usd, ...)' },
          { name: 'customer', type: 'string', required: false, description: 'ID client' },
          { name: 'metadata', type: 'object', required: false, description: 'Métadonnées' },
        ],
        bodyParams: ['amount', 'currency', 'customer', 'metadata'],
        timeoutMs: 15000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // IA & LLM
  // ───────────────────────────────────────────────
  openai: {
    id: 'openai', name: 'OpenAI',
    description: 'Appeler les modèles GPT-4o, DALL-E, Whisper et TTS d\'OpenAI.',
    icon: 'Sparkles', categories: ['IA', 'LLM'],
    baseUrl: 'https://api.openai.com/v1', authType: 'bearer',
    docsUrl: 'https://platform.openai.com/docs/api-reference', website: 'https://openai.com', popularityRank: 6,
    actions: {
      chatCompletion: {
        id: 'chatCompletion', name: 'Chat Completion', description: 'Génère une réponse avec un modèle de chat.',
        method: 'POST', endpoint: '/chat/completions',
        params: [
          { name: 'model', type: 'string', required: true, description: 'Modèle (gpt-4o, gpt-4o-mini, ...)' },
          { name: 'messages', type: 'array', required: true, description: 'Messages de conversation' },
          { name: 'max_tokens', type: 'number', required: false, description: 'Token max' },
          { name: 'temperature', type: 'number', required: false, description: 'Température (0-2)' },
        ],
        bodyParams: ['model', 'messages', 'max_tokens', 'temperature'],
        timeoutMs: 60000,
      },
    },
  },

  anthropic: {
    id: 'anthropic', name: 'Anthropic Claude',
    description: 'Appeler les modèles Claude d\'Anthropic.',
    icon: 'Brain', categories: ['IA', 'LLM'],
    baseUrl: 'https://api.anthropic.com/v1', authType: 'api_key_header',
    docsUrl: 'https://docs.anthropic.com/en/api', website: 'https://anthropic.com', popularityRank: 7,
    actions: {
      createMessage: {
        id: 'createMessage', name: 'Créer un message', description: 'Génère une réponse Claude.',
        method: 'POST', endpoint: '/messages',
        params: [
          { name: 'model', type: 'string', required: true, description: 'Modèle (claude-sonnet-4-20250514, ...)' },
          { name: 'max_tokens', type: 'number', required: true, description: 'Token max' },
          { name: 'messages', type: 'array', required: true, description: 'Messages' },
        ],
        bodyParams: ['model', 'max_tokens', 'messages'],
        timeoutMs: 60000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // CRM & MARKETING
  // ───────────────────────────────────────────────
  hubspot: {
    id: 'hubspot', name: 'HubSpot',
    description: 'Gérer les contacts, deals et companies dans HubSpot CRM.',
    icon: 'Building', categories: ['CRM', 'Marketing'],
    baseUrl: 'https://api.hubapi.com', authType: 'bearer',
    docsUrl: 'https://developers.hubspot.com/docs/api', website: 'https://hubspot.com', popularityRank: 10,
    actions: {
      createContact: {
        id: 'createContact', name: 'Créer un contact', description: 'Crée un contact dans HubSpot.',
        method: 'POST', endpoint: '/crm/v3/objects/contacts',
        params: [
          { name: 'email', type: 'string', required: true, description: 'Email' },
          { name: 'firstname', type: 'string', required: false, description: 'Prénom' },
          { name: 'lastname', type: 'string', required: false, description: 'Nom' },
        ],
        bodyParams: ['email', 'firstname', 'lastname'],
        timeoutMs: 10000,
      },
    },
  },

  mailchimp: {
    id: 'mailchimp', name: 'Mailchimp',
    description: 'Gérer les audiences, campagnes et templates d\'emails.',
    icon: 'Mail', categories: ['Email', 'Marketing'],
    baseUrl: 'https://{dc}.api.mailchimp.com/3.0', authType: 'basic',
    docsUrl: 'https://mailchimp.com/developer/marketing/api/', website: 'https://mailchimp.com', popularityRank: 20,
    actions: {
      addMember: {
        id: 'addMember', name: 'Ajouter un membre', description: 'Ajoute un contact à une audience.',
        method: 'POST', endpoint: '/lists/{listId}/members',
        params: [
          { name: 'listId', type: 'string', required: true, description: 'ID de la liste' },
          { name: 'email_address', type: 'string', required: true, description: 'Email du membre' },
          { name: 'status', type: 'string', required: false, description: 'subscribed ou unsubscribed' },
        ],
        urlParams: ['listId'], bodyParams: ['email_address', 'status'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // CLOUD & INFRASTRUCTURE
  // ───────────────────────────────────────────────
  aws: {
    id: 'aws', name: 'AWS',
    description: 'Interagir avec les services AWS (S3, Lambda, EC2, SQS, SNS, ...).',
    icon: 'Cloud', categories: ['Cloud', 'Infrastructure'],
    baseUrl: 'https://{service}.{region}.amazonaws.com', authType: 'bearer',
    docsUrl: 'https://docs.aws.amazon.com/', website: 'https://aws.amazon.com', popularityRank: 8,
    actions: {
      s3PutObject: {
        id: 's3PutObject', name: 'Uploader sur S3', description: 'Uploade un objet dans un bucket S3.',
        method: 'PUT', endpoint: '/{bucket}/{key}',
        params: [
          { name: 'bucket', type: 'string', required: true, description: 'Nom du bucket' },
          { name: 'key', type: 'string', required: true, description: 'Clé de l\'objet' },
          { name: 'body', type: 'string', required: false, description: 'Contenu (texte)' },
        ],
        urlParams: ['bucket', 'key'],
        timeoutMs: 30000,
      },
    },
  },

  vercel: {
    id: 'vercel', name: 'Vercel',
    description: 'Déployer, lister et gérer les projets et déploiements Vercel.',
    icon: 'Triangle', categories: ['Cloud', 'Déploiement'],
    baseUrl: 'https://api.vercel.com/v9', authType: 'bearer',
    docsUrl: 'https://vercel.com/docs/api', website: 'https://vercel.com', popularityRank: 12,
    actions: {
      listDeployments: {
        id: 'listDeployments', name: 'Lister les déploiements', description: 'Liste les déploiements d\'un projet.',
        method: 'GET', endpoint: '/deployments',
        params: [
          { name: 'projectId', type: 'string', required: true, description: 'ID du projet' },
          { name: 'limit', type: 'number', required: false, description: 'Nombre max' },
        ],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // STOCKAGE & FICHIERS
  // ───────────────────────────────────────────────
  googledrive: {
    id: 'googledrive', name: 'Google Drive',
    description: 'Uploader, lister et partager des fichiers sur Google Drive.',
    icon: 'HardDrive', categories: ['Stockage', 'Productivité'],
    baseUrl: 'https://www.googleapis.com/drive/v3', authType: 'bearer',
    docsUrl: 'https://developers.google.com/drive/api/v3/reference', website: 'https://drive.google.com', popularityRank: 9,
    actions: {
      listFiles: {
        id: 'listFiles', name: 'Lister les fichiers', description: 'Liste les fichiers d\'un dossier.',
        method: 'GET', endpoint: '/files',
        params: [
          { name: 'q', type: 'string', required: false, description: 'Requête de recherche' },
          { name: 'pageSize', type: 'number', required: false, description: 'Taille de page' },
        ],
        timeoutMs: 10000,
      },
    },
  },

  dropbox: {
    id: 'dropbox', name: 'Dropbox',
    description: 'Gérer les fichiers et dossiers Dropbox.',
    icon: 'Folder', categories: ['Stockage'],
    baseUrl: 'https://api.dropboxapi.com/2', authType: 'bearer',
    docsUrl: 'https://www.dropbox.com/developers/documentation', website: 'https://dropbox.com', popularityRank: 25,
    actions: {
      listFolder: {
        id: 'listFolder', name: 'Lister un dossier', description: 'Liste le contenu d\'un dossier.',
        method: 'POST', endpoint: '/files/list_folder',
        params: [
          { name: 'path', type: 'string', required: false, description: 'Chemin du dossier (défaut: racine)' },
        ],
        bodyParams: ['path'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // PROJECT MANAGEMENT
  // ───────────────────────────────────────────────
  jira: {
    id: 'jira', name: 'Jira',
    description: 'Créer et gérer les tickets, sprints et projets Jira.',
    icon: 'Ticket', categories: ['Project Management', 'DevOps'],
    baseUrl: 'https://{domain}/rest/api/3', authType: 'basic',
    docsUrl: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/', website: 'https://www.atlassian.com/software/jira', popularityRank: 11,
    actions: {
      createIssue: {
        id: 'createIssue', name: 'Créer un ticket', description: 'Crée un ticket Jira.',
        method: 'POST', endpoint: '/issue/{projectKey}',
        params: [
          { name: 'projectKey', type: 'string', required: true, description: 'Clé du projet (ex: PROJ)' },
          { name: 'summary', type: 'string', required: true, description: 'Résumé du ticket' },
          { name: 'description', type: 'string', required: false, description: 'Description' },
          { name: 'issuetype_name', type: 'string', required: false, description: 'Type (Bug, Task, Story)' },
        ],
        urlParams: ['projectKey'], bodyParams: ['summary', 'description', 'issuetype_name'],
        timeoutMs: 10000,
      },
    },
  },

  trello: {
    id: 'trello', name: 'Trello',
    description: 'Gérer les boards, listes et cartes Trello.',
    icon: 'LayoutGrid', categories: ['Project Management'],
    baseUrl: 'https://api.trello.com/1', authType: 'bearer',
    docsUrl: 'https://developer.atlassian.com/cloud/trello/rest/api-intro/', website: 'https://trello.com', popularityRank: 18,
    actions: {
      createCard: {
        id: 'createCard', name: 'Créer une carte', description: 'Ajoute une carte à une liste Trello.',
        method: 'POST', endpoint: '/cards',
        params: [
          { name: 'idList', type: 'string', required: true, description: 'ID de la liste' },
          { name: 'name', type: 'string', required: true, description: 'Nom de la carte' },
          { name: 'desc', type: 'string', required: false, description: 'Description' },
        ],
        bodyParams: ['idList', 'name', 'desc'],
        timeoutMs: 10000,
      },
    },
  },

  asana: {
    id: 'asana', name: 'Asana',
    description: 'Gérer les tâches, projets et équipes Asana.',
    icon: 'CheckSquare', categories: ['Project Management'],
    baseUrl: 'https://app.asana.com/api/1.0', authType: 'bearer',
    docsUrl: 'https://developers.asana.com/docs/', website: 'https://asana.com', popularityRank: 22,
    actions: {
      createTask: {
        id: 'createTask', name: 'Créer une tâche', description: 'Crée une tâche dans un projet.',
        method: 'POST', endpoint: '/tasks',
        params: [
          { name: 'name', type: 'string', required: true, description: 'Nom de la tâche' },
          { name: 'workspace', type: 'string', required: true, description: 'ID du workspace' },
          { name: 'projects', type: 'array', required: false, description: 'ID des projets' },
        ],
        bodyParams: ['name', 'workspace', 'projects'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // EMAIL TRANSACTIONNEL
  // ───────────────────────────────────────────────
  sendgrid: {
    id: 'sendgrid', name: 'SendGrid',
    description: 'Envoyer des emails transactionnels via l\'API SendGrid.',
    icon: 'Send', categories: ['Email', 'Communication'],
    baseUrl: 'https://api.sendgrid.com/v3', authType: 'bearer',
    docsUrl: 'https://docs.sendgrid.com/api-reference/', website: 'https://sendgrid.com', popularityRank: 14,
    actions: {
      sendEmail: {
        id: 'sendEmail', name: 'Envoyer un email', description: 'Envoie un email via SendGrid.',
        method: 'POST', endpoint: '/mail/send',
        params: [
          { name: 'to', type: 'string', required: true, description: 'Email destinataire' },
          { name: 'from', type: 'string', required: true, description: 'Email expéditeur' },
          { name: 'subject', type: 'string', required: true, description: 'Sujet' },
          { name: 'content', type: 'string', required: true, description: 'Contenu (HTML ou texte)' },
        ],
        bodyParams: ['personalizations', 'from', 'subject', 'content'],
        timeoutMs: 15000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // COMMUNICATIONS UNIFIEES
  // ───────────────────────────────────────────────
  twilio: {
    id: 'twilio', name: 'Twilio',
    description: 'Envoyer des SMS, gérer les appels et les numéros Twilio.',
    icon: 'Phone', categories: ['SMS', 'Communication'],
    baseUrl: 'https://api.twilio.com/2010-04-01', authType: 'basic',
    docsUrl: 'https://www.twilio.com/docs/usage/api', website: 'https://twilio.com', popularityRank: 13,
    actions: {
      sendSms: {
        id: 'sendSms', name: 'Envoyer un SMS', description: 'Envoie un SMS via Twilio.',
        method: 'POST', endpoint: '/Accounts/{accountSid}/Messages.json',
        params: [
          { name: 'accountSid', type: 'string', required: true, description: 'SID du compte' },
          { name: 'To', type: 'string', required: true, description: 'Numéro destinataire' },
          { name: 'From', type: 'string', required: true, description: 'Numéro expéditeur Twilio' },
          { name: 'Body', type: 'string', required: true, description: 'Contenu du message' },
        ],
        urlParams: ['accountSid'], bodyParams: ['To', 'From', 'Body'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // E-COMMERCE
  // ───────────────────────────────────────────────
  shopify: {
    id: 'shopify', name: 'Shopify',
    description: 'Gérer les produits, commandes et clients d\'une boutique Shopify.',
    icon: 'ShoppingBag', categories: ['E-commerce'],
    baseUrl: 'https://{shop}.myshopify.com/admin/api/2025-01', authType: 'bearer',
    docsUrl: 'https://shopify.dev/docs/api/admin-rest', website: 'https://shopify.com', popularityRank: 16,
    actions: {
      listProducts: {
        id: 'listProducts', name: 'Lister les produits', description: 'Récupère les produits de la boutique.',
        method: 'GET', endpoint: '/products.json',
        params: [
          { name: 'limit', type: 'number', required: false, description: 'Nombre max de produits' },
        ],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // RESEAUX SOCIAUX & MARKETING
  // ───────────────────────────────────────────────
  twitter: {
    id: 'twitter', name: 'X (Twitter)',
    description: "Publier des tweets, gérer les timelines et les listes sur X.",
    icon: 'Twitter', categories: ['Réseaux sociaux', 'Marketing'],
    baseUrl: 'https://api.twitter.com/2', authType: 'bearer',
    docsUrl: 'https://developer.twitter.com/en/docs/twitter-api', website: 'https://x.com', popularityRank: 17,
    actions: {
      createTweet: {
        id: 'createTweet', name: 'Publier un tweet', description: 'Publie un nouveau tweet.',
        method: 'POST', endpoint: '/tweets',
        params: [
          { name: 'text', type: 'string', required: true, description: 'Contenu du tweet (max 280 caractères)' },
          { name: 'reply_to', type: 'string', required: false, description: 'ID du tweet auquel répondre' },
        ],
        bodyParams: ['text', 'reply_to'],
        timeoutMs: 10000,
      },
      getUserTweets: {
        id: 'getUserTweets', name: 'Tweets utilisateur', description: "Récupère les tweets d'un utilisateur.",
        method: 'GET', endpoint: '/users/{userId}/tweets',
        params: [
          { name: 'userId', type: 'string', required: true, description: 'ID de l\'utilisateur' },
          { name: 'max_results', type: 'number', required: false, description: 'Nombre max (5-100)' },
        ],
        urlParams: ['userId'],
        timeoutMs: 10000,
      },
    },
  },

  facebook: {
    id: 'facebook', name: 'Facebook (Meta)',
    description: 'Publier sur les pages Facebook et gérer les publications.',
    icon: 'Facebook', categories: ['Réseaux sociaux', 'Marketing'],
    baseUrl: 'https://graph.facebook.com/v19.0', authType: 'bearer',
    docsUrl: 'https://developers.facebook.com/docs/graph-api', website: 'https://facebook.com', popularityRank: 19,
    actions: {
      publishPost: {
        id: 'publishPost', name: 'Publier un post', description: 'Publie sur une page Facebook.',
        method: 'POST', endpoint: '/{pageId}/feed',
        params: [
          { name: 'pageId', type: 'string', required: true, description: 'ID de la page' },
          { name: 'message', type: 'string', required: true, description: 'Contenu du post' },
          { name: 'link', type: 'string', required: false, description: 'URL à joindre' },
        ],
        urlParams: ['pageId'], bodyParams: ['message', 'link'],
        timeoutMs: 10000,
      },
    },
  },

  linkedin: {
    id: 'linkedin', name: 'LinkedIn',
    description: "Publier des posts et gérer le profil LinkedIn via l'API v2.",
    icon: 'Linkedin', categories: ['Réseaux sociaux', 'Professional'],
    baseUrl: 'https://api.linkedin.com/v2', authType: 'bearer',
    docsUrl: 'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/ugc-post-api', website: 'https://linkedin.com', popularityRank: 21,
    actions: {
      createPost: {
        id: 'createPost', name: 'Publier un post', description: 'Publie un post UGC sur LinkedIn.',
        method: 'POST', endpoint: '/ugcPosts',
        params: [
          { name: 'author', type: 'string', required: true, description: 'URN de l\'auteur (urn:li:person:...)' },
          { name: 'text', type: 'string', required: true, description: 'Contenu du post' },
        ],
        bodyParams: ['author', 'text'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // VIDEO & STREAMING
  // ───────────────────────────────────────────────
  youtube: {
    id: 'youtube', name: 'YouTube',
    description: 'Gérer les vidéos, playlists et chaînes YouTube via Data API v3.',
    icon: 'Youtube', categories: ['Vidéo', 'Streaming'],
    baseUrl: 'https://www.googleapis.com/youtube/v3', authType: 'bearer',
    docsUrl: 'https://developers.google.com/youtube/v3', website: 'https://youtube.com', popularityRank: 23,
    actions: {
      listVideos: {
        id: 'listVideos', name: 'Lister les vidéos', description: 'Récupère les vidéos d\'une chaîne.',
        method: 'GET', endpoint: '/search',
        params: [
          { name: 'channelId', type: 'string', required: true, description: 'ID de la chaîne' },
          { name: 'maxResults', type: 'number', required: false, description: 'Nombre max (1-50)' },
          { name: 'type', type: 'string', required: false, description: 'Type de ressource (video)' },
        ],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // SALESFORCE & CRM AVANCÉ
  // ───────────────────────────────────────────────
  salesforce: {
    id: 'salesforce', name: 'Salesforce',
    description: "Créer et gérer leads, contacts, opportunities dans Salesforce CRM.",
    icon: 'Database', categories: ['CRM', 'Enterprise'],
    baseUrl: 'https://{instance}.my.salesforce.com/services/data/v59.0', authType: 'bearer',
    docsUrl: 'https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta', website: 'https://salesforce.com', popularityRank: 24,
    actions: {
      createLead: {
        id: 'createLead', name: 'Créer un lead', description: 'Crée un lead dans Salesforce.',
        method: 'POST', endpoint: '/sobjects/Lead',
        params: [
          { name: 'FirstName', type: 'string', required: true, description: 'Prénom' },
          { name: 'LastName', type: 'string', required: true, description: 'Nom' },
          { name: 'Email', type: 'string', required: true, description: 'Email' },
          { name: 'Company', type: 'string', required: false, description: 'Entreprise' },
        ],
        bodyParams: ['FirstName', 'LastName', 'Email', 'Company'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // AUTOMATISATION
  // ───────────────────────────────────────────────
  zapier: {
    id: 'zapier', name: 'Zapier',
    description: "Déclencher des Zaps et gérer les automatisations Zapier.",
    icon: 'Zap', categories: ['Automatisation', 'Productivité'],
    baseUrl: 'https://hooks.zapier.com/hooks/catch', authType: 'bearer',
    docsUrl: 'https://zapier.com/developer/documentation/v2/', website: 'https://zapier.com', popularityRank: 26,
    actions: {
      triggerZap: {
        id: 'triggerZap', name: 'Déclencher un Zap', description: 'Envoie des données à un webhook Zapier.',
        method: 'POST', endpoint: '/{hookId}/{secret}',
        params: [
          { name: 'hookId', type: 'string', required: true, description: 'ID du webhook Zapier' },
          { name: 'secret', type: 'string', required: true, description: 'Secret du webhook' },
          { name: 'data', type: 'object', required: false, description: 'Données à transmettre au Zap' },
        ],
        urlParams: ['hookId', 'secret'], bodyParams: ['data'],
        timeoutMs: 15000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // COLLABORATION & DESIGN
  // ───────────────────────────────────────────────
  figma: {
    id: 'figma', name: 'Figma',
    description: "Récupérer des fichiers, composants et commentaires Figma.",
    icon: 'Palette', categories: ['Design', 'Collaboration'],
    baseUrl: 'https://api.figma.com/v1', authType: 'bearer',
    docsUrl: 'https://www.figma.com/developers/api', website: 'https://figma.com', popularityRank: 27,
    actions: {
      getFile: {
        id: 'getFile', name: 'Récupérer un fichier', description: 'Récupère les métadonnées d\'un fichier Figma.',
        method: 'GET', endpoint: '/files/{fileKey}',
        params: [
          { name: 'fileKey', type: 'string', required: true, description: 'Clé du fichier Figma' },
        ],
        urlParams: ['fileKey'],
        timeoutMs: 15000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // TICKETING & SUPPORT
  // ───────────────────────────────────────────────
  zendesk: {
    id: 'zendesk', name: 'Zendesk',
    description: 'Créer et gérer des tickets de support Zendesk.',
    icon: 'Headphones', categories: ['Support', 'Ticketing'],
    baseUrl: 'https://{subdomain}.zendesk.com/api/v2', authType: 'basic',
    docsUrl: 'https://developer.zendesk.com/api-reference/ticketing/tickets', website: 'https://zendesk.com', popularityRank: 28,
    actions: {
      createTicket: {
        id: 'createTicket', name: 'Créer un ticket', description: 'Crée un ticket de support.',
        method: 'POST', endpoint: '/tickets.json',
        params: [
          { name: 'subject', type: 'string', required: true, description: 'Sujet du ticket' },
          { name: 'comment_body', type: 'string', required: true, description: 'Description / premier message' },
          { name: 'priority', type: 'string', required: false, description: 'Priorité (urgent, high, normal, low)' },
        ],
        bodyParams: ['subject', 'comment_body', 'priority'],
        timeoutMs: 10000,
      },
    },
  },

  intercom: {
    id: 'intercom', name: 'Intercom',
    description: 'Gérer les conversations et contacts dans Intercom.',
    icon: 'MessageCircle', categories: ['Support', 'Communication'],
    baseUrl: 'https://api.intercom.io', authType: 'bearer',
    docsUrl: 'https://developers.intercom.com/docs/references/rest-api-api.intercom.io/', website: 'https://intercom.com', popularityRank: 29,
    actions: {
      sendMessage: {
        id: 'sendMessage', name: 'Envoyer un message', description: 'Envoie un message in-app ou email via Intercom.',
        method: 'POST', endpoint: '/messages',
        params: [
          { name: 'message_type', type: 'string', required: true, description: 'inapp ou email' },
          { name: 'body', type: 'string', required: true, description: 'Corps du message (plaintext)' },
          { name: 'to_user_id', type: 'string', required: false, description: 'ID du contact destinataire' },
        ],
        bodyParams: ['message_type', 'body', 'to_user_id'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // DEVOPS & MONITORING
  // ───────────────────────────────────────────────
  linear: {
    id: 'linear', name: 'Linear',
    description: 'Créer et gérer les issues, projets et cycles Linear.',
    icon: 'ArrowRight', categories: ['Project Management', 'DevOps'],
    baseUrl: 'https://api.linear.app/graphql', authType: 'bearer',
    docsUrl: 'https://linear.app/docs/api', website: 'https://linear.app', popularityRank: 30,
    actions: {
      createIssue: {
        id: 'createIssue', name: 'Créer une issue', description: 'Crée une issue dans un projet Linear (GraphQL).',
        method: 'POST', endpoint: '/graphql',
        params: [
          { name: 'teamId', type: 'string', required: true, description: 'ID de l\'équipe' },
          { name: 'title', type: 'string', required: true, description: 'Titre' },
          { name: 'description', type: 'string', required: false, description: 'Description (Markdown)' },
        ],
        bodyParams: ['teamId', 'title', 'description'],
        timeoutMs: 10000,
      },
    },
  },

  datadog: {
    id: 'datadog', name: 'Datadog',
    description: 'Envoyer des métriques et des événements à Datadog.',
    icon: 'Activity', categories: ['Monitoring', 'DevOps'],
    baseUrl: 'https://api.datadoghq.com/api/v1', authType: 'api_key_header',
    docsUrl: 'https://docs.datadoghq.com/api/', website: 'https://datadoghq.com', popularityRank: 31,
    actions: {
      postEvent: {
        id: 'postEvent', name: 'Envoyer un événement', description: 'Envoie un événement au event stream.',
        method: 'POST', endpoint: '/events',
        params: [
          { name: 'title', type: 'string', required: true, description: 'Titre de l\'événement' },
          { name: 'text', type: 'string', required: true, description: 'Description' },
          { name: 'priority', type: 'string', required: false, description: 'normal ou low' },
        ],
        bodyParams: ['title', 'text', 'priority'],
        timeoutMs: 10000,
      },
    },
  },

  pagerduty: {
    id: 'pagerduty', name: 'PagerDuty',
    description: 'Créer et gérer des incidents PagerDuty.',
    icon: 'AlertTriangle', categories: ['Monitoring', 'Incident'],
    baseUrl: 'https://api.pagerduty.com', authType: 'bearer',
    docsUrl: 'https://developer.pagerduty.com/docs/rest-api-v2/', website: 'https://pagerduty.com', popularityRank: 32,
    actions: {
      createIncident: {
        id: 'createIncident', name: 'Créer un incident', description: 'Déclenche un incident.',
        method: 'POST', endpoint: '/incidents',
        params: [
          { name: 'title', type: 'string', required: true, description: 'Titre de l\'incident' },
          { name: 'service_id', type: 'string', required: true, description: 'ID du service' },
          { name: 'urgency', type: 'string', required: false, description: 'high ou low' },
        ],
        bodyParams: ['title', 'service_id', 'urgency'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // BASES DE DONNÉES & BACKEND
  // ───────────────────────────────────────────────
  supabase: {
    id: 'supabase', name: 'Supabase',
    description: 'Interroger et gérer les données Supabase (Postgres, Auth, Storage).',
    icon: 'Database', categories: ['Base de données', 'Backend'],
    baseUrl: 'https://{projectId}.supabase.co/rest/v1', authType: 'bearer',
    docsUrl: 'https://supabase.com/docs/guides/api', website: 'https://supabase.com', popularityRank: 33,
    actions: {
      queryTable: {
        id: 'queryTable', name: 'Interroger une table', description: 'SELECT sur une table Supabase.',
        method: 'GET', endpoint: '/{tableName}',
        params: [
          { name: 'tableName', type: 'string', required: true, description: 'Nom de la table' },
          { name: 'select', type: 'string', required: false, description: 'Colonnes à sélectionner' },
          { name: 'limit', type: 'number', required: false, description: 'Nombre max de lignes' },
        ],
        urlParams: ['tableName'],
        timeoutMs: 10000,
      },
    },
  },

  airtable: {
    id: 'airtable', name: 'Airtable',
    description: 'Créer, lire et mettre à jour des enregistrements Airtable.',
    icon: 'Table', categories: ['Base de données', 'Productivité'],
    baseUrl: 'https://api.airtable.com/v0/{baseId}', authType: 'bearer',
    docsUrl: 'https://airtable.com/developers/web/api/introduction', website: 'https://airtable.com', popularityRank: 34,
    actions: {
      listRecords: {
        id: 'listRecords', name: 'Lister les enregistrements', description: 'Liste les records d\'une table.',
        method: 'GET', endpoint: '/{tableName}',
        params: [
          { name: 'baseId', type: 'string', required: true, description: 'ID de la base' },
          { name: 'tableName', type: 'string', required: true, description: 'Nom de la table' },
          { name: 'maxRecords', type: 'number', required: false, description: 'Nombre max' },
        ],
        urlParams: ['baseId', 'tableName'],
        timeoutMs: 10000,
      },
      createRecord: {
        id: 'createRecord', name: 'Créer un enregistrement', description: 'Ajoute un record à une table.',
        method: 'POST', endpoint: '/{tableName}',
        params: [
          { name: 'baseId', type: 'string', required: true, description: 'ID de la base' },
          { name: 'tableName', type: 'string', required: true, description: 'Nom de la table' },
          { name: 'fields', type: 'object', required: true, description: 'Champs du record' },
        ],
        urlParams: ['baseId', 'tableName'], bodyParams: ['fields'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // COMMUNICATION UNIFIÉE
  // ───────────────────────────────────────────────
  teams: {
    id: 'teams', name: 'Microsoft Teams',
    description: 'Envoyer des messages et gérer les canaux Microsoft Teams.',
    icon: 'Users', categories: ['Communication', 'Enterprise'],
    baseUrl: 'https://graph.microsoft.com/v1.0', authType: 'bearer',
    docsUrl: 'https://learn.microsoft.com/en-us/graph/api/resources/teams-api-overview', website: 'https://teams.microsoft.com', popularityRank: 35,
    actions: {
      sendMessage: {
        id: 'sendMessage', name: 'Envoyer un message', description: 'Envoie un message dans un canal Teams.',
        method: 'POST', endpoint: '/teams/{teamId}/channels/{channelId}/messages',
        params: [
          { name: 'teamId', type: 'string', required: true, description: 'ID de l\'équipe' },
          { name: 'channelId', type: 'string', required: true, description: 'ID du canal' },
          { name: 'body_content', type: 'string', required: true, description: 'Contenu du message' },
        ],
        urlParams: ['teamId', 'channelId'], bodyParams: ['body_content'],
        timeoutMs: 10000,
      },
    },
  },

  zoom: {
    id: 'zoom', name: 'Zoom',
    description: 'Créer et gérer des réunions Zoom via API.',
    icon: 'Video', categories: ['Communication', 'Vidéoconférence'],
    baseUrl: 'https://api.zoom.us/v2', authType: 'bearer',
    docsUrl: 'https://developers.zoom.us/docs/api/rest/zoom-api/', website: 'https://zoom.us', popularityRank: 36,
    actions: {
      createMeeting: {
        id: 'createMeeting', name: 'Créer une réunion', description: 'Crée une réunion Zoom instantanée ou planifiée.',
        method: 'POST', endpoint: '/users/{userId}/meetings',
        params: [
          { name: 'userId', type: 'string', required: true, description: 'ID utilisateur Zoom ("me" pour soi)' },
          { name: 'topic', type: 'string', required: true, description: 'Sujet de la réunion' },
          { name: 'type', type: 'number', required: false, description: '1=instantanée, 2=planifiée' },
        ],
        urlParams: ['userId'], bodyParams: ['topic', 'type'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // GOOGLE WORKSPACE
  // ───────────────────────────────────────────────
  gmail: {
    id: 'gmail', name: 'Gmail',
    description: 'Envoyer, lire et rechercher des emails via l\'API Gmail.',
    icon: 'Mail', categories: ['Email', 'Communication'],
    baseUrl: 'https://gmail.googleapis.com/gmail/v1/users/me', authType: 'bearer',
    docsUrl: 'https://developers.google.com/gmail/api/reference/rest', website: 'https://mail.google.com', popularityRank: 37,
    actions: {
      sendEmail: {
        id: 'sendEmail', name: 'Envoyer un email', description: 'Envoie un email via Gmail.',
        method: 'POST', endpoint: '/messages/send',
        params: [
          { name: 'raw', type: 'string', required: true, description: 'Email encodé en base64url (RFC 2822)' },
        ],
        bodyParams: ['raw'],
        timeoutMs: 15000,
      },
      listMessages: {
        id: 'listMessages', name: 'Lister les messages', description: 'Liste les messages de la boîte.',
        method: 'GET', endpoint: '/messages',
        params: [
          { name: 'maxResults', type: 'number', required: false, description: 'Nombre max' },
          { name: 'q', type: 'string', required: false, description: 'Requête de recherche Gmail' },
        ],
        timeoutMs: 10000,
      },
    },
  },

  googlecalendar: {
    id: 'googlecalendar', name: 'Google Calendar',
    description: 'Créer et gérer des événements Google Calendar.',
    icon: 'Calendar', categories: ['Productivité', 'Planning'],
    baseUrl: 'https://www.googleapis.com/calendar/v3', authType: 'bearer',
    docsUrl: 'https://developers.google.com/calendar/api/v3/reference', website: 'https://calendar.google.com', popularityRank: 38,
    actions: {
      createEvent: {
        id: 'createEvent', name: 'Créer un événement', description: 'Crée un événement dans un calendrier.',
        method: 'POST', endpoint: '/calendars/{calendarId}/events',
        params: [
          { name: 'calendarId', type: 'string', required: true, description: 'ID du calendrier ("primary" par défaut)' },
          { name: 'summary', type: 'string', required: true, description: 'Titre' },
          { name: 'start', type: 'object', required: true, description: 'Date/heure de début {dateTime, timeZone}' },
          { name: 'end', type: 'object', required: true, description: 'Date/heure de fin' },
        ],
        urlParams: ['calendarId'], bodyParams: ['summary', 'start', 'end'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // CI/CD
  // ───────────────────────────────────────────────
  circleci: {
    id: 'circleci', name: 'CircleCI',
    description: 'Déclencher des pipelines et lister les builds CircleCI.',
    icon: 'RefreshCw', categories: ['CI/CD', 'DevOps'],
    baseUrl: 'https://circleci.com/api/v2', authType: 'bearer',
    docsUrl: 'https://circleci.com/docs/api/v2/', website: 'https://circleci.com', popularityRank: 39,
    actions: {
      triggerPipeline: {
        id: 'triggerPipeline', name: 'Déclencher un pipeline', description: 'Déclenche un nouveau pipeline.',
        method: 'POST', endpoint: '/project/{projectSlug}/pipeline',
        params: [
          { name: 'projectSlug', type: 'string', required: true, description: 'Slug du projet (gh/org/repo)' },
          { name: 'branch', type: 'string', required: true, description: 'Branche' },
        ],
        urlParams: ['projectSlug'], bodyParams: ['branch'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // FINTECH & COMPTABILITÉ
  // ───────────────────────────────────────────────
  quickbooks: {
    id: 'quickbooks', name: 'QuickBooks',
    description: 'Gérer les factures, clients et paiements QuickBooks.',
    icon: 'Receipt', categories: ['Comptabilité', 'Finance'],
    baseUrl: 'https://quickbooks.api.intuit.com/v3/company/{realmId}', authType: 'bearer',
    docsUrl: 'https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice', website: 'https://quickbooks.intuit.com', popularityRank: 40,
    actions: {
      createInvoice: {
        id: 'createInvoice', name: 'Créer une facture', description: 'Crée une facture QuickBooks.',
        method: 'POST', endpoint: '/invoice',
        params: [
          { name: 'realmId', type: 'string', required: true, description: 'ID du realm' },
          { name: 'Line', type: 'array', required: true, description: 'Lignes de facturation' },
          { name: 'CustomerRef', type: 'object', required: true, description: 'Référence client {value}' },
        ],
        urlParams: ['realmId'], bodyParams: ['Line', 'CustomerRef'],
        timeoutMs: 15000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // LOGICIEL DE SONDAGE
  // ───────────────────────────────────────────────
  typeform: {
    id: 'typeform', name: 'Typeform',
    description: 'Récupérer les réponses et gérer les formulaires Typeform.',
    icon: 'FileText', categories: ['Formulaires', 'Productivité'],
    baseUrl: 'https://api.typeform.com', authType: 'bearer',
    docsUrl: 'https://developer.typeform.com/create/', website: 'https://typeform.com', popularityRank: 41,
    actions: {
      listResponses: {
        id: 'listResponses', name: 'Lister les réponses', description: 'Récupère les réponses d\'un formulaire.',
        method: 'GET', endpoint: '/forms/{formId}/responses',
        params: [
          { name: 'formId', type: 'string', required: true, description: 'ID du formulaire' },
          { name: 'page_size', type: 'number', required: false, description: 'Taille de page' },
        ],
        urlParams: ['formId'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // NOTIFICATION
  // ───────────────────────────────────────────────
  pushover: {
    id: 'pushover', name: 'Pushover',
    description: 'Envoyer des notifications push via Pushover.',
    icon: 'Bell', categories: ['Notification', 'Communication'],
    baseUrl: 'https://api.pushover.net/1', authType: 'token',
    docsUrl: 'https://pushover.net/api', website: 'https://pushover.net', popularityRank: 42,
    actions: {
      sendNotification: {
        id: 'sendNotification', name: 'Envoyer une notification', description: 'Envoie un push notification.',
        method: 'POST', endpoint: '/messages.json',
        params: [
          { name: 'user', type: 'string', required: true, description: 'Clé utilisateur Pushover' },
          { name: 'message', type: 'string', required: true, description: 'Contenu de la notification' },
          { name: 'title', type: 'string', required: false, description: 'Titre' },
          { name: 'priority', type: 'number', required: false, description: 'Priorité (-2 à 2)' },
        ],
        bodyParams: ['user', 'message', 'title', 'priority'],
        timeoutMs: 10000,
      },
    },
  },

  slack_webhook: {
    id: 'slack_webhook', name: 'Slack Webhook',
    description: "Envoie des notifications simples via un webhook Slack entrant.",
    icon: 'Webhook', categories: ['Notification', 'Communication'],
    baseUrl: 'https://hooks.slack.com/services', authType: 'none',
    docsUrl: 'https://api.slack.com/messaging/webhooks', website: 'https://slack.com', popularityRank: 43,
    actions: {
      send: {
        id: 'send', name: 'Envoyer une notification', description: 'Envoie un message via webhook entrant.',
        method: 'POST', endpoint: '/{webhookPath}',
        params: [
          { name: 'webhookPath', type: 'string', required: true, description: 'Chemin complet du webhook' },
          { name: 'text', type: 'string', required: true, description: 'Contenu du message' },
          { name: 'channel', type: 'string', required: false, description: 'Canal cible' },
        ],
        urlParams: ['webhookPath'], bodyParams: ['text', 'channel'],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // GOOGLE WORKSPACE
  // ───────────────────────────────────────────────
  googlesheets: {
    id: 'googlesheets', name: 'Google Sheets',
    description: 'Lire et écrire des données dans les feuilles de calcul Google Sheets.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=google.com&sz=128',
    icon: 'BarChart3', categories: ['Productivité', 'Analytics'],
    baseUrl: 'https://sheets.googleapis.com/v4', authType: 'bearer',
    docsUrl: 'https://developers.google.com/sheets/api', website: 'https://sheets.google.com', popularityRank: 4,
    actions: {
      getValues: {
        id: 'getValues', name: 'Lire une plage', description: 'Récupère les valeurs d\'une plage de cellules.',
        method: 'GET', endpoint: '/spreadsheets/{spreadsheetId}/values/{range}',
        params: [
          { name: 'spreadsheetId', type: 'string', required: true, description: 'ID de la feuille de calcul' },
          { name: 'range', type: 'string', required: true, description: 'Plage A1, ex: Feuille1!A1:D10' },
        ],
        urlParams: ['spreadsheetId', 'range'], timeoutMs: 12000,
      },
      appendValues: {
        id: 'appendValues', name: 'Ajouter des lignes', description: 'Ajoute des lignes à la fin d\'une plage.',
        method: 'POST', endpoint: '/spreadsheets/{spreadsheetId}/values/{range}:append?valueInputOption=RAW',
        params: [
          { name: 'spreadsheetId', type: 'string', required: true, description: 'ID de la feuille' },
          { name: 'range', type: 'string', required: true, description: 'Plage A1' },
          { name: 'values', type: 'array', required: true, description: 'Tableau de lignes (tableau de tableaux)' },
        ],
        urlParams: ['spreadsheetId', 'range'], bodyParams: ['values'], timeoutMs: 12000,
      },
    },
  },
  googledocs: {
    id: 'googledocs', name: 'Google Docs',
    description: 'Créer et manipuler des documents Google Docs via l\'API.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=docs.google.com&sz=128',
    icon: 'FileText', categories: ['Productivité', 'Documents'],
    baseUrl: 'https://docs.googleapis.com/v1', authType: 'bearer',
    docsUrl: 'https://developers.google.com/docs/api', website: 'https://docs.google.com', popularityRank: 31,
    actions: {
      createDocument: {
        id: 'createDocument', name: 'Créer un document', description: 'Crée un nouveau document Google Docs.',
        method: 'POST', endpoint: '/documents',
        params: [{ name: 'title', type: 'string', required: true, description: 'Titre du document' }],
        bodyParams: ['title'], timeoutMs: 10000,
      },
    },
  },
  googleslides: {
    id: 'googleslides', name: 'Google Slides',
    description: 'Créer des présentations et manipuler des diapositives.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=slides.google.com&sz=128',
    icon: 'BarChart3', categories: ['Productivité', 'Media'],
    baseUrl: 'https://slides.googleapis.com/v1', authType: 'bearer',
    docsUrl: 'https://developers.google.com/slides/api', website: 'https://slides.google.com', popularityRank: 48,
    actions: {
      createPresentation: {
        id: 'createPresentation', name: 'Créer une présentation', description: 'Crée une nouvelle présentation.',
        method: 'POST', endpoint: '/presentations',
        params: [{ name: 'title', type: 'string', required: true, description: 'Titre de la présentation' }],
        bodyParams: ['title'], timeoutMs: 10000,
      },
    },
  },
  googleforms: {
    id: 'googleforms', name: 'Google Forms',
    description: 'Lire les réponses des formulaires Google Forms.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=forms.google.com&sz=128',
    icon: 'FileText', categories: ['Formulaires', 'Productivité'],
    baseUrl: 'https://forms.googleapis.com/v1', authType: 'bearer',
    docsUrl: 'https://developers.google.com/forms/api', website: 'https://forms.google.com', popularityRank: 52,
    actions: {
      listResponses: {
        id: 'listResponses', name: 'Lister les réponses', description: 'Récupère les réponses soumises au formulaire.',
        method: 'GET', endpoint: '/forms/{formId}/responses',
        params: [{ name: 'formId', type: 'string', required: true, description: 'Identifiant du formulaire' }],
        urlParams: ['formId'], timeoutMs: 10000,
      },
    },
  },
  googleanalytics: {
    id: 'googleanalytics', name: 'Google Analytics',
    description: 'Interroger les données de trafic et de conversion via l\'API Reporting.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=analytics.google.com&sz=128',
    icon: 'BarChart3', categories: ['Analytics', 'Marketing'],
    baseUrl: 'https://analyticsdata.googleapis.com/v1beta', authType: 'bearer',
    docsUrl: 'https://developers.google.com/analytics/devguides/reporting/data/v1', website: 'https://analytics.google.com', popularityRank: 8,
    actions: {
      runReport: {
        id: 'runReport', name: 'Rapport', description: 'Exécute un rapport sur les données Analytics.',
        method: 'POST', endpoint: '/properties/{propertyId}:runReport',
        params: [
          { name: 'propertyId', type: 'string', required: true, description: 'Propriété GA4 (propriétés/XXXX)' },
          { name: 'dateRanges', type: 'array', required: true, description: 'Plages de dates' },
          { name: 'metrics', type: 'array', required: true, description: 'Métriques, ex: ["sessions"]' },
        ],
        urlParams: ['propertyId'], bodyParams: ['dateRanges', 'metrics'], timeoutMs: 12000,
      },
    },
  },
  googlegateway: {
    id: 'googlegateway', name: 'Google Gemini',
    description: 'Appeler les modèles Gemini pour génération de texte.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=deepmind.google&sz=128',
    icon: 'Brain', categories: ['AI', 'LLM'],
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta', authType: 'api_key_header',
    docsUrl: 'https://ai.google.dev/api', website: 'https://ai.google.dev', popularityRank: 12,
    actions: {
      generateContent: {
        id: 'generateContent', name: 'Générer du contenu', description: 'Génère du texte avec un modèle Gemini.',
        method: 'POST', endpoint: '/models/{model}:generateContent',
        params: [
          { name: 'model', type: 'string', required: true, description: 'Ex: gemini-1.5-flash' },
          { name: 'contents', type: 'array', required: true, description: 'Messages de la conversation' },
        ],
        urlParams: ['model'], bodyParams: ['contents'], timeoutMs: 30000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // MICROSOFT 365
  // ───────────────────────────────────────────────
  outlook: {
    id: 'outlook', name: 'Outlook',
    description: 'Envoyer et gérer des emails Outlook / Microsoft 365.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=outlook.com&sz=128',
    icon: 'Mail', categories: ['Communication', 'Email'],
    baseUrl: 'https://graph.microsoft.com/v1.0/me', authType: 'bearer',
    docsUrl: 'https://learn.microsoft.com/graph/api/resources/message', website: 'https://outlook.com', popularityRank: 5,
    actions: {
      sendEmail: {
        id: 'sendEmail', name: 'Envoyer un email', description: 'Envoie un email via Outlook.',
        method: 'POST', endpoint: '/sendMail',
        params: [
          { name: 'message', type: 'object', required: true, description: 'Objet message (subject, body, toRecipients)' },
          { name: 'saveToSentItems', type: 'boolean', required: false, description: 'Enregistrer dans envoyés' },
        ],
        bodyParams: ['message', 'saveToSentItems'], timeoutMs: 12000,
      },
    },
  },
  sharepoint: {
    id: 'sharepoint', name: 'SharePoint',
    description: 'Gérer les listes et les fichiers SharePoint Online.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=sharepoint.com&sz=128',
    icon: 'Box', categories: ['Documents', 'Enterprise'],
    baseUrl: 'https://graph.microsoft.com/v1.0', authType: 'bearer',
    docsUrl: 'https://learn.microsoft.com/graph/api/resources/sharepoint', website: 'https://microsoft.com/sharepoint', popularityRank: 22,
    actions: {
      listSites: {
        id: 'listSites', name: 'Lister les sites', description: 'Liste les sites SharePoint accessibles.',
        method: 'GET', endpoint: '/sites?search=*',
        params: [], timeoutMs: 10000,
      },
    },
  },
  onedrive: {
    id: 'onedrive', name: 'OneDrive',
    description: 'Gérer les fichiers OneDrive (upload, list, partage).',
    logoUrl: 'https://www.google.com/s2/favicons?domain=onedrive.com&sz=128',
    icon: 'Box', categories: ['Storage', 'Cloud'],
    baseUrl: 'https://graph.microsoft.com/v1.0/me/drive', authType: 'bearer',
    docsUrl: 'https://learn.microsoft.com/graph/api/resources/drive', website: 'https://onedrive.com', popularityRank: 20,
    actions: {
      listChildren: {
        id: 'listChildren', name: 'Lister les fichiers', description: 'Liste les éléments d\'un dossier.',
        method: 'GET', endpoint: '/root/children',
        params: [], timeoutMs: 10000,
      },
    },
  },
  azuread: {
    id: 'azuread', name: 'Azure AD',
    description: 'Gérer les utilisateurs et groupes Microsoft Entra ID.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=microsoft.com&sz=128',
    icon: 'Shield', categories: ['Security', 'Enterprise'],
    baseUrl: 'https://graph.microsoft.com/v1.0', authType: 'bearer',
    docsUrl: 'https://learn.microsoft.com/graph/api/resources/user', website: 'https://entra.microsoft.com', popularityRank: 35,
    actions: {
      listUsers: {
        id: 'listUsers', name: 'Lister les utilisateurs', description: 'Liste les utilisateurs du répertoire.',
        method: 'GET', endpoint: '/users?$top=50',
        params: [], timeoutMs: 10000,
      },
    },
  },
  azuredevops: {
    id: 'azuredevops', name: 'Azure DevOps',
    description: 'Gérer les work items et pipelines Azure DevOps.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=dev.azure.com&sz=128',
    icon: 'GitBranch', categories: ['DevOps', 'CI/CD'],
    baseUrl: 'https://dev.azure.com/{org}', authType: 'basic',
    docsUrl: 'https://learn.microsoft.com/rest/api/azure/devops/wit/work-items', website: 'https://azure.microsoft.com/devops', popularityRank: 26,
    actions: {
      createWorkItem: {
        id: 'createWorkItem', name: 'Créer un work item', description: 'Crée un work item de type tâche.',
        method: 'POST', endpoint: '/{project}/_apis/wit/workitems/$Task?api-version=7.0',
        params: [
          { name: 'project', type: 'string', required: true, description: 'Projet Azure DevOps' },
          { name: 'title', type: 'string', required: true, description: 'Titre de la tâche' },
        ],
        urlParams: ['project'], bodyParams: ['title'], timeoutMs: 12000,
      },
    },
  },
  powerbi: {
    id: 'powerbi', name: 'Power BI',
    description: 'Interroger les jeux de données Power BI.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=powerbi.microsoft.com&sz=128',
    icon: 'BarChart3', categories: ['Analytics', 'Enterprise'],
    baseUrl: 'https://api.powerbi.com/v1.0/myorg', authType: 'bearer',
    docsUrl: 'https://learn.microsoft.com/rest/api/power-bi/datasets', website: 'https://powerbi.microsoft.com', popularityRank: 40,
    actions: {
      listDatasets: {
        id: 'listDatasets', name: 'Lister les datasets', description: 'Liste les jeux de données de l\'espace.',
        method: 'GET', endpoint: '/datasets',
        params: [], timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // PRODUITIVITÉ & COLLABORATION
  // ───────────────────────────────────────────────
  confluence: {
    id: 'confluence', name: 'Confluence',
    description: 'Créer et gérer des pages et espaces Confluence.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=atlassian.com&sz=128',
    icon: 'FileText', categories: ['Documents', 'Collaboration'],
    baseUrl: 'https://{domain}.atlassian.net/wiki/api/v2', authType: 'basic',
    docsUrl: 'https://developer.atlassian.com/cloud/confluence', website: 'https://confluence.com', popularityRank: 18,
    actions: {
      createPage: {
        id: 'createPage', name: 'Créer une page', description: 'Crée une page dans un espace Confluence.',
        method: 'POST', endpoint: '/pages',
        params: [
          { name: 'domain', type: 'string', required: true, description: 'Sous-domaine Confluence' },
          { name: 'spaceId', type: 'string', required: true, description: 'ID de l\'espace' },
          { name: 'title', type: 'string', required: true, description: 'Titre de la page' },
          { name: 'body', type: 'object', required: false, description: 'Contenu (format view)' },
        ],
        urlParams: ['domain'], bodyParams: ['spaceId', 'title', 'body'], timeoutMs: 12000,
      },
    },
  },
  bitbucket: {
    id: 'bitbucket', name: 'Bitbucket',
    description: 'Gérer repos, pipelines et PR Bitbucket Cloud.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=bitbucket.org&sz=128',
    icon: 'GitBranch', categories: ['DevOps', 'Version Control'],
    baseUrl: 'https://api.bitbucket.org/2.0', authType: 'bearer',
    docsUrl: 'https://developer.atlassian.com/cloud/bitbucket/rest', website: 'https://bitbucket.org', popularityRank: 24,
    actions: {
      listRepositories: {
        id: 'listRepositories', name: 'Lister les repos', description: 'Liste les dépôts d\'un workspace.',
        method: 'GET', endpoint: '/repositories/{workspace}',
        params: [{ name: 'workspace', type: 'string', required: true, description: 'Workspace Bitbucket' }],
        urlParams: ['workspace'], timeoutMs: 10000,
      },
    },
  },
  todoist: {
    id: 'todoist', name: 'Todoist',
    description: 'Gérer vos tâches et projets Todoist.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=todoist.com&sz=128',
    icon: 'Check', categories: ['Productivité', 'Planning'],
    baseUrl: 'https://api.todoist.com/rest/v2', authType: 'bearer',
    docsUrl: 'https://developer.todoist.com/rest', website: 'https://todoist.com', popularityRank: 14,
    actions: {
      createTask: {
        id: 'createTask', name: 'Créer une tâche', description: 'Ajoute une nouvelle tâche.',
        method: 'POST', endpoint: '/tasks',
        params: [
          { name: 'content', type: 'string', required: true, description: 'Contenu de la tâche' },
          { name: 'due_string', type: 'string', required: false, description: 'Échéance texte libre' },
          { name: 'priority', type: 'number', required: false, description: 'Priorité 1-4' },
        ],
        bodyParams: ['content', 'due_string', 'priority'], timeoutMs: 10000,
      },
      listTasks: {
        id: 'listTasks', name: 'Lister les tâches', description: 'Liste les tâches actives.',
        method: 'GET', endpoint: '/tasks',
        params: [{ name: 'project_id', type: 'string', required: false, description: 'Filtrer par projet' }],
        timeoutMs: 10000,
      },
    },
  },
  notion_database: {
    id: 'notion_database', name: 'Notion Database',
    description: 'Interroger et mettre à jour des bases de données Notion.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=notion.so&sz=128',
    icon: 'Database', categories: ['Productivité', 'Database'],
    baseUrl: 'https://api.notion.com/v1', authType: 'bearer',
    docsUrl: 'https://developers.notion.com/reference/intro', website: 'https://notion.so', popularityRank: 25,
    actions: {
      queryDatabase: {
        id: 'queryDatabase', name: 'Requêter une base', description: 'Interroge une base Notion.',
        method: 'POST', endpoint: '/databases/{databaseId}/query',
        params: [
          { name: 'databaseId', type: 'string', required: true, description: 'ID de la base' },
          { name: 'filter', type: 'object', required: false, description: 'Filtre de propriétés' },
        ],
        urlParams: ['databaseId'], bodyParams: ['filter'], timeoutMs: 12000,
      },
    },
  },
  miro: {
    id: 'miro', name: 'Miro',
    description: 'Créer des tableaux et widgets sur Miro.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=miro.com&sz=128',
    icon: 'LayoutDashboard', categories: ['Collaboration', 'Design'],
    baseUrl: 'https://api.miro.com/v2', authType: 'bearer',
    docsUrl: 'https://developers.miro.com', website: 'https://miro.com', popularityRank: 33,
    actions: {
      createBoard: {
        id: 'createBoard', name: 'Créer un tableau', description: 'Crée un nouveau tableau Miro.',
        method: 'POST', endpoint: '/boards',
        params: [{ name: 'name', type: 'string', required: true, description: 'Nom du tableau' }],
        bodyParams: ['name'], timeoutMs: 10000,
      },
    },
  },
  canva: {
    id: 'canva', name: 'Canva',
    description: 'Générer des designs et gérer des créations Canva.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=canva.com&sz=128',
    icon: 'ImageIcon', categories: ['Design', 'Media'],
    baseUrl: 'https://api.canva.com/rest', authType: 'bearer',
    docsUrl: 'https://www.canva.com/developers', website: 'https://canva.com', popularityRank: 36,
    actions: {
      createDesign: {
        id: 'createDesign', name: 'Créer un design', description: 'Crée un demi-design Canva.',
        method: 'POST', endpoint: '/v1/brand-templates',
        params: [{ name: 'templateId', type: 'string', required: true, description: 'ID du template' }],
        bodyParams: ['templateId'], timeoutMs: 12000,
      },
    },
  },
  whimsical: {
    id: 'whimsical', name: 'Whimsical',
    description: 'Créer des mindmaps et diagrammes Whimsical.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=whimsical.com&sz=128',
    icon: 'GitBranch', categories: ['Collaboration', 'Productivité'],
    baseUrl: 'https://whimsical.com/api', authType: 'bearer',
    docsUrl: 'https://help.whimsical.com', website: 'https://whimsical.com', popularityRank: 67,
    actions: {
      createBoard: {
        id: 'createBoard', name: 'Créer un board', description: 'Crée un nouveau board collaboratif.',
        method: 'POST', endpoint: '/boards',
        params: [{ name: 'title', type: 'string', required: true, description: 'Titre du board' }],
        bodyParams: ['title'], timeoutMs: 10000,
      },
    },
  },
  lark: {
    id: 'lark', name: 'Lark',
    description: 'Messagerie et productivité unifiées Lark.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=larksuite.com&sz=128',
    icon: 'MessageSquare', categories: ['Communication', 'Team'],
    baseUrl: 'https://open.larksuite.com/open-apis', authType: 'bearer',
    docsUrl: 'https://open.larksuite.com', website: 'https://larksuite.com', popularityRank: 70,
    actions: {
      sendMessage: {
        id: 'sendMessage', name: 'Envoyer un message', description: 'Envoie un message dans un chat.',
        method: 'POST', endpoint: '/im/v1/messages?receive_id_type=open_id',
        params: [
          { name: 'receive_id', type: 'string', required: true, description: 'ID du destinataire' },
          { name: 'msg_type', type: 'string', required: true, description: 'Type: text' },
          { name: 'content', type: 'string', required: true, description: 'Contenu JSON' },
        ],
        bodyParams: ['receive_id', 'msg_type', 'content'], timeoutMs: 12000,
      },
    },
  },
  msteams: {
    id: 'msteams', name: 'Teams Messages',
    description: 'Envoyer des messages aux canaux Microsoft Teams.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=teams.microsoft.com&sz=128',
    icon: 'MessageSquare', categories: ['Communication', 'Team'],
    baseUrl: 'https://graph.microsoft.com/v1.0/me/messages', authType: 'bearer',
    docsUrl: 'https://learn.microsoft.com/graph/api/channel-post-messages', website: 'https://teams.microsoft.com', popularityRank: 28,
    actions: {
      sendMessage: {
        id: 'sendMessage', name: 'Envoyer un message', description: 'Envoie un message à un canal Teams.',
        method: 'POST', endpoint: '/chats/{chatId}/messages',
        params: [
          { name: 'chatId', type: 'string', required: true, description: 'ID du chat' },
          { name: 'content', type: 'string', required: true, description: 'Corps du message' },
        ],
        urlParams: ['chatId'], bodyParams: ['content'], timeoutMs: 12000,
      },
    },
  },
  webflow: {
    id: 'webflow', name: 'Webflow',
    description: 'Gérer les sites et collections Webflow.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=webflow.com&sz=128',
    icon: 'Globe', categories: ['Dev Tools', 'Design'],
    baseUrl: 'https://api.webflow.com', authType: 'bearer',
    docsUrl: 'https://developers.webflow.com', website: 'https://webflow.com', popularityRank: 29,
    actions: {
      listSites: {
        id: 'listSites', name: 'Lister les sites', description: 'Liste les sites Webflow de l\'utilisateur.',
        method: 'GET', endpoint: '/v2/sites',
        params: [], timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // CRM & MARKETING
  // ───────────────────────────────────────────────
  pipedrive: {
    id: 'pipedrive', name: 'Pipedrive',
    description: 'Gérer les deals, contacts et pipelines Pipedrive.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=pipedrive.com&sz=128',
    icon: 'Briefcase', categories: ['CRM', 'Payments'],
    baseUrl: 'https://api.pipedrive.com/v1', authType: 'token',
    docsUrl: 'https://developers.pipedrive.com/docs/api', website: 'https://pipedrive.com', popularityRank: 23,
    actions: {
      createDeal: {
        id: 'createDeal', name: 'Créer un deal', description: 'Ajoute un deal dans un pipeline.',
        method: 'POST', endpoint: '/deals',
        params: [
          { name: 'title', type: 'string', required: true, description: 'Titre du deal' },
          { name: 'value', type: 'number', required: false, description: 'Montant' },
          { name: 'currency', type: 'string', required: false, description: 'Devise' },
        ],
        bodyParams: ['title', 'value', 'currency'], timeoutMs: 10000,
      },
    },
  },
  closecrm: {
    id: 'closecrm', name: 'Close CRM',
    description: 'Gérer leads, contacts et activités Close.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=close.com&sz=128',
    icon: 'Briefcase', categories: ['CRM', 'Sales'],
    baseUrl: 'https://api.close.com/api/v1', authType: 'basic',
    docsUrl: 'https://developer.close.com', website: 'https://close.com', popularityRank: 55,
    actions: {
      listLeads: {
        id: 'listLeads', name: 'Lister les leads', description: 'Liste les leads du pipeline.',
        method: 'GET', endpoint: '/lead/list',
        params: [{ name: '_limit', type: 'number', required: false, description: 'Nombre max' }],
        timeoutMs: 10000,
      },
    },
  },
  keap: {
    id: 'keap', name: 'Keap',
    description: 'Automatiser le marketing et gérer les contacts Keap.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=keap.com&sz=128',
    icon: 'Megaphone', categories: ['Marketing', 'CRM'],
    baseUrl: 'https://api.infusionsoft.com/crm/rest/v1', authType: 'bearer',
    docsUrl: 'https://developer.keap.com', website: 'https://keap.com', popularityRank: 68,
    actions: {
      createContact: {
        id: 'createContact', name: 'Créer un contact', description: 'Crée un contact dans le CRM.',
        method: 'POST', endpoint: '/contacts',
        params: [
          { name: 'given_name', type: 'string', required: true, description: 'Prénom' },
          { name: 'family_name', type: 'string', required: true, description: 'Nom' },
          { name: 'email_addresses', type: 'array', required: false, description: 'Emails' },
        ],
        bodyParams: ['given_name', 'family_name', 'email_addresses'], timeoutMs: 10000,
      },
    },
  },
  klaviyo: {
    id: 'klaviyo', name: 'Klaviyo',
    description: 'Gérer les flux email/SMS et profils Klaviyo.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=klaviyo.com&sz=128',
    icon: 'Megaphone', categories: ['Marketing', 'Email'],
    baseUrl: 'https://a.klaviyo.com/api', authType: 'api_key_header',
    docsUrl: 'https://developers.klaviyo.com', website: 'https://klaviyo.com', popularityRank: 27,
    actions: {
      createProfile: {
        id: 'createProfile', name: 'Créer un profil', description: 'Crée un profil dans Klaviyo.',
        method: 'POST', endpoint: '/profiles',
        params: [
          { name: 'email', type: 'string', required: false, description: 'Email du profil' },
          { name: 'phone_number', type: 'string', required: false, description: 'Téléphone' },
        ],
        bodyParams: ['email', 'phone_number'], timeoutMs: 10000,
      },
    },
  },
  brevo: {
    id: 'brevo', name: 'Brevo (Sendinblue)',
    description: 'Envoyer des emails transactionnels et campagnes Brevo.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=brevo.com&sz=128',
    icon: 'Send', categories: ['Email', 'Marketing'],
    baseUrl: 'https://api.brevo.com/v3', authType: 'api_key_header',
    docsUrl: 'https://developers.brevo.com', website: 'https://brevo.com', popularityRank: 30,
    actions: {
      sendTransactionalEmail: {
        id: 'sendTransactionalEmail', name: 'Envoyer un email', description: 'Envoie un email transactionnel.',
        method: 'POST', endpoint: '/smtp/email',
        params: [
          { name: 'sender', type: 'object', required: true, description: 'Expéditeur {email, name}' },
          { name: 'to', type: 'array', required: true, description: 'Destinataires [{email}]' },
          { name: 'subject', type: 'string', required: true, description: 'Sujet' },
          { name: 'htmlContent', type: 'string', required: false, description: 'Contenu HTML' },
        ],
        bodyParams: ['sender', 'to', 'subject', 'htmlContent'], timeoutMs: 12000,
      },
    },
  },
  mailgun: {
    id: 'mailgun', name: 'Mailgun',
    description: 'Envoyer et suivre des emails via Mailgun.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=mailgun.com&sz=128',
    icon: 'Send', categories: ['Email', 'Dev Tools'],
    baseUrl: 'https://api.mailgun.net/v3', authType: 'basic',
    docsUrl: 'https://documentation.mailgun.com', website: 'https://mailgun.com', popularityRank: 37,
    actions: {
      sendMessage: {
        id: 'sendMessage', name: 'Envoyer un email', description: 'Envoie un email via le domaine API.',
        method: 'POST', endpoint: '/{domain}/messages',
        params: [
          { name: 'domain', type: 'string', required: true, description: 'Domaine (ex: mg.example.com)' },
          { name: 'from', type: 'string', required: true, description: 'Expéditeur' },
          { name: 'to', type: 'string', required: true, description: 'Destinataire' },
          { name: 'subject', type: 'string', required: true, description: 'Sujet' },
          { name: 'text', type: 'string', required: false, description: 'Corps texte' },
        ],
        urlParams: ['domain'], bodyParams: ['from', 'to', 'subject', 'text'], timeoutMs: 12000,
      },
    },
  },
  postmark: {
    id: 'postmark', name: 'Postmark',
    description: 'Envoyer des emails transactionnels Postmark.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=postmarkapp.com&sz=128',
    icon: 'Send', categories: ['Email', 'Dev Tools'],
    baseUrl: 'https://api.postmarkapp.com', authType: 'api_key_header',
    docsUrl: 'https://postmarkapp.com/developer', website: 'https://postmarkapp.com', popularityRank: 53,
    actions: {
      sendEmail: {
        id: 'sendEmail', name: 'Envoyer un email', description: 'Envoie un email transactionnel.',
        method: 'POST', endpoint: '/email',
        params: [
          { name: 'From', type: 'string', required: true, description: 'Expéditeur' },
          { name: 'To', type: 'string', required: true, description: 'Destinataire' },
          { name: 'Subject', type: 'string', required: true, description: 'Sujet' },
          { name: 'TextBody', type: 'string', required: false, description: 'Corps texte' },
        ],
        bodyParams: ['From', 'To', 'Subject', 'TextBody'], timeoutMs: 12000,
      },
    },
  },
  customerio: {
    id: 'customerio', name: 'Customer.io',
    description: 'Automatiser des messages et gérer des audiences Customer.io.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=customer.io&sz=128',
    icon: 'Megaphone', categories: ['Marketing', 'Email'],
    baseUrl: 'https://api.customer.io/v1', authType: 'bearer',
    docsUrl: 'https://customer.io/docs/api', website: 'https://customer.io', popularityRank: 66,
    actions: {
      identify: {
        id: 'identify', name: 'Identifier un contact', description: 'Crée ou met à jour un profil.',
        method: 'PUT', endpoint: '/customers/{id}',
        params: [
          { name: 'id', type: 'string', required: true, description: 'Identifiant client' },
          { name: 'email', type: 'string', required: false, description: 'Email' },
        ],
        urlParams: ['id'], bodyParams: ['email'], timeoutMs: 10000,
      },
    },
  },
  adobe_sign: {
    id: 'adobe_sign', name: 'Adobe Acrobat Sign',
    description: 'Envoyer et gérer des accords de signature Adobe Sign.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=adobe.com&sz=128',
    icon: 'FileText', categories: ['Documents', 'Productivité'],
    baseUrl: 'https://api.adobesign.com/api/rest/v6', authType: 'bearer',
    docsUrl: 'https://opensource.adobe.com/acrobat-sign/rest_apis', website: 'https://acrobat.adobe.com', popularityRank: 47,
    actions: {
      createAgreement: {
        id: 'createAgreement', name: 'Créer un accord', description: 'Crée un accord à signer.',
        method: 'POST', endpoint: '/agreements',
        params: [
          { name: 'fileInfos', type: 'array', required: true, description: 'Fichiers du document' },
          { name: 'name', type: 'string', required: true, description: 'Nom de l\'accord' },
          { name: 'participantSetsInfo', type: 'array', required: true, description: 'Signataires' },
        ],
        bodyParams: ['fileInfos', 'name', 'participantSetsInfo'], timeoutMs: 15000,
      },
    },
  },
  docusign: {
    id: 'docusign', name: 'DocuSign',
    description: 'Envoyer et gérer des documents à signer DocuSign.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=docusign.com&sz=128',
    icon: 'FileText', categories: ['Documents', 'Enterprise'],
    baseUrl: 'https://demo.docusign.net/restapi/v2.1', authType: 'bearer',
    docsUrl: 'https://developers.docusign.com', website: 'https://docusign.com', popularityRank: 44,
    actions: {
      createEnvelope: {
        id: 'createEnvelope', name: 'Créer un enveloppe', description: 'Envoie un document à signer.',
        method: 'POST', endpoint: '/accounts/{accountId}/envelopes',
        params: [
          { name: 'accountId', type: 'string', required: true, description: 'ID du compte' },
          { name: 'documents', type: 'array', required: true, description: 'Documents' },
          { name: 'emailSubject', type: 'string', required: true, description: 'Sujet' },
        ],
        urlParams: ['accountId'], bodyParams: ['documents', 'emailSubject'], timeoutMs: 15000,
      },
    },
  },
  dropbox_sign: {
    id: 'dropbox_sign', name: 'Dropbox Sign (HelloSign)',
    description: 'Envoyer des demandes de signature Dropbox Sign.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=dropsign.com&sz=128',
    icon: 'FileText', categories: ['Documents', 'Productivité'],
    baseUrl: 'https://api.hellosign.com/v3', authType: 'bearer',
    docsUrl: 'https://developers.hellosign.com', website: 'https://dropbox.com/sign', popularityRank: 61,
    actions: {
      sendSignatureRequest: {
        id: 'sendSignatureRequest', name: 'Envoyer une demande', description: 'Envoie un document à signer.',
        method: 'POST', endpoint: '/signature_request/send',
        params: [
          { name: 'files', type: 'array', required: true, description: 'Fichiers' },
          { name: 'title', type: 'string', required: false, description: 'Titre' },
          { name: 'signers', type: 'array', required: true, description: 'Signataires [{email_address,name}]' },
        ],
        bodyParams: ['files', 'title', 'signers'], timeoutMs: 15000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // PAIEMENTS & FINANCE
  // ───────────────────────────────────────────────
  paypal: {
    id: 'paypal', name: 'PayPal',
    description: 'Créer des paiements, commandes et suivre les transactions PayPal.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=paypal.com&sz=128',
    icon: 'CreditCard', categories: ['Payments', 'Finance'],
    baseUrl: 'https://api-m.paypal.com/v2', authType: 'bearer',
    docsUrl: 'https://developer.paypal.com/api', website: 'https://paypal.com', popularityRank: 6,
    actions: {
      createOrder: {
        id: 'createOrder', name: 'Créer une commande', description: 'Crée une commande de paiement.',
        method: 'POST', endpoint: '/checkout/orders',
        params: [
          { name: 'intent', type: 'string', required: true, description: 'intent = CAPTURE' },
          { name: 'purchase_units', type: 'array', required: true, description: 'Montants à capturer' },
        ],
        bodyParams: ['intent', 'purchase_units'], timeoutMs: 12000,
      },
    },
  },
  square: {
    id: 'square', name: 'Square',
    description: 'Effectuer des paiements et gérer des catalogues Square.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=squareup.com&sz=128',
    icon: 'CreditCard', categories: ['Payments', 'Ecommerce'],
    baseUrl: 'https://connect.squareup.com/v2', authType: 'bearer',
    docsUrl: 'https://developer.squareup.com', website: 'https://squareup.com', popularityRank: 34,
    actions: {
      createPayment: {
        id: 'createPayment', name: 'Créer un paiement', description: 'Règlement d\'un montant.',
        method: 'POST', endpoint: '/payments',
        params: [
          { name: 'source_id', type: 'string', required: true, description: 'Source de paiement' },
          { name: 'amount_money', type: 'object', required: true, description: '{amount, currency}' },
          { name: 'idempotency_key', type: 'string', required: true, description: 'Clé d\'idempotence' },
        ],
        bodyParams: ['source_id', 'amount_money', 'idempotency_key'], timeoutMs: 12000,
      },
    },
  },
  payoneer: {
    id: 'payoneer', name: 'Payoneer',
    description: 'Gérer des paiements et paiements masse Payoneer.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=payoneer.com&sz=128',
    icon: 'CreditCard', categories: ['Payments', 'Finance'],
    baseUrl: 'https://api.payoneer.com/v2', authType: 'bearer',
    docsUrl: 'https://developer.payoneer.com', website: 'https://payoneer.com', popularityRank: 78,
    actions: {
      checkConnection: {
        id: 'checkConnection', name: 'Vérifier la connexion', description: 'Teste la validité de l\'API.',
        method: 'GET', endpoint: '/connection',
        params: [], timeoutMs: 10000,
      },
    },
  },
  flooz: {
    id: 'flooz', name: 'Flooz by Moov',
    description: 'Mobile money Afrique de l\'Ouest : paiements, transferts Flooz.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=flooz.africa&sz=128',
    icon: 'Smartphone', categories: ['Payments', 'SMS'],
    baseUrl: 'https://api.moov-africa.biz', authType: 'bearer',
    docsUrl: 'https://developers.moov-africa.biz', website: 'https://flooz.africa', popularityRank: 71,
    actions: {
      initiatePayment: {
        id: 'initiatePayment', name: 'Initier un paiement', description: 'Initie un paiement mobile money.',
        method: 'POST', endpoint: '/money/transactions/type/landing-fees',
        params: [
          { name: 'amount', type: 'string', required: true, description: 'Montant' },
          { name: 'currency', type: 'string', required: true, description: 'XOF' },
          { name: 'payer', type: 'string', required: true, description: 'MSISDN du payeur' },
        ],
        bodyParams: ['amount', 'currency', 'payer'], timeoutMs: 15000,
      },
    },
  },
  mtnmomo: {
    id: 'mtnmomo', name: 'MTN Mobile Money',
    description: 'Mobile money : paiements, transactions MTN MoMo.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=mtn.com&sz=128',
    icon: 'Smartphone', categories: ['Payments', 'Finance'],
    baseUrl: 'https://sandbox.momodeveloper.mtn.com/collection', authType: 'bearer',
    docsUrl: 'https://momodeveloper.mtn.com', website: 'https://mtn.com', popularityRank: 72,
    actions: {
      requestToPay: {
        id: 'requestToPay', name: 'Demander un paiement', description: 'Envoie une demande de paiement.',
        method: 'POST', endpoint: '/v1_0/requesttopay',
        params: [
          { name: 'amount', type: 'string', required: true, description: 'Montant' },
          { name: 'currency', type: 'string', required: true, description: 'EUR/XAF' },
          { name: 'payer', type: 'object', required: true, description: '{partyId, partyIdType}' },
        ],
        bodyParams: ['amount', 'currency', 'payer'], timeoutMs: 15000,
      },
    },
  },
  orange_money: {
    id: 'orange_money', name: 'Orange Money',
    description: 'Mobile money Orange : paiements et transactions.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=orange.com&sz=128',
    icon: 'Smartphone', categories: ['Payments', 'Finance'],
    baseUrl: 'https://api.orange.com/orange-money-webpay', authType: 'bearer',
    docsUrl: 'https://developer.orange.com/apis', website: 'https://orange.com', popularityRank: 74,
    actions: {
      createPayment: {
        id: 'createPayment', name: 'Créer un paiement', description: 'Web pay : initie un paiement.',
        method: 'POST', endpoint: '/{merchant}/v1/webpayment',
        params: [
          { name: 'merchant', type: 'string', required: true, description: 'Identifiant marchand' },
          { name: 'amount', type: 'string', required: true, description: 'Montant' },
          { name: 'notif_url', type: 'string', required: true, description: 'URL de notification' },
        ],
        urlParams: ['merchant'], bodyParams: ['amount', 'notif_url'], timeoutMs: 15000,
      },
    },
  },
  xero: {
    id: 'xero', name: 'Xero',
    description: 'Comptabilité : factures, contacts, rapports Xero.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=xero.com&sz=128',
    icon: 'CreditCard', categories: ['Comptabilité', 'Finance'],
    baseUrl: 'https://api.xero.com/api.xro/2.0', authType: 'bearer',
    docsUrl: 'https://developer.xero.com', website: 'https://xero.com', popularityRank: 32,
    actions: {
      createInvoice: {
        id: 'createInvoice', name: 'Créer une facture', description: 'Crée une facture dans Xero.',
        method: 'PUT', endpoint: '/Invoices',
        params: [
          { name: 'Type', type: 'string', required: true, description: 'ACCREC ou ACCPAY' },
          { name: 'Contact', type: 'object', required: true, description: '{ContactID, Name}' },
          { name: 'LineItems', type: 'array', required: true, description: 'Lignes de facture' },
        ],
        bodyParams: ['Type', 'Contact', 'LineItems'], timeoutMs: 12000,
      },
    },
  },
  freshbooks: {
    id: 'freshbooks', name: 'FreshBooks',
    description: 'Comptabilité et facturation allégée FreshBooks.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=freshbooks.com&sz=128',
    icon: 'CreditCard', categories: ['Comptabilité', 'Finance'],
    baseUrl: 'https://api.freshbooks.com/accounting/account', authType: 'bearer',
    docsUrl: 'https://www.freshbooks.com/api', website: 'https://freshbooks.com', popularityRank: 49,
    actions: {
      listInvoices: {
        id: 'listInvoices', name: 'Lister les factures', description: 'Liste les factures du compte.',
        method: 'GET', endpoint: '/invoices/invoices',
        params: [], timeoutMs: 10000,
      },
    },
  },
  harvest: {
    id: 'harvest', name: 'Harvest',
    description: 'Suivi du temps et facturation Harvest.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=getharvest.com&sz=128',
    icon: 'Calendar', categories: ['Comptabilité', 'Productivité'],
    baseUrl: 'https://api.harvestapp.com/v2', authType: 'bearer',
    docsUrl: 'https://help.getharvest.com/api', website: 'https://getharvest.com', popularityRank: 57,
    actions: {
      createTimeEntry: {
        id: 'createTimeEntry', name: 'Créer une entrée de temps', description: 'Logue des heures travaillées.',
        method: 'POST', endpoint: '/time_entries',
        params: [
          { name: 'project_id', type: 'number', required: true, description: 'Projet' },
          { name: 'task_id', type: 'number', required: true, description: 'Tâche' },
          { name: 'hours', type: 'number', required: false, description: 'Heures' },
        ],
        bodyParams: ['project_id', 'task_id', 'hours'], timeoutMs: 10000,
      },
    },
  },
  tidal: {
    id: 'tidal', name: 'Tide',
    description: 'Banque et comptabilité pour PME Tide.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=tide.co&sz=128',
    icon: 'CreditCard', categories: ['Finance', 'Comptabilité'],
    baseUrl: 'https://api.tide.co', authType: 'bearer',
    docsUrl: 'https://developer.tide.co', website: 'https://tide.co', popularityRank: 82,
    actions: {
      listAccounts: {
        id: 'listAccounts', name: 'Lister les comptes', description: 'Liste les comptes bancaires.',
        method: 'GET', endpoint: '/accounts',
        params: [], timeoutMs: 10000,
      },
    },
  },
  gocardless: {
    id: 'gocardless', name: 'GoCardless',
    description: 'Prélèvements et paiements récurrents GoCardless.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=gocardless.com&sz=128',
    icon: 'CreditCard', categories: ['Payments', 'Finance'],
    baseUrl: 'https://api.gocardless.com', authType: 'bearer',
    docsUrl: 'https://developer.gocardless.com', website: 'https://gocardless.com', popularityRank: 62,
    actions: {
      createPayment: {
        id: 'createPayment', name: 'Créer un paiement', description: 'Crée un prélèvement.',
        method: 'POST', endpoint: '/payments',
        params: [
          { name: 'amount', type: 'string', required: true, description: 'Montant en centimes' },
          { name: 'currency', type: 'string', required: true, description: 'GBP/EUR' },
          { name: 'links', type: 'object', required: true, description: '{mandate}' },
        ],
        bodyParams: ['amount', 'currency', 'links'], timeoutMs: 12000,
      },
    },
  },
  lemon_squeezy: {
    id: 'lemon_squeezy', name: 'Lemon Squeezy',
    description: 'Vendre des produits digitaux : licences, abonnements LF.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=lemonsqueezy.com&sz=128',
    icon: 'ShoppingCart', categories: ['Ecommerce', 'Payments'],
    baseUrl: 'https://api.lemonsqueezy.com/v1', authType: 'bearer',
    docsUrl: 'https://docs.lemonsqueezy.com', website: 'https://lemonsqueezy.com', popularityRank: 41,
    actions: {
      listProducts: {
        id: 'listProducts', name: 'Lister les produits', description: 'Liste les produits Lemon Squeezy.',
        method: 'GET', endpoint: '/products',
        params: [], timeoutMs: 10000,
      },
    },
  },
  gumroad: {
    id: 'gumroad', name: 'Gumroad',
    description: 'Vendre des produits digitaux et abonnements Gumroad.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=gumroad.com&sz=128',
    icon: 'ShoppingCart', categories: ['Ecommerce', 'Payments'],
    baseUrl: 'https://api.gumroad.com/v2', authType: 'token',
    docsUrl: 'https://gumroad.com/api', website: 'https://gumroad.com', popularityRank: 59,
    actions: {
      listProducts: {
        id: 'listProducts', name: 'Lister les produits', description: 'Liste les produits du vendeur.',
        method: 'GET', endpoint: '/products',
        params: [], timeoutMs: 10000,
      },
    },
  },
  patreon: {
    id: 'patreon', name: 'Patreon',
    description: 'Gérer les membres, campagnes et paiements Patreon.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=patreon.com&sz=128',
    icon: 'Users', categories: ['Payments', 'Social'],
    baseUrl: 'https://www.patreon.com/api/oauth2/v2', authType: 'bearer',
    docsUrl: 'https://docs.patreon.com', website: 'https://patreon.com', popularityRank: 45,
    actions: {
      listCampaigns: {
        id: 'listCampaigns', name: 'Lister les campagnes', description: 'Liste les campagnes Patreon.',
        method: 'GET', endpoint: '/campaigns',
        params: [{ name: 'fields', type: 'string', required: false, description: 'Champs à inclure' }],
        timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // SOCIAL & MEDIA
  // ───────────────────────────────────────────────
  instagram: {
    id: 'instagram', name: 'Instagram',
    description: 'Gérer les médias et messages Instagram via Graph API.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=instagram.com&sz=128',
    icon: 'ImageIcon', categories: ['Social', 'Media'],
    baseUrl: 'https://graph.facebook.com/v19.0', authType: 'bearer',
    docsUrl: 'https://developers.facebook.com/docs/instagram-api', website: 'https://instagram.com', popularityRank: 7,
    actions: {
      publishMedia: {
        id: 'publishMedia', name: 'Publier un média', description: 'Publie une image sur un compte Instagram.',
        method: 'POST', endpoint: '/{ig_user_id}/media',
        params: [
          { name: 'ig_user_id', type: 'string', required: true, description: 'ID du compte Instagram' },
          { name: 'image_url', type: 'string', required: true, description: 'URL de l\'image' },
          { name: 'caption', type: 'string', required: false, description: 'Légende' },
        ],
        urlParams: ['ig_user_id'], bodyParams: ['image_url', 'caption'], timeoutMs: 15000,
      },
    },
  },
  tiktok: {
    id: 'tiktok', name: 'TikTok',
    description: 'Publier des vidéos et gérer les stats TikTok.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=tiktok.com&sz=128',
    icon: 'Video', categories: ['Social', 'Media'],
    baseUrl: 'https://open.tiktokapis.com/v2', authType: 'bearer',
    docsUrl: 'https://developers.tiktok.com', website: 'https://tiktok.com', popularityRank: 16,
    actions: {
      getUserInfo: {
        id: 'getUserInfo', name: 'Infos utilisateur', description: 'Récupère les informations du compte.',
        method: 'GET', endpoint: '/user/info/?fields=open_id,avatar_url,display_name',
        params: [{ name: 'fields', type: 'string', required: false, description: 'Champs demandés' }],
        timeoutMs: 10000,
      },
    },
  },
  pinterest: {
    id: 'pinterest', name: 'Pinterest',
    description: 'Créer des épingles et gérer les boards Pinterest.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=pinterest.com&sz=128',
    icon: 'ImageIcon', categories: ['Social', 'Marketing'],
    baseUrl: 'https://api-sandbox.pinterest.com/v5', authType: 'bearer',
    docsUrl: 'https://developers.pinterest.com', website: 'https://pinterest.com', popularityRank: 39,
    actions: {
      createPin: {
        id: 'createPin', name: 'Créer une épingle', description: 'Crée une épingle sur un board.',
        method: 'POST', endpoint: '/pins',
        params: [
          { name: 'board_id', type: 'string', required: true, description: 'Board cible' },
          { name: 'media_source', type: 'object', required: true, description: 'Source média' },
          { name: 'title', type: 'string', required: false, description: 'Titre' },
        ],
        bodyParams: ['board_id', 'media_source', 'title'], timeoutMs: 12000,
      },
    },
  },
  tumblr: {
    id: 'tumblr', name: 'Tumblr',
    description: 'Publier des posts sur un blog Tumblr.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=tumblr.com&sz=128',
    icon: 'PenSquare', categories: ['Social', 'Media'],
    baseUrl: 'https://api.tumblr.com/v2', authType: 'bearer',
    docsUrl: 'https://www.tumblr.com/docs/en/api/v2', website: 'https://tumblr.com', popularityRank: 88,
    actions: {
      createTextPost: {
        id: 'createTextPost', name: 'Créer un post texte', description: 'Publie un billet texte.',
        method: 'POST', endpoint: '/blog/{blog_id}/post',
        params: [
          { name: 'blog_id', type: 'string', required: true, description: 'Identifiant du blog' },
          { name: 'type', type: 'string', required: true, description: 'type = text' },
          { name: 'title', type: 'string', required: false, description: 'Titre' },
          { name: 'body', type: 'string', required: true, description: 'Contenu' },
        ],
        urlParams: ['blog_id'], bodyParams: ['type', 'title', 'body'], timeoutMs: 12000,
      },
    },
  },
  dribbble: {
    id: 'dribbble', name: 'Dribbble',
    description: 'Gérer les shots et profils Dribbble.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=dribbble.com&sz=128',
    icon: 'ImageIcon', categories: ['Design', 'Professional'],
    baseUrl: 'https://api.dribbble.com/v2', authType: 'bearer',
    docsUrl: 'https://developer.dribbble.com', website: 'https://dribbble.com', popularityRank: 73,
    actions: {
      listShots: {
        id: 'listShots', name: 'Lister les shots', description: 'Liste les shots du compte.',
        method: 'GET', endpoint: '/user/shots',
        params: [], timeoutMs: 10000,
      },
    },
  },
  behance: {
    id: 'behance', name: 'Behance',
    description: 'Gérer des projets et stats Behance.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=behance.net&sz=128',
    icon: 'ImageIcon', categories: ['Design', 'Professional'],
    baseUrl: 'https://api.behance.net/v2', authType: 'api_key_header',
    docsUrl: 'https://www.behance.net/dev/api/endpoints', website: 'https://behance.net', popularityRank: 80,
    actions: {
      getUserProjects: {
        id: 'getUserProjects', name: 'Projets utilisateur', description: 'Liste les projets d\'un utilisateur.',
        method: 'GET', endpoint: '/users/{username}/projects',
        params: [{ name: 'username', type: 'string', required: true, description: 'Nom d\'utilisateur' }],
        urlParams: ['username'], timeoutMs: 10000,
      },
    },
  },
  medium: {
    id: 'medium', name: 'Medium',
    description: 'Créer et publier des articles Medium.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=medium.com&sz=128',
    icon: 'PenSquare', categories: ['Social', 'Media'],
    baseUrl: 'https://api.medium.com/v1', authType: 'bearer',
    docsUrl: 'https://github.com/Medium/medium-api-docs', website: 'https://medium.com', popularityRank: 50,
    actions: {
      createPost: {
        id: 'createPost', name: 'Publier un article', description: 'Publie sur le compte Medium de l\'utilisateur.',
        method: 'POST', endpoint: '/users/{userId}/posts',
        params: [
          { name: 'userId', type: 'string', required: true, description: 'ID utilisateur Medium' },
          { name: 'title', type: 'string', required: true, description: 'Titre' },
          { name: 'contentFormat', type: 'string', required: true, description: 'html ou markdown' },
          { name: 'content', type: 'string', required: true, description: 'Contenu de l\'article' },
        ],
        urlParams: ['userId'], bodyParams: ['title', 'contentFormat', 'content'], timeoutMs: 15000,
      },
    },
  },
  reddit: {
    id: 'reddit', name: 'Reddit',
    description: 'Lire et publier sur les subreddits Reddit.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=reddit.com&sz=128',
    icon: 'MessageSquare', categories: ['Social', 'Community'],
    baseUrl: 'https://oauth.reddit.com', authType: 'bearer',
    docsUrl: 'https://www.reddit.com/dev/api', website: 'https://reddit.com', popularityRank: 38,
    actions: {
      submitPost: {
        id: 'submitPost', name: 'Publier un post', description: 'Soumet un lien ou texte à un subreddit.',
        method: 'POST', endpoint: '/api/submit',
        params: [
          { name: 'sr', type: 'string', required: true, description: 'Nom du subreddit (sans r/)' },
          { name: 'title', type: 'string', required: true, description: 'Titre' },
          { name: 'kind', type: 'string', required: true, description: 'self ou link' },
          { name: 'text', type: 'string', required: false, description: 'Contenu (si self)' },
        ],
        bodyParams: ['sr', 'title', 'kind', 'text'], timeoutMs: 12000,
      },
    },
  },
  discord_webhook: {
    id: 'discord_webhook', name: 'Discord Webhook',
    description: 'Envoyer des messages via un webhook Discord.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=discord.com&sz=128',
    icon: 'Send', categories: ['Communication', 'Notifications'],
    baseUrl: 'https://discord.com/api/webhooks', authType: 'none',
    docsUrl: 'https://discord.com/developers/docs/resources/webhook', website: 'https://discord.com', popularityRank: 43,
    actions: {
      sendMessage: {
        id: 'sendMessage', name: 'Envoyer un message', description: 'Envoie un message via le webhook.',
        method: 'POST', endpoint: '/{webhookId}/{webhookToken}',
        params: [
          { name: 'webhookId', type: 'string', required: true, description: 'ID du webhook' },
          { name: 'webhookToken', type: 'string', required: true, description: 'Token du webhook' },
          { name: 'content', type: 'string', required: true, description: 'Contenu du message' },
        ],
        urlParams: ['webhookId', 'webhookToken'], bodyParams: ['content'], timeoutMs: 12000,
      },
    },
  },
  telegram: {
    id: 'telegram', name: 'Telegram',
    description: 'Envoyer des messages et gérer des bots Telegram.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=telegram.org&sz=128',
    icon: 'Send', categories: ['Communication', 'Messaging'],
    baseUrl: 'https://api.telegram.org/bot', authType: 'token',
    docsUrl: 'https://core.telegram.org/bots/api', website: 'https://telegram.org', popularityRank: 9,
    actions: {
      sendMessage: {
        id: 'sendMessage', name: 'Envoyer un message', description: 'Envoie un message à un chat.',
        method: 'POST', endpoint: '/{token}/sendMessage',
        params: [
          { name: 'token', type: 'string', required: true, description: 'Token du bot' },
          { name: 'chat_id', type: 'string', required: true, description: 'ID du chat' },
          { name: 'text', type: 'string', required: true, description: 'Texte du message' },
        ],
        urlParams: ['token'], bodyParams: ['chat_id', 'text'], timeoutMs: 12000,
      },
    },
  },
  whatsapp: {
    id: 'whatsapp', name: 'WhatsApp Business',
    description: 'Envoyer des messages WhatsApp via l\'API Cloud.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=whatsapp.com&sz=128',
    icon: 'MessageSquare', categories: ['Communication', 'SMS'],
    baseUrl: 'https://graph.facebook.com/v19.0', authType: 'bearer',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api', website: 'https://business.whatsapp.com', popularityRank: 3,
    actions: {
      sendMessage: {
        id: 'sendMessage', name: 'Envoyer un message', description: 'Envoie un message texte WhatsApp.',
        method: 'POST', endpoint: '/{phone_number_id}/messages',
        params: [
          { name: 'phone_number_id', type: 'string', required: true, description: 'ID du numéro' },
          { name: 'to', type: 'string', required: true, description: 'Destinataire' },
          { name: 'text', type: 'object', required: true, description: '{body: "texte"}' },
        ],
        urlParams: ['phone_number_id'], bodyParams: ['to', 'text'], timeoutMs: 15000,
      },
    },
  },
  signal: {
    id: 'signal', name: 'Signal',
    description: 'Messagerie sécurisée Signal (via passerelle).',
    logoUrl: 'https://www.google.com/s2/favicons?domain=signal.org&sz=128',
    icon: 'MessageSquare', categories: ['Communication', 'Security'],
    baseUrl: 'https://signal.art', authType: 'bearer',
    docsUrl: 'https://signal.org/docs', website: 'https://signal.org', popularityRank: 90,
    actions: {
      sendMessage: {
        id: 'sendMessage', name: 'Envoyer un message', description: 'Envoie un message via passerelle.',
        method: 'POST', endpoint: '/v2/send',
        params: [
          { name: 'message', type: 'string', required: true, description: 'Contenu' },
          { name: 'number', type: 'string', required: false, description: 'Numéro cible' },
        ],
        bodyParams: ['message', 'number'], timeoutMs: 12000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // DEV & CLOUD
  // ───────────────────────────────────────────────
  digitalocean: {
    id: 'digitalocean', name: 'DigitalOcean',
    description: 'Gérer droplets, Kubernetes et DNS DigitalOcean.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=digitalocean.com&sz=128',
    icon: 'Cloud', categories: ['Cloud', 'Infrastructure'],
    baseUrl: 'https://api.digitalocean.com/v2', authType: 'bearer',
    docsUrl: 'https://docs.digitalocean.com/reference/api/api-reference', website: 'https://digitalocean.com', popularityRank: 19,
    actions: {
      listDroplets: {
        id: 'listDroplets', name: 'Lister les droplets', description: 'Liste les droplets du compte.',
        method: 'GET', endpoint: '/droplets',
        params: [{ name: 'per_page', type: 'number', required: false, description: 'Par page' }],
        timeoutMs: 10000,
      },
      createDroplet: {
        id: 'createDroplet', name: 'Créer un droplet', description: 'Crée une VM DigitalOcean.',
        method: 'POST', endpoint: '/droplets',
        params: [
          { name: 'name', type: 'string', required: true, description: 'Nom de la VM' },
          { name: 'region', type: 'string', required: true, description: 'Région, ex: nyc1' },
          { name: 'size', type: 'string', required: true, description: 'Taille, ex: s-1vcpu-1gb' },
          { name: 'image', type: 'string', required: true, description: 'Image, ex: ubuntu-22-04-x64' },
        ],
        bodyParams: ['name', 'region', 'size', 'image'], timeoutMs: 12000,
      },
    },
  },
  cloudflare: {
    id: 'cloudflare', name: 'Cloudflare',
    description: 'Gérer zones DNS, workers et règles Cloudflare.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=cloudflare.com&sz=128',
    icon: 'Cloud', categories: ['Cloud', 'Security'],
    baseUrl: 'https://api.cloudflare.com/client/v4', authType: 'api_key_header',
    docsUrl: 'https://developers.cloudflare.com/api', website: 'https://cloudflare.com', popularityRank: 15,
    actions: {
      listZones: {
        id: 'listZones', name: 'Lister les zones', description: 'Liste les zones du compte.',
        method: 'GET', endpoint: '/zones',
        params: [], timeoutMs: 10000,
      },
      listDnsRecords: {
        id: 'listDnsRecords', name: 'Lister DNS', description: 'Liste les enregistrements DNS d\'une zone.',
        method: 'GET', endpoint: '/zones/{zone_id}/dns_records',
        params: [{ name: 'zone_id', type: 'string', required: true, description: 'ID de la zone' }],
        urlParams: ['zone_id'], timeoutMs: 10000,
      },
    },
  },
  heroku: {
    id: 'heroku', name: 'Heroku',
    description: 'Gérer les apps, dynos et addons Heroku.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=heroku.com&sz=128',
    icon: 'Globe', categories: ['Cloud', 'DevOps'],
    baseUrl: 'https://api.heroku.com', authType: 'bearer',
    docsUrl: 'https://devcenter.heroku.com/articles/platform-api-reference', website: 'https://heroku.com', popularityRank: 42,
    actions: {
      listApps: {
        id: 'listApps', name: 'Lister les apps', description: 'Liste les applications Heroku.',
        method: 'GET', endpoint: '/apps',
        params: [], timeoutMs: 10000,
      },
    },
  },
  aws_lambda: {
    id: 'aws_lambda', name: 'AWS Lambda',
    description: 'Gérer et invoquer des fonctions Lambda (via couche).',
    logoUrl: 'https://www.google.com/s2/favicons?domain=aws.amazon.com&sz=128',
    icon: 'Code2', categories: ['Cloud', 'Backend'],
    baseUrl: 'https://lambda.{region}.amazonaws.com/2015-03-31', authType: 'bearer',
    docsUrl: 'https://docs.aws.amazon.com/lambda', website: 'https://aws.amazon.com/lambda', popularityRank: 21,
    actions: {
      listFunctions: {
        id: 'listFunctions', name: 'Lister les fonctions', description: 'Liste les fonctions Lambda de la région.',
        method: 'GET', endpoint: '/functions',
        params: [], timeoutMs: 10000,
      },
    },
  },
  aws_s3: {
    id: 'aws_s3', name: 'AWS S3',
    description: 'Gérer les buckets et objets S3 (via couche).',
    logoUrl: 'https://www.google.com/s2/favicons?domain=aws.amazon.com&sz=128',
    icon: 'Box', categories: ['Storage', 'Cloud'],
    baseUrl: 'https://s3.{region}.amazonaws.com', authType: 'bearer',
    docsUrl: 'https://docs.aws.amazon.com/s3', website: 'https://aws.amazon.com/s3', popularityRank: 46,
    actions: {
      listBuckets: {
        id: 'listBuckets', name: 'Lister les buckets', description: 'Liste les buckets S3 du compte.',
        method: 'GET', endpoint: '/',
        params: [], timeoutMs: 10000,
      },
    },
  },
  gcp_cloudstorage: {
    id: 'gcp_cloudstorage', name: 'Google Cloud Storage',
    description: 'Gérer les buckets et objets GCS.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=cloud.google.com&sz=128',
    icon: 'Box', categories: ['Storage', 'Cloud'],
    baseUrl: 'https://storage.googleapis.com/storage/v1', authType: 'bearer',
    docsUrl: 'https://cloud.google.com/storage/docs/json_api', website: 'https://cloud.google.com/storage', popularityRank: 60,
    actions: {
      listBuckets: {
        id: 'listBuckets', name: 'Lister les buckets', description: 'Liste les buckets du projet.',
        method: 'GET', endpoint: '/b?project={projectId}',
        params: [{ name: 'projectId', type: 'string', required: true, description: 'ID projet GCP' }],
        urlParams: ['projectId'], timeoutMs: 10000,
      },
    },
  },
  supabase_storage: {
    id: 'supabase_storage', name: 'Supabase Storage',
    description: 'Gérer le stockage de fichiers Supabase.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=supabase.com&sz=128',
    icon: 'Box', categories: ['Storage', 'Database'],
    baseUrl: 'https://{projectId}.supabase.co/storage/v1', authType: 'bearer',
    docsUrl: 'https://supabase.com/docs/guides/storage/api', website: 'https://supabase.com', popularityRank: 54,
    actions: {
      listBuckets: {
        id: 'listBuckets', name: 'Lister les buckets', description: 'Liste les buckets de stockage.',
        method: 'GET', endpoint: '/bucket',
        params: [], timeoutMs: 10000,
      },
    },
  },
  mongodb: {
    id: 'mongodb', name: 'MongoDB Atlas',
    description: 'Gérer clusters, projets et données MongoDB Atlas.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=mongodb.com&sz=128',
    icon: 'Database', categories: ['Database', 'Backend'],
    baseUrl: 'https://cloud.mongodb.com/api/atlas/v2', authType: 'bearer',
    docsUrl: 'https://www.mongodb.com/docs/atlas/reference/api-resources-spec', website: 'https://mongodb.com/atlas', popularityRank: 17,
    actions: {
      listProjects: {
        id: 'listProjects', name: 'Lister les projets', description: 'Liste les projets Atlas.',
        method: 'GET', endpoint: '/groups',
        params: [], timeoutMs: 10000,
      },
    },
  },
  postgres: {
    id: 'postgres', name: 'PostgreSQL',
    description: 'Base de données PostgreSQL gérée (Neon/Heroku).',
    logoUrl: 'https://www.google.com/s2/favicons?domain=postgresql.org&sz=128',
    icon: 'Database', categories: ['Database', 'Backend'],
    baseUrl: 'https://api.neon.tech/v1', authType: 'bearer',
    docsUrl: 'https://neon.tech/docs/api', website: 'https://postgresql.org', popularityRank: 65,
    actions: {
      listDatabases: {
        id: 'listDatabases', name: 'Lister les bases', description: 'Liste les bases de données.',
        method: 'GET', endpoint: '/databases',
        params: [], timeoutMs: 10000,
      },
    },
  },
  clickup: {
    id: 'clickup', name: 'ClickUp',
    description: 'Gérer les tâches, espaces et listes ClickUp.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=clickup.com&sz=128',
    icon: 'Check', categories: ['Project Management', 'Productivité'],
    baseUrl: 'https://api.clickup.com/api/v2', authType: 'bearer',
    docsUrl: 'https://clickup.com/api', website: 'https://clickup.com', popularityRank: 13,
    actions: {
      createTask: {
        id: 'createTask', name: 'Créer une tâche', description: 'Crée une tâche dans une liste.',
        method: 'POST', endpoint: '/list/{listId}/task',
        params: [
          { name: 'listId', type: 'string', required: true, description: 'ID de la liste' },
          { name: 'name', type: 'string', required: true, description: 'Nom de la tâche' },
          { name: 'description', type: 'string', required: false, description: 'Description' },
        ],
        urlParams: ['listId'], bodyParams: ['name', 'description'], timeoutMs: 12000,
      },
    },
  },
  monday: {
    id: 'monday', name: 'Monday.com',
    description: 'Gérer les boards et items Monday.com.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=monday.com&sz=128',
    icon: 'GitBranch', categories: ['Project Management', 'Productivité'],
    baseUrl: 'https://api.monday.com/v2', authType: 'token',
    docsUrl: 'https://developer.monday.com', website: 'https://monday.com', popularityRank: 11,
    actions: {
      createItem: {
        id: 'createItem', name: 'Créer un item', description: 'GraphQL : ajoute un item à un board.',
        method: 'POST', endpoint: '/',
        params: [
          { name: 'boardId', type: 'string', required: true, description: 'ID du board' },
          { name: 'group_id', type: 'string', required: true, description: 'ID du groupe' },
          { name: 'itemName', type: 'string', required: true, description: 'Nom de l\'item' },
        ],
        bodyParams: ['boardId', 'group_id', 'itemName'], timeoutMs: 12000,
      },
    },
  },
  wrike: {
    id: 'wrike', name: 'Wrike',
    description: 'Gérer les projets, tâches et workflows Wrike.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=wrike.com&sz=128',
    icon: 'Briefcase', categories: ['Project Management', 'Collaboration'],
    baseUrl: 'https://www.wrike.com/api/v4', authType: 'bearer',
    docsUrl: 'https://developers.wrike.com', website: 'https://wrike.com', popularityRank: 76,
    actions: {
      createTask: {
        id: 'createTask', name: 'Créer une tâche', description: 'Crée une tâche Wrike.',
        method: 'POST', endpoint: '/folders/{folderId}/tasks',
        params: [
          { name: 'folderId', type: 'string', required: true, description: 'Dossier parent' },
          { name: 'title', type: 'string', required: true, description: 'Titre' },
        ],
        urlParams: ['folderId'], bodyParams: ['title'], timeoutMs: 12000,
      },
    },
  },
  notion_calendar: {
    id: 'notion_calendar', name: 'Notion Calendar',
    description: 'Suivre événements et agenda Notion Calendar.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=notion.com&sz=128',
    icon: 'Calendar', categories: ['Productivité', 'Planning'],
    baseUrl: 'https://api.notion.com/v1', authType: 'bearer',
    docsUrl: 'https://developers.notion.com', website: 'https://calendar.notion.com', popularityRank: 84,
    actions: {
      listPages: {
        id: 'listPages', name: 'Lister les pages', description: 'Liste les pages d\'un agenda.',
        method: 'POST', endpoint: '/search',
        params: [{ name: 'query', type: 'string', required: false, description: 'Recherche' }],
        bodyParams: ['query'], timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // TESTING & MONITORING
  // ───────────────────────────────────────────────
  sentry: {
    id: 'sentry', name: 'Sentry',
    description: 'Suivi des erreurs, issues et releases Sentry.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=sentry.io&sz=128',
    icon: 'AlertCircle', categories: ['Monitoring', 'Dev Tools'],
    baseUrl: 'https://sentry.io/api/0', authType: 'bearer',
    docsUrl: 'https://docs.sentry.io/api', website: 'https://sentry.io', popularityRank: 10,
    actions: {
      listIssues: {
        id: 'listIssues', name: 'Lister les issues', description: 'Liste les erreurs du projet.',
        method: 'GET', endpoint: '/projects/{org}/{project}/issues',
        params: [
          { name: 'org', type: 'string', required: true, description: 'Organisation Sentry' },
          { name: 'project', type: 'string', required: true, description: 'Projet Sentry' },
        ],
        urlParams: ['org', 'project'], timeoutMs: 10000,
      },
    },
  },
  grafana: {
    id: 'grafana', name: 'Grafana',
    description: 'Gérer les dashboards et alerter Grafana.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=grafana.com&sz=128',
    icon: 'BarChart3', categories: ['Monitoring', 'Infrastructure'],
    baseUrl: 'https://grafana.com/api', authType: 'bearer',
    docsUrl: 'https://grafana.com/docs/grafana/latest/developers/http_api', website: 'https://grafana.com', popularityRank: 51,
    actions: {
      listDashboards: {
        id: 'listDashboards', name: 'Lister les dashboards', description: 'Liste les dashboards.',
        method: 'GET', endpoint: '/dashboards/search',
        params: [], timeoutMs: 10000,
      },
    },
  },
  uptimerobot: {
    id: 'uptimerobot', name: 'UptimeRobot',
    description: 'Surveiller la disponibilité des sites UptimeRobot.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=uptimerobot.com&sz=128',
    icon: 'Activity', categories: ['Monitoring', 'Infrastructure'],
    baseUrl: 'https://api.uptimerobot.com/v2', authType: 'api_key_header',
    docsUrl: 'https://uptimerobot.com/api', website: 'https://uptimerobot.com', popularityRank: 63,
    actions: {
      getMonitors: {
        id: 'getMonitors', name: 'Moniteurs', description: 'Liste les moniteurs du compte.',
        method: 'POST', endpoint: '/getMonitors',
        params: [], timeoutMs: 10000,
      },
    },
  },
  statuspage: {
    id: 'statuspage', name: 'Statuspage',
    description: 'Gérer les incidents et composants Statuspage.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=statuspage.io&sz=128',
    icon: 'Activity', categories: ['Monitoring', 'Incident'],
    baseUrl: 'https://api.statuspage.io/v1', authType: 'bearer',
    docsUrl: 'https://developer.statuspage.io', website: 'https://statuspage.io', popularityRank: 77,
    actions: {
      listIncidents: {
        id: 'listIncidents', name: 'Lister les incidents', description: 'Liste les incidents du carnet.',
        method: 'GET', endpoint: '/pages/{pageId}/incidents',
        params: [{ name: 'pageId', type: 'string', required: true, description: 'ID de la page (unicorn)' }],
        urlParams: ['pageId'], timeoutMs: 10000,
      },
    },
  },
  newrelic: {
    id: 'newrelic', name: 'New Relic',
    description: 'Télémétrie APM et interroger les données New Relic.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=newrelic.com&sz=128',
    icon: 'BarChart3', categories: ['Monitoring', 'Analytics'],
    baseUrl: 'https://api.newrelic.com/v2', authType: 'api_key_header',
    docsUrl: 'https://docs.newrelic.com/docs/apis/rest-api-v2', website: 'https://newrelic.com', popularityRank: 56,
    actions: {
      listApplications: {
        id: 'listApplications', name: 'Applications', description: 'Liste les applications APM.',
        method: 'GET', endpoint: '/applications.json',
        params: [], timeoutMs: 10000,
      },
    },
  },
  datadog_monitoring: {
    id: 'datadog_monitoring', name: 'Datadog Monitoring',
    description: 'Lire les grilles et requêtes de monitoring Datadog.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=datadoghq.com&sz=128',
    icon: 'Activity', categories: ['Monitoring', 'Infrastructure'],
    baseUrl: 'https://api.datadoghq.com/api/v1', authType: 'api_key_header',
    docsUrl: 'https://docs.datadoghq.com/api', website: 'https://datadoghq.com', popularityRank: 64,
    actions: {
      listMonitors: {
        id: 'listMonitors', name: 'Moniteurs', description: 'Liste les moniteurs Datadog.',
        method: 'GET', endpoint: '/monitor',
        params: [], timeoutMs: 10000,
      },
    },
  },
  testrail: {
    id: 'testrail', name: 'TestRail',
    description: 'Gérer les cas de test et exécutions TestRail.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=testrail.com&sz=128',
    icon: 'Check', categories: ['Dev Tools', 'Testing'],
    baseUrl: 'https://{instance}.testrail.io/index.php?/api/v2', authType: 'bearer',
    docsUrl: 'https://www.testrail.com/api', website: 'https://testrail.com', popularityRank: 85,
    actions: {
      getProjects: {
        id: 'getProjects', name: 'Projets', description: 'Liste les projets TestRail.',
        method: 'GET', endpoint: '/get_projects',
        params: [{ name: 'instance', type: 'string', required: true, description: 'Sous-domaine TestRail' }],
        urlParams: ['instance'], timeoutMs: 10000,
      },
    },
  },
  cypress: {
    id: 'cypress', name: 'Cypress',
    description: 'Lancer les tests d\'intégration sur Cypress Cloud.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=cypress.io&sz=128',
    icon: 'Code2', categories: ['Dev Tools', 'Testing'],
    baseUrl: 'https://api.cypress.io', authType: 'bearer',
    docsUrl: 'https://docs.cypress.io', website: 'https://cypress.io', popularityRank: 69,
    actions: {
      getProjects: {
        id: 'getProjects', name: 'Projets', description: 'Liste les projets connectés.',
        method: 'GET', endpoint: '/projects',
        params: [], timeoutMs: 10000,
      },
    },
  },
  sonarqube: {
    id: 'sonarqube', name: 'SonarQube',
    description: 'Analyser la qualité du code et les règles SonarQube.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=sonarqube.org&sz=128',
    icon: 'Shield', categories: ['Code Quality', 'Dev Tools'],
    baseUrl: 'https://sonarcloud.io/api', authType: 'token',
    docsUrl: 'https://sonarcloud.io/web_api', website: 'https://sonarcloud.io', popularityRank: 58,
    actions: {
      listProjects: {
        id: 'listProjects', name: 'Projets', description: 'Liste les projets analysés.',
        method: 'GET', endpoint: '/projects/search',
        params: [], timeoutMs: 10000,
      },
    },
  },
  codecov: {
    id: 'codecov', name: 'Codecov',
    description: 'Suivre la couverture de code Codecov.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=codecov.io&sz=128',
    icon: 'Shield', categories: ['Code Quality', 'Dev Tools'],
    baseUrl: 'https://api.codecov.io/api/v2', authType: 'token',
    docsUrl: 'https://docs.codecov.com/reference', website: 'https://codecov.io', popularityRank: 75,
    actions: {
      listRepos: {
        id: 'listRepos', name: 'Repos', description: 'Liste les repos suivis.',
        method: 'GET', endpoint: '/repos',
        params: [], timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // E-COMMERCE & DATA
  // ───────────────────────────────────────────────
  bigcommerce: {
    id: 'bigcommerce', name: 'BigCommerce',
    description: 'Gérer produits, commandes et catalogues BigCommerce.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=bigcommerce.com&sz=128',
    icon: 'ShoppingCart', categories: ['Ecommerce', 'Payments'],
    baseUrl: 'https://api.bigcommerce.com/stores/{store_hash}', authType: 'bearer',
    docsUrl: 'https://developer.bigcommerce.com/api-docs', website: 'https://bigcommerce.com', popularityRank: 79,
    actions: {
      listProducts: {
        id: 'listProducts', name: 'Lister les produits', description: 'Liste les produits du store.',
        method: 'GET', endpoint: '/v3/catalog/products',
        params: [{ name: 'store_hash', type: 'string', required: true, description: 'Hash du store' }],
        urlParams: ['store_hash'], timeoutMs: 10000,
      },
    },
  },
  wix: {
    id: 'wix', name: 'Wix',
    description: 'Gérer les sites Wix via l\'API REST.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=wix.com&sz=128',
    icon: 'Globe', categories: ['Ecommerce', 'Dev Tools'],
    baseUrl: 'https://www.wixapis.com', authType: 'bearer',
    docsUrl: 'https://dev.wix.com/docs/rest', website: 'https://wix.com', popularityRank: 83,
    actions: {
      listContacts: {
        id: 'listContacts', name: 'Lister les contacts', description: 'Liste les contacts du site.',
        method: 'POST', endpoint: '/contacts/v4/contacts/query',
        params: [], timeoutMs: 10000,
      },
    },
  },
  openweatherapi: {
    id: 'openweatherapi', name: 'OpenWeather',
    description: 'Données météo courantes et prévisions.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=openweathermap.org&sz=128',
    icon: 'Cloud', categories: ['Data', 'Weather'],
    baseUrl: 'https://api.openweathermap.org/data/2.5', authType: 'api_key_header',
    docsUrl: 'https://openweathermap.org/api', website: 'https://openweathermap.org', popularityRank: 86,
    actions: {
      getWeather: {
        id: 'getWeather', name: 'Météo actuelle', description: 'Météo courante d\'une ville.',
        method: 'GET', endpoint: '/weather',
        params: [
          { name: 'q', type: 'string', required: true, description: 'Ville, ex: Douala' },
          { name: 'units', type: 'string', required: false, description: 'metric/imperial' },
        ],
        timeoutMs: 10000,
      },
    },
  },
  openstreetmap: {
    id: 'openstreetmap', name: 'OpenStreetMap',
    description: 'Géocodage et recherche de lieux OpenStreetMap.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=openstreetmap.org&sz=128',
    icon: 'MapPin', categories: ['Data', 'Search'],
    baseUrl: 'https://nominatim.openstreetmap.org', authType: 'none',
    docsUrl: 'https://nominatim.org/release-docs/latest/api', website: 'https://nominatim.org', popularityRank: 91,
    actions: {
      search: {
        id: 'search', name: 'Géocoder', description: 'Recherche un lieu par nom.',
        method: 'GET', endpoint: '/search?format=json',
        params: [{ name: 'q', type: 'string', required: true, description: 'Adresse / lieu' }],
        timeoutMs: 10000,
      },
    },
  },
  chartmogul: {
    id: 'chartmogul', name: 'ChartMogul',
    description: 'Métriques SaaS : MRR, churn, ARR ChartMogul.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=chartmogul.com&sz=128',
    icon: 'BarChart3', categories: ['Analytics', 'Finance'],
    baseUrl: 'https://api.chartmogul.com/v1', authType: 'bearer',
    docsUrl: 'https://developer.chartmogul.com/reference', website: 'https://chartmogul.com', popularityRank: 87,
    actions: {
      getMetrics: {
        id: 'getMetrics', name: 'Métriques', description: 'Lire les métriques MRR.',
        method: 'GET', endpoint: '/metrics/mrr',
        params: [], timeoutMs: 10000,
      },
    },
  },
  amplitude: {
    id: 'amplitude', name: 'Amplitude',
    description: 'Analytics produit et événements Amplitude.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=amplitude.com&sz=128',
    icon: 'BarChart3', categories: ['Analytics', 'Product'],
    baseUrl: 'https://amplitude.com/api/2', authType: 'bearer',
    docsUrl: 'https://www.docs.developers.amplitude.com', website: 'https://amplitude.com', popularityRank: 92,
    actions: {
      listCharts: {
        id: 'listCharts', name: 'Cartes', description: 'Liste les interrogations sauvegardées.',
        method: 'GET', endpoint: '/savedquery',
        params: [], timeoutMs: 10000,
      },
    },
  },
  mixpanel: {
    id: 'mixpanel', name: 'Mixpanel',
    description: 'Analytics d\'événements produit Mixpanel.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=mixpanel.com&sz=128',
    icon: 'Activity', categories: ['Analytics', 'Product'],
    baseUrl: 'https://mixpanel.com/api/2.0', authType: 'bearer',
    docsUrl: 'https://developer.mixpanel.com/reference', website: 'https://mixpanel.com', popularityRank: 93,
    actions: {
      getEvents: {
        id: 'getEvents', name: 'Événements', description: 'Interroge les événements.',
        method: 'POST', endpoint: '/events',
        params: [], timeoutMs: 10000,
      },
    },
  },
  coinbase: {
    id: 'coinbase', name: 'Coinbase',
    description: 'Crypto : portefeuille, transactions, prix Coinbase.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=coinbase.com&sz=128',
    icon: 'CreditCard', categories: ['Finance', 'Payments'],
    baseUrl: 'https://api.coinbase.com/v2', authType: 'bearer',
    docsUrl: 'https://docs.cdp.coinbase.com', website: 'https://coinbase.com', popularityRank: 89,
    actions: {
      getPrices: {
        id: 'getPrices', name: 'Prix', description: 'Prix d\'une paire crypto.',
        method: 'GET', endpoint: '/prices/{currency}',
        params: [{ name: 'currency', type: 'string', required: true, description: 'Paire, ex: BTC-USD' }],
        urlParams: ['currency'], timeoutMs: 10000,
      },
    },
  },
  tidal_streaming: {
    id: 'tidal_streaming', name: 'Tidal',
    description: 'Musique : playlists et artistes Tidal.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=tidal.com&sz=128',
    icon: 'Music', categories: ['Media', 'Streaming'],
    baseUrl: 'https://api.tidal.com/v1', authType: 'bearer',
    docsUrl: 'https://developer.tidal.com', website: 'https://tidal.com', popularityRank: 94,
    actions: {
      search: {
        id: 'search', name: 'Recherche', description: 'Recherche artistes et titres.',
        method: 'GET', endpoint: '/search/legacy',
        params: [{ name: 'query', type: 'string', required: true, description: 'Recherche' }],
        timeoutMs: 10000,
      },
    },
  },
  shopify_orders: {
    id: 'shopify_orders', name: 'Shopify Orders',
    description: 'Gérer les commandes Shopify en profondeur.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=shopify.com&sz=128',
    icon: 'ShoppingCart', categories: ['Ecommerce', 'Finance'],
    baseUrl: 'https://{shop}.myshopify.com/admin/api/2025-01', authType: 'bearer',
    docsUrl: 'https://shopify.dev/docs/api/admin-rest', website: 'https://shopify.com', popularityRank: 95,
    actions: {
      listOrders: {
        id: 'listOrders', name: 'Lister les commandes', description: 'Liste les commandes du store.',
        method: 'GET', endpoint: '/orders.json',
        params: [{ name: 'shop', type: 'string', required: true, description: 'Nom du store' }],
        urlParams: ['shop'], timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // MEDIA & DIVER
  // ───────────────────────────────────────────────
  twitch: {
    id: 'twitch', name: 'Twitch',
    description: 'Gérer streams, clips et chat Twitch via Helix.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=twitch.tv&sz=128',
    icon: 'Video', categories: ['Streaming', 'Media'],
    baseUrl: 'https://api.twitch.tv/helix', authType: 'bearer',
    docsUrl: 'https://dev.twitch.tv/docs/api', website: 'https://twitch.tv', popularityRank: 30,
    actions: {
      getUsers: {
        id: 'getUsers', name: 'Infos utilisateur', description: 'Récupère les infos d\'un utilisateur.',
        method: 'GET', endpoint: '/users?login={login}',
        params: [{ name: 'login', type: 'string', required: true, description: 'Nom d\'utilisateur' }],
        urlParams: ['login'], timeoutMs: 10000,
      },
    },
  },
  spotify: {
    id: 'spotify', name: 'Spotify',
    description: 'Rechercher et gérer playlists, podcasts Spotify.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=spotify.com&sz=128',
    icon: 'Music', categories: ['Streaming', 'Media'],
    baseUrl: 'https://api.spotify.com/v1', authType: 'bearer',
    docsUrl: 'https://developer.spotify.com/documentation/web-api', website: 'https://spotify.com', popularityRank: 22,
    actions: {
      search: {
        id: 'search', name: 'Rechercher', description: 'Recherche titres, albums, artistes.',
        method: 'GET', endpoint: '/search',
        params: [
          { name: 'q', type: 'string', required: true, description: 'Requête' },
          { name: 'type', type: 'string', required: true, description: 'track/album/artist' },
        ],
        timeoutMs: 10000,
      },
    },
  },
  giphy: {
    id: 'giphy', name: 'GIPHY',
    description: 'Rechercher des GIF et autocollants GIPHY.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=giphy.com&sz=128',
    icon: 'ImageIcon', categories: ['Media', 'Marketing'],
    baseUrl: 'https://api.giphy.com/v1', authType: 'api_key_header',
    docsUrl: 'https://developers.giphy.com/docs', website: 'https://giphy.com', popularityRank: 60,
    actions: {
      searchGifs: {
        id: 'searchGifs', name: 'Rechercher des GIF', description: 'Recherche des GIF par mot-clé.',
        method: 'GET', endpoint: '/gifs/search',
        params: [{ name: 'q', type: 'string', required: true, description: 'Mot-clé' }],
        timeoutMs: 10000,
      },
    },
  },
  mastodon: {
    id: 'mastodon', name: 'Mastodon',
    description: 'Publier des toots et lire un flux Mastodon.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=mastodon.social&sz=128',
    icon: 'MessageSquare', categories: ['Social', 'Media'],
    baseUrl: 'https://mastodon.social/api/v1', authType: 'bearer',
    docsUrl: 'https://docs.joinmastodon.org/api', website: 'https://joinmastodon.org', popularityRank: 66,
    actions: {
      postStatus: {
        id: 'postStatus', name: 'Publier un toot', description: 'Publie un nouveau statut.',
        method: 'POST', endpoint: '/statuses',
        params: [
          { name: 'status', type: 'string', required: true, description: 'Contenu du toot' },
          { name: 'visibility', type: 'string', required: false, description: 'public/unlisted/private' },
        ],
        bodyParams: ['status', 'visibility'], timeoutMs: 12000,
      },
    },
  },
  bluesky: {
    id: 'bluesky', name: 'Bluesky',
    description: 'Publier des posts et lire le réseau Bluesky (AT Protocol).',
    logoUrl: 'https://www.google.com/s2/favicons?domain=bsky.social&sz=128',
    icon: 'Globe', categories: ['Social', 'Media'],
    baseUrl: 'https://api.bsky.social/xrpc', authType: 'bearer',
    docsUrl: 'https://docs.bsky.app/docs/api', website: 'https://bsky.social', popularityRank: 55,
    actions: {
      listRecords: {
        id: 'listRecords', name: 'Lister les posts', description: 'Liste les posts d\'un profil.',
        method: 'GET', endpoint: '/app.bsky.feed.getAuthorFeed?actor={actor}',
        params: [{ name: 'actor', type: 'string', required: true, description: 'Handle ou DID' }],
        urlParams: ['actor'], timeoutMs: 10000,
      },
    },
  },
  newsdata: {
    id: 'newsdata', name: 'NewsData.io',
    description: 'Actualités agrégees et recherche de news.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=newsdata.io&sz=128',
    icon: 'Globe', categories: ['Data', 'Media'],
    baseUrl: 'https://newsdata.io/api/1', authType: 'api_key_header',
    docsUrl: 'https://newsdata.io/documentation', website: 'https://newsdata.io', popularityRank: 72,
    actions: {
      latestNews: {
        id: 'latestNews', name: 'Dernières actualités', description: 'Récupère les dernières actualités.',
        method: 'GET', endpoint: '/news',
        params: [{ name: 'country', type: 'string', required: false, description: 'Code pays, ex: cm' }],
        timeoutMs: 10000,
      },
    },
  },
  wakatime: {
    id: 'wakatime', name: 'WakaTime',
    description: 'Suivi statistiques de temps de code WakaTime.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=wakatime.com&sz=128',
    icon: 'Activity', categories: ['Dev Tools', 'Analytics'],
    baseUrl: 'https://wakatime.com/api/v1', authType: 'bearer',
    docsUrl: 'https://wakatime.com/developers', website: 'https://wakatime.com', popularityRank: 74,
    actions: {
      getCurrentUser: {
        id: 'getCurrentUser', name: 'Utilisateur', description: 'Infos de l\'utilisateur WakaTime.',
        method: 'GET', endpoint: '/users/current',
        params: [], timeoutMs: 10000,
      },
    },
  },
  auth0: {
    id: 'auth0', name: 'Auth0',
    description: 'Gérer les utilisateurs et clients Auth0.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=auth0.com&sz=128',
    icon: 'Shield', categories: ['Security', 'Infrastructure'],
    baseUrl: 'https://{domain}.auth0.com/api/v2', authType: 'bearer',
    docsUrl: 'https://auth0.com/docs/api/management-api-v2', website: 'https://auth0.com', popularityRank: 42,
    actions: {
      listUsers: {
        id: 'listUsers', name: 'Utilisateurs', description: 'Liste les utilisateurs du tenant.',
        method: 'GET', endpoint: '/users',
        params: [{ name: 'domain', type: 'string', required: true, description: 'Domaine du tenant (tenant.auth0.com)' }],
        urlParams: ['domain'], timeoutMs: 10000,
      },
    },
  },
  okta: {
    id: 'okta', name: 'Okta',
    description: 'Gérer les utilisateurs et groupes Okta.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=okta.com&sz=128',
    icon: 'Shield', categories: ['Security', 'Enterprise'],
    baseUrl: 'https://{tenant}.okta.com/api/v1', authType: 'api_key_header',
    docsUrl: 'https://developer.okta.com/docs/api', website: 'https://okta.com', popularityRank: 48,
    actions: {
      listUsers: {
        id: 'listUsers', name: 'Utilisateurs', description: 'Liste les utilisateurs du tenant.',
        method: 'GET', endpoint: '/users',
        params: [{ name: 'tenant', type: 'string', required: true, description: 'Sous-domaine Okta' }],
        urlParams: ['tenant'], timeoutMs: 10000,
      },
    },
  },
  healthchecks: {
    id: 'healthchecks', name: 'Healthchecks',
    description: 'Moniteur de cron jobs et de santé.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=healthchecks.io&sz=128',
    icon: 'Activity', categories: ['Monitoring', 'Infrastructure'],
    baseUrl: 'https://healthchecks.io', authType: 'none',
    docsUrl: 'https://healthchecks.io/docs/api', website: 'https://healthchecks.io', popularityRank: 90,
    actions: {
      pingSuccess: {
        id: 'pingSuccess', name: 'Ping succès', description: 'Signale une exécution réussie.',
        method: 'GET', endpoint: '/api/v1/check/{checkUuid}',
        params: [{ name: 'checkUuid', type: 'string', required: true, description: 'UUID du check' }],
        urlParams: ['checkUuid'], timeoutMs: 10000,
      },
    },
  },

  // ───────────────────────────────────────────────
  // CDP & INTÉGRATION
  // ───────────────────────────────────────────────
  segment: {
    id: 'segment', name: 'Segment',
    description: 'Plateforme CDP : centraliser les événements et sources analytics.',
    logoUrl: 'https://www.google.com/s2/favicons?domain=segment.com&sz=128',
    icon: 'Database', categories: ['Analytics', 'Data'],
    baseUrl: 'https://api.segment.io/v1', authType: 'bearer',
    docsUrl: 'https://segment.com/docs/api', website: 'https://segment.com', popularityRank: 38,
    actions: {
      trackEvent: {
        id: 'trackEvent', name: 'Tracker un événement', description: 'Envoie un événement de suivi utilisateur.',
        method: 'POST', endpoint: '/track',
        params: [
          { name: 'event', type: 'string', required: true, description: 'Nom de l\'événement' },
          { name: 'userId', type: 'string', required: false, description: 'Identifiant utilisateur' },
          { name: 'properties', type: 'object', required: false, description: 'Propriétés de l\'événement' },
        ],
        bodyParams: ['event', 'userId', 'properties'], timeoutMs: 12000,
      },
    },
  },
};

/** Liste de toutes les catégories uniques du catalogue */
export const PLUGIN_CATEGORIES = Array.from(
  new Set(Object.values(PLUGIN_CATALOG).flatMap((p) => p.categories))
).sort();

export const getTotalPluginCount = () => Object.keys(PLUGIN_CATALOG).length;

export const getPlugin = (id: string): PluginCatalogEntry | null => PLUGIN_CATALOG[id] || null;

export const searchCatalog = (query: string, category?: string): PluginCatalogEntry[] => {
  const q = query.toLowerCase();
  return Object.values(PLUGIN_CATALOG).filter((p) =>
    (p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) &&
    (!category || p.categories.includes(category))
  );
};
